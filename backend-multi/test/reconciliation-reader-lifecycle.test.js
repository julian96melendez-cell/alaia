'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createReconciliationReaderLifecycle: lifecycle } = require('../src/services/reconciliationReaderLifecycle');
const { createAdminReconciliationRouter } = require('../src/routes/adminReconciliationRoutes');
const gate = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
test('reader lifecycle: disabled defaults never construct clients; invalid flag fails explicitly', async () => {
  for (const env of [{}, { ALAIA_RECONCILIATION_NATIVE_READER_ENABLED: 'false' }]) {
    const reader = lifecycle({ env, createReader: () => assert.fail('unexpected reader') });
    await reader.initialize(); assert.equal(reader.handlers(), undefined); await reader.close();
  }
  assert.throws(() => lifecycle({ env: { ALAIA_RECONCILIATION_NATIVE_READER_ENABLED: '' } }));
});
test('reader lifecycle: one fixed selection, one initialization and awaited connection before handlers', async () => {
  const wait = gate(); let created = 0, connects = 0, closed = 0;
  const env = { ALAIA_RECONCILIATION_NATIVE_READER_ENABLED: 'true' };
  const handlers = { list() {}, detail() {} };
  const reader = lifecycle({ env, createReader: () => { created++; return { handlers, connect: async () => { connects++; await wait.promise; }, close: async () => { closed++; } }; } });
  const init = reader.initialize({}); assert.equal(reader.initialize({}), init);
  env.ALAIA_RECONCILIATION_NATIVE_READER_ENABLED = 'false';
  assert.throws(() => reader.handlers()); wait.resolve(); await init;
  assert.equal(reader.handlers(), handlers); assert.equal(created, 1); assert.equal(connects, 1);
  const close = reader.close(); assert.equal(reader.close(), close); await close; assert.equal(closed, 1); assert.throws(() => reader.handlers());
});
test('reader lifecycle: failed connection cannot expose fallback or construct another reader', async () => {
  let created = 0, closed = 0;
  const reader = lifecycle({ env: { ALAIA_RECONCILIATION_NATIVE_READER_ENABLED: 'true' }, createReader: () => { created++; return { connect: async () => { throw Error('PRIVATE'); }, close: async () => { closed++; } }; } });
  await assert.rejects(reader.initialize({})); await assert.rejects(reader.initialize({}));
  assert.throws(() => reader.handlers()); await reader.close(); assert.equal(created, 1); assert.equal(closed, 1);
});
test('reader lifecycle: shutdown during initialization closes admission and awaits pending cleanup', async () => {
  const connection = gate(), cleanup = gate(); let settled = false, closing = false;
  const reader = lifecycle({ env: { ALAIA_RECONCILIATION_NATIVE_READER_ENABLED: 'true' }, createReader: () => ({ connect: () => connection.promise, close: () => { closing = true; return cleanup.promise; } }) });
  const init = reader.initialize({}); const failed = assert.rejects(init);
  const close = reader.close(); close.then(() => { settled = true; });
  assert.equal(closing, true); assert.throws(() => reader.handlers()); await Promise.resolve(); assert.equal(settled, false);
  connection.resolve(); await failed; assert.equal(settled, false); cleanup.resolve(); await close;
});
test('reader lifecycle: late cleanup error remains generic, memoized and no restart is allowed', async () => {
  const reader = lifecycle({ env: { ALAIA_RECONCILIATION_NATIVE_READER_ENABLED: 'true' }, createReader: () => ({ connect: async () => {}, handlers: {}, close: async () => { throw Error('PRIVATE'); } }) });
  await reader.initialize({}); const close = reader.close(); await assert.rejects(close, /Reconciliation reader cleanup failed/);
  assert.equal(reader.close(), close); await assert.rejects(reader.initialize({}));
});
test('router factory: both modes preserve auth ordering and POST controller; selection is fixed', () => {
  const auth = { proteger() {}, soloAdmin() {} }, controller = { list() {}, detail() {}, review() {} };
  const native = { list() {}, detail() {} };
  for (const readHandlers of [undefined, native]) {
    const records = []; const express = { Router: () => ({ use: (...args) => records.push(['auth', ...args]), get: (...args) => records.push(['get', ...args]), post: (...args) => records.push(['post', ...args]) }) };
    createAdminReconciliationRouter({ auth, controller, readHandlers, express });
    assert.deepEqual(records[0], ['auth', auth.proteger, auth.soloAdmin]);
    assert.equal(records[1][2], (readHandlers || controller).list);
    assert.equal(records[2][2], (readHandlers || controller).detail);
    assert.equal(records[3].at(-1), controller.review);
  }
});

test('server integration: shutdown awaits native cleanup even after HTTP closes; watchdog is forced exit', async () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const source = fs.readFileSync(require('node:path').join(__dirname, '../server.js'), 'utf8');
  const start = source.indexOf('function gracefulShutdown('), end = source.indexOf('\nprocess.on("SIGINT"', start);
  const cleanup = gate(), exits = [], logs = []; let watchdog, httpClosed = false, stops = 0;
  const context = { shuttingDown: false, shutdownExitCode: 0, workers: { stopWorkers() { stops++; } },
    reconciliationReader: { close: () => cleanup.promise },
    server: { close(callback) { httpClosed = true; callback(); } },
    process: { exit: code => exits.push(code) }, console: { log: message => logs.push(message), error: message => logs.push(message) },
    clearTimeout() {}, setTimeout: fn => { watchdog = fn; return { unref() {} }; }, Promise };
  vm.runInNewContext(source.slice(start, end), context);
  context.gracefulShutdown('SIGTERM'); context.gracefulShutdown('SIGINT');
  await Promise.resolve(); assert.equal(httpClosed, true); assert.equal(stops, 1); assert.deepEqual(exits, []);
  watchdog(); assert.deepEqual(exits, [1]); assert.ok(logs.some(line => line.includes('remote termination unverified')));
  cleanup.resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(logs.some(line => line.includes('closed cleanly')), false);
  assert.deepEqual(exits, [1]);
});
test('server integration: native initialization precedes workers and HTTP; signals precede initialization', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../server.js'), 'utf8');
  const signal = source.indexOf('process.on("SIGINT"'), main = source.indexOf('await conectarDB()');
  const native = source.indexOf('await reconciliationReader.initialize'), workers = source.indexOf('workers.startWorkers()'), listen = source.indexOf('server = app.listen');
  assert.ok(signal < main && main < native && native < workers && workers < listen);
  assert.ok(source.includes('if (shuttingDown) return;'));
  assert.ok(source.includes('createReadinessHandler(mongoose.connection)'));
});

test('server integration: failed native initialization never opens HTTP or starts optional workers', async () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const source = fs.readFileSync(require('node:path').join(__dirname, '../server.js'), 'utf8');
  const start = source.lastIndexOf('(async () => {'), end = source.indexOf('\nmodule.exports = app;', start);
  const calls = [];
  const context = { conectarDB: async () => calls.push('main'), shuttingDown: false,
    reconciliationReader: { enabled: true, initialize: async () => { calls.push('native'); throw Error('PRIVATE'); }, handlers: () => assert.fail('No fallback') },
    mongoose: { connection: { name: 'fixture' } }, require: () => ({ collection: { name: 'fixture' } }),
    process: { env: { API_WORKERS_ENABLED: 'true' } }, console: { error: text => calls.push(text) },
    app: { listen: () => assert.fail('Must not listen') },
    createAdminReconciliationRouter: () => assert.fail('Must not select fallback'), gracefulShutdown: () => calls.push('shutdown') };
  await vm.runInNewContext(source.slice(start, end), context);
  assert.deepEqual(calls, ['main', 'native', 'FATAL: startup failed', 'shutdown']);
});
test('server integration: HTTP close error still awaits reader cleanup before exiting', async () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const source = fs.readFileSync(require('node:path').join(__dirname, '../server.js'), 'utf8');
  const start = source.indexOf('function gracefulShutdown('), end = source.indexOf('\nprocess.on("SIGINT"', start);
  const cleanup = gate(), exits = [];
  const context = { shuttingDown: false, shutdownExitCode: 0, workers: null, reconciliationReader: { close: () => cleanup.promise },
    server: { close: callback => callback(Error('PRIVATE')) }, process: { exit: code => exits.push(code) },
    console: { log() {}, error() {} }, clearTimeout() {}, setTimeout: () => ({ unref() {} }), Promise };
  vm.runInNewContext(source.slice(start, end), context); context.gracefulShutdown('SIGTERM');
  await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(exits, []);
  cleanup.resolve(); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(exits, [1]);
});


test('reader lifecycle: synchronous close failure is generic, memoized and never retried', async () => {
  let closes = 0;
  const reader = lifecycle({ env: { ALAIA_RECONCILIATION_NATIVE_READER_ENABLED: 'true' }, createReader: () => ({
    connect: async () => {}, handlers: {}, close() { closes++; throw Error('PRIVATE_CLOSE'); }
  }) });
  await reader.initialize({});
  const close = reader.close(); assert.equal(reader.close(), close);
  await assert.rejects(close, error => error.message === 'Reconciliation reader cleanup failed');
  assert.equal(closes, 1); await assert.rejects(reader.initialize({}));
});

test('server integration: late startup error upgrades signal shutdown without duplicate closures', async () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const source = fs.readFileSync(require('node:path').join(__dirname, '../server.js'), 'utf8');
  const start = source.indexOf('function gracefulShutdown('), end = source.indexOf('\nprocess.on("SIGINT"', start);
  const cleanup = gate(), exits = []; let closes = 0;
  const context = { shuttingDown: false, shutdownExitCode: 0, workers: null,
    reconciliationReader: { close() { closes++; return cleanup.promise; } }, server: undefined,
    process: { exit: code => exits.push(code) }, console: { log() {}, error() {} },
    clearTimeout() {}, setTimeout: () => ({ unref() {} }), Promise };
  vm.runInNewContext(source.slice(start, end), context);
  context.gracefulShutdown('SIGTERM'); context.gracefulShutdown('startup failure', 1); context.gracefulShutdown('SIGINT');
  assert.equal(closes, 1); assert.deepEqual(exits, []);
  cleanup.resolve(); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(exits, [1]);
});

for (const failure of [false, true]) test('server integration: signal during native initialization prevents workers and listen after ' + (failure ? 'failure' : 'completion'), async () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const source = fs.readFileSync(require('node:path').join(__dirname, '../server.js'), 'utf8');
  const start = source.lastIndexOf('(async () => {'), end = source.indexOf('\nmodule.exports = app;', start);
  const connection = gate(), calls = [];
  const context = { conectarDB: async () => calls.push('main'), shuttingDown: false,
    reconciliationReader: { enabled: true, initialize: async () => { calls.push('native'); await connection.promise; if (failure) throw Error('PRIVATE'); }, handlers: () => assert.fail('Must not select routes') },
    mongoose: { connection: { name: 'fixture' } }, require: () => ({ collection: { name: 'fixture' } }),
    process: { env: { API_WORKERS_ENABLED: 'true' } }, console: { error: text => calls.push(text) },
    app: { listen: () => assert.fail('Must not listen') },
    createAdminReconciliationRouter: () => assert.fail('Must not fallback'), gracefulShutdown: () => calls.push('shutdown') };
  const running = vm.runInNewContext(source.slice(start, end), context);
  await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(calls, ['main', 'native']);
  context.shuttingDown = true; connection.resolve(); await running;
  assert.deepEqual(calls, failure ? ['main', 'native', 'FATAL: startup failed', 'shutdown'] : ['main', 'native']);
});

test('server integration: clean shutdown waits both HTTP and reader and exits once', async () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const source = fs.readFileSync(require('node:path').join(__dirname, '../server.js'), 'utf8');
  const start = source.indexOf('function gracefulShutdown('), end = source.indexOf('\nprocess.on("SIGINT"', start);
  const cleanup = gate(), exits = [], logs = []; let finishHTTP, watchdog, closes = 0;
  const context = { shuttingDown: false, shutdownExitCode: 0, workers: null,
    reconciliationReader: { close() { closes++; return cleanup.promise; } }, server: { close(callback) { finishHTTP = callback; } },
    process: { exit: code => exits.push(code) }, console: { log: text => logs.push(text), error: text => logs.push(text) },
    clearTimeout() {}, setTimeout: callback => { watchdog = callback; return { unref() {} }; }, Promise };
  vm.runInNewContext(source.slice(start, end), context);
  context.gracefulShutdown('SIGTERM'); context.gracefulShutdown('SIGINT');
  cleanup.resolve(); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(exits, []);
  finishHTTP(); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(exits, [0]);
  assert.equal(closes, 1); assert.equal(logs.filter(text => text.includes('closed cleanly')).length, 1);
  watchdog(); assert.deepEqual(exits, [0]);
});

for (const flag of [undefined, 'false', 'true']) test('server integration: startup in mode ' + String(flag) + ' uses fixed selection and preserves existing service order', async () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const source = fs.readFileSync(require('node:path').join(__dirname, '../server.js'), 'utf8');
  const start = source.lastIndexOf('(async () => {'), end = source.indexOf('\nmodule.exports = app;', start);
  const connection = gate(), calls = []; let creates = 0;
  const env = flag === undefined ? {} : { ALAIA_RECONCILIATION_NATIVE_READER_ENABLED: flag };
  const owner = lifecycle({ env, createReader: () => { creates++; return {
    connect: async () => { calls.push('native:start'); await connection.promise; calls.push('native:ready'); },
    close: async () => {}, handlers: { list() {}, detail() {} }
  }; } });
  const context = { conectarDB: async () => calls.push('main'), shuttingDown: false, reconciliationReader: owner,
    mongoose: { connection: { name: 'fixture' } },
    require: name => name === './src/workers' ? { startWorkers: () => calls.push('workers') } : { collection: { name: 'fixture' } },
    process: { env: { API_WORKERS_ENABLED: 'true' }, on() {} }, console: { error() {}, warn() {} },
    app: { listen() { calls.push('listen'); return { setTimeout() {}, on() {} }; } }, PORT: 0,
    createAdminReconciliationRouter: ({ readHandlers }) => { assert.equal(Boolean(readHandlers), flag === 'true'); return {}; },
    gracefulShutdown: () => assert.fail('Unexpected startup shutdown') };
  const running = vm.runInNewContext(source.slice(start, end), context);
  await new Promise(resolve => setImmediate(resolve));
  if (flag === 'true') { assert.deepEqual(calls, ['main', 'native:start']); connection.resolve(); }
  await running;
  assert.deepEqual(calls, flag === 'true' ? ['main', 'native:start', 'native:ready', 'workers', 'listen'] : ['main', 'workers', 'listen']);
  assert.equal(creates, flag === 'true' ? 1 : 0); await owner.close();
});

test('reader lifecycle: closed before initialization cannot construct clients or reopen', async () => {
  const reader = lifecycle({ env: { ALAIA_RECONCILIATION_NATIVE_READER_ENABLED: 'true' }, createReader: () => assert.fail('Unexpected client') });
  const close = reader.close(); assert.equal(reader.close(), close); await close;
  await assert.rejects(reader.initialize({})); assert.throws(() => reader.handlers());
});

test('reader lifecycle: factory failure is memoized without retrying partial initialization', async () => {
  let creates = 0;
  const reader = lifecycle({ env: { ALAIA_RECONCILIATION_NATIVE_READER_ENABLED: 'true' }, createReader: () => { creates++; throw Error('PRIVATE_FACTORY'); } });
  const init = reader.initialize({}); assert.equal(reader.initialize({}), init); await assert.rejects(init);
  await reader.close(); assert.equal(creates, 1); assert.throws(() => reader.handlers());
});

test('reader lifecycle: fresh import and disabled construction do not load driver or schedule work', () => {
  const { spawnSync } = require('node:child_process');
  const filename = require('node:path').resolve(__dirname, '../src/services/reconciliationReaderLifecycle.js');
  const result = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict'), Module = require('node:module'), original = Module._load;
    Module._load = function(name, ...args) {
      if (/^(mongodb|mongoose|express|stripe|firebase-admin)(\\/|$)/.test(name)) throw Error('Unexpected infrastructure import');
      return original.call(this, name, ...args);
    };
    require('node:net').Socket.prototype.connect = () => { throw Error('Unexpected connection'); };
    global.setTimeout = global.setInterval = global.queueMicrotask = () => { throw Error('Unexpected scheduled work'); };
    const { createReconciliationReaderLifecycle } = require(${JSON.stringify(filename)});
    assert.equal(createReconciliationReaderLifecycle({ env: {} }).enabled, false);
  `], { env: {}, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
});
