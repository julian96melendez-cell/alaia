'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const runner = require('../scripts/mongo-native-reconciliation-reader-integration');
const database = 'alaia_0123456789abcdef0123456789abcdef';
const env = (patch = {}) => ({ ALAIA_MONGO_TEST_DB: database, ALAIA_MONGO_TEST_CONFIRM: database, ALAIA_MONGO_TEST_URI: `mongodb+srv://alaia_integration_test:fixture%40only@fixture.mongodb.net/${database}?authSource=admin&w=majority`, ...patch });
const auth = (patch = {}) => ({ authInfo: { authenticatedUsers: [{ user: 'alaia_integration_test', db: 'admin' }], authenticatedUserRoles: [{ role: 'readWrite', db: database }], authenticatedUserPrivileges: [{ resource: { db: database, collection: '' }, actions: ['find', 'insert'] }], ...patch } });
test('native integration runner: import is inert and rejects missing configuration without loading clients or starting services', () => {
  const modulePath = path.resolve(__dirname, '../scripts/mongo-native-reconciliation-reader-integration.js');
  const result = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict'), Module = require('node:module'), load = Module._load;
    Module._load = function(id, ...args) {
      if (/^(mongodb|mongoose|express|stripe|firebase-admin)(\\/|$)/.test(id) || /src\\/models/.test(id)) throw Error('Unexpected service load');
      return load.call(this, id, ...args);
    };
    require('node:net').Socket.prototype.connect = () => { throw Error('Unexpected connection'); };
    const runner = require(${JSON.stringify(modulePath)});
    runner.main({}).then(() => process.exitCode = 1, error => assert.equal(runner.formatFailure(error).failedStage, 'configuration'));
  `], { env: {}, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
});
test('native integration runner: unsafe configurations reject before driver construction or connection', async () => {
  const patches = [
    { ALAIA_MONGO_TEST_URI: undefined }, { ALAIA_MONGO_TEST_DB: 'backendmulti' }, { ALAIA_MONGO_TEST_CONFIRM: 'wrong' },
    { ALAIA_MONGO_TEST_DB: database.toUpperCase() }, { ALAIA_MONGO_TEST_DB: 'alaia_' + 'a'.repeat(31) },
    { MONGO_URI: 'synthetic-private' }, { MONGODB_URI: 'synthetic-private' }, { DATABASE_URL: 'synthetic-private' },
    { STRIPE_SECRET_KEY: 'synthetic-private' }, { FIREBASE_SERVICE_ACCOUNT_JSON: 'synthetic-private' },
    { NODE_ENV: 'production' }, { NODE_ENV: 'PRODUCTION' },
    { ALAIA_RECONCILIATION_NATIVE_READER_ENABLED: 'true' }, { MONGODB_LOG_COMMAND: 'debug' },
  ];
  for (const uri of [
    `mongodb://alaia_integration_test:fixture@fixture.mongodb.net/${database}`,
    `mongodb+srv://production_user:fixture@fixture.mongodb.net/${database}`,
    `mongodb+srv://alaia_integration_test:fixture@fixture.example/${database}`,
    `mongodb+srv://alaia_integration_test@fixture.mongodb.net/${database}`,
    `mongodb+srv://alaia_integration_test:fixture@fixture.mongodb.net/backendmulti`,
    env().ALAIA_MONGO_TEST_URI + '&tls=false', env().ALAIA_MONGO_TEST_URI + '&w=1',
    env().ALAIA_MONGO_TEST_URI + '&authSource=admin', env().ALAIA_MONGO_TEST_URI + '&directConnection=true',
    env().ALAIA_MONGO_TEST_URI + '#synthetic-private',
  ]) patches.push({ ALAIA_MONGO_TEST_URI: uri });
  for (const db of ['alaia_integration_ef588efb1b388be659120f9c1b6254cc', 'alaia_78943cf524ef883d31e9628163931fe8', 'alaia_ba98fd0d1a69e51e79c3bd384d23916c', 'alaia_faf7a4d2651ecd5fb67539a6eb5889ad']) patches.push({ ALAIA_MONGO_TEST_DB: db, ALAIA_MONGO_TEST_CONFIRM: db, ALAIA_MONGO_TEST_URI: env().ALAIA_MONGO_TEST_URI.replace(database, db) });
  for (const patch of patches) {
    let imports = 0;
    await assert.rejects(runner.main(env(patch), { loadDriver() { imports++; assert.fail('Must not load driver'); } }), error => {
      const summary = runner.formatFailure(error); assert.equal(summary.failedStage, 'configuration');
      assert.doesNotMatch(JSON.stringify(summary) + error.message, /synthetic-private|mongodb(?:\+srv)?:\/\//); return true;
    }); assert.equal(imports, 0);
  }
  assert.equal(runner.validateConfig(env()).db, database);
});
function fakeClient({ roles, collections = [], identity = database, hello, closeError } = {}) {
  const calls = []; let client;
  class MongoClient {
    constructor() { client = this; calls.push('construct'); }
    async connect() { calls.push('connect'); }
    db(name) { calls.push('db:' + name); return { databaseName: identity,
      admin: () => ({ command: async cmd => { calls.push(cmd.connectionStatus ? 'privileges' : 'hello'); return cmd.connectionStatus ? auth(roles ? { authenticatedUserRoles: roles } : {}) : hello || { setName: 'fixture', isWritablePrimary: true, logicalSessionTimeoutMinutes: 30, maxWireVersion: 13 }; } }),
      listCollections: () => ({ toArray: async () => { calls.push('list'); return collections; }, close: async () => { calls.push('cursor:close'); } }),
      createCollection: async () => { calls.push('write'); throw Error('Synthetic provisioning failure'); },
    }; }
    async close() { calls.push('client:close'); if (closeError) throw Error('synthetic-private'); }
  }
  return { driver: { MongoClient }, calls, get client() { return client; } };
}
test('native integration runner: confirmed consumed database rejects before client construction even with no collections', async () => {
  const consumed = 'alaia_2754d1782faf11ea3681d2eeed70bc47';
  const input = env({ ALAIA_MONGO_TEST_DB: consumed, ALAIA_MONGO_TEST_CONFIRM: consumed,
    ALAIA_MONGO_TEST_URI: env().ALAIA_MONGO_TEST_URI.replace(database, consumed) });
  const fake = fakeClient({ collections: [], identity: consumed });
  let loads = 0;
  await assert.rejects(runner.main(input, { loadDriver() { loads++; return fake.driver; } }), error => {
    const result = runner.formatFailure(error);
    assert.equal(result.failedStage, 'configuration');
    assert.equal(result.claimAttempted, false);
    assert.equal(result.markerAcknowledged, false);
    assert.deepEqual(result.passed, []);
    return true;
  });
  assert.equal(loads, 0);
  assert.deepEqual(fake.calls, []);
  assert.equal(fake.client, undefined);
});
for (const [name, options] of [
  ['foreign identity', { identity: 'backendmulti' }],
  ['broad role', { roles: [{ role: 'readWriteAnyDatabase', db: 'admin' }] }],
  ['previous role', { roles: [{ role: 'readWrite', db: 'alaia_faf7a4d2651ecd5fb67539a6eb5889ad' }] }],
  ['existing empty collection', { collections: [{ name: 'empty' }] }],
  ['missing snapshot capability', { hello: { isWritablePrimary: true } }],
]) test('native integration runner: preflight rejects ' + name + ' before writes and awaits cleanup', async () => {
  const fake = fakeClient(options);
  await assert.rejects(runner.main(env(), { loadDriver: () => fake.driver }), error => runner.formatFailure(error).failedStage === 'read-only preflight');
  assert.equal(fake.calls.includes('write'), false); assert.equal(fake.calls.at(-1), 'client:close');
  assert.ok(fake.calls.every(call => !call.includes('db:backendmulti')));
});
test('native integration runner: claim attempt is never reused and failed cleanup remains redacted', async () => {
  const fresh = 'alaia_11111111111111111111111111111111', input = env({ ALAIA_MONGO_TEST_DB: fresh, ALAIA_MONGO_TEST_CONFIRM: fresh, ALAIA_MONGO_TEST_URI: env().ALAIA_MONGO_TEST_URI.replace(database, fresh) });
  let closes = 0, writes = 0;
  class Client {
    async connect() {}
    db() { return { databaseName: fresh, admin: () => ({ command: async cmd => cmd.connectionStatus ? { authInfo: { ...auth().authInfo, authenticatedUserRoles: [{ role: 'readWrite', db: fresh }], authenticatedUserPrivileges: [{ resource: { db: fresh, collection: '' }, actions: ['find'] }] } } : { setName: 'fixture', isWritablePrimary: true, logicalSessionTimeoutMinutes: 30, maxWireVersion: 13 } }), listCollections: () => ({ toArray: async () => [], close: async () => {} }), createCollection: async () => { writes++; throw Error('synthetic-private'); } }; }
    async close() { closes++; throw Error('synthetic-private'); }
  }
  await assert.rejects(runner.main(input, { loadDriver: () => ({ MongoClient: Client }) }), error => {
    assert.equal(runner.formatFailure(error).failedStage, 'permanent single-use claim'); assert.equal(runner.formatFailure(error).syntheticDataRetained, true); return true;
  });
  await assert.rejects(runner.main(input, { loadDriver: () => assert.fail('Consumed base must not connect') }), error => runner.formatFailure(error).failedStage === 'configuration');
  assert.equal(closes, 1); assert.equal(writes, 1);
});
test('native integration runner: effective privileges reject every cross-database or cluster resource', () => {
  for (const resource of [{ db: 'backendmulti', collection: '' }, { anyResource: true }, { cluster: true }, { db: '', collection: '' }]) assert.throws(() => runner.validatePrivileges(auth({ authenticatedUserPrivileges: [{ resource, actions: ['find'] }] }), database));
});
test('native integration runner: cursor instrumentation preserves internal driver cleanup and awaits external close', async () => {
  const { EventEmitter } = require('node:events');
  let internalClosed = 0, externalClosed = 0, endCount = 0;
  class Client extends EventEmitter {
    constructor(uri, options) { super(); this.options = options; }
    startSession() { return { client: this, endSession: async () => { endCount++; } }; }
    db() { return { collection: () => ({ find(filter, options) {
      return { limit() { return this; }, async next() { await this.close(); return { fixture: true }; }, async close() { internalClosed++; } };
    }, aggregate() { throw Error('Not used'); } }) }; }
  }
  const instrumented = runner.instrumentDriver({ MongoClient: Client }), client = new instrumented.driver.MongoClient('synthetic', { dbName: database });
  const session = client.startSession(), cursor = client.db(database).collection('native_cases').find({}, { session, timeoutMS: 100, maxTimeMS: 100 }).limit(1);
  assert.deepEqual(await cursor.next(), { fixture: true }); assert.equal(internalClosed, 1);
  assert.equal(instrumented.metrics.cursors, 1); // Caller cleanup still pending.
  await cursor.close(); await cursor.close(); externalClosed = internalClosed - 1;
  assert.equal(externalClosed, 2); assert.equal(instrumented.metrics.cursors, 0);
  await session.endSession(); await session.endSession(); assert.equal(endCount, 2); assert.equal(instrumented.metrics.sessions, 0);
  assert.equal(instrumented.metrics.options[0].ownedSession, true);
});
test('native integration runner: failed read retains its instrumented cursor until explicit sequential cleanup', async () => {
  const { EventEmitter } = require('node:events'); let closed = false;
  class Client extends EventEmitter {
    constructor(uri, options) { super(); this.options = options; }
    db() { return { collection: () => ({ find() { return { async next() { throw Error('synthetic-private'); }, async close() { closed = true; } }; }, aggregate() {} }) }; }
  }
  const h = runner.instrumentDriver({ MongoClient: Client }), client = new h.driver.MongoClient('synthetic', { dbName: database });
  const cursor = client.db(database).collection('native_cases').find({}, { timeoutMS: 100, maxTimeMS: 100, session: { client } });
  await assert.rejects(cursor.next()); assert.equal(closed, false); assert.equal(h.metrics.cursors, 1);
  await cursor.close(); assert.equal(closed, true); assert.equal(h.metrics.cursors, 0);
});
test('native integration runner: preflight cursor failure still awaits cursor close and does not claim database', async () => {
  let cursorClosed = false, clientClosed = false;
  class Client {
    async connect() {}
    db() { return { databaseName: database, admin: () => ({ command: async cmd => cmd.connectionStatus ? auth() : { setName: 'fixture', isWritablePrimary: true, logicalSessionTimeoutMinutes: 30, maxWireVersion: 13 } }), listCollections: () => ({ toArray: async () => { throw Error('synthetic-private'); }, close: async () => { cursorClosed = true; } }), createCollection: () => assert.fail('No writes') }; }
    async close() { assert.equal(cursorClosed, true); clientClosed = true; }
  }
  await assert.rejects(runner.main(env(), { loadDriver: () => ({ MongoClient: Client }) }), error => runner.formatFailure(error).failedStage === 'read-only preflight');
  assert.equal(clientClosed, true);
});
test('native integration runner: no deletion, index application or production bootstrap code is included', () => {
  const fs = require('node:fs'), source = fs.readFileSync(path.join(__dirname, '../scripts/mongo-native-reconciliation-reader-integration.js'), 'utf8');
  assert.doesNotMatch(source, /\.(?:dropDatabase|dropCollection|deleteMany|deleteOne|createIndex|syncIndexes)\s*\(/);
  assert.doesNotMatch(source, /require\(['"](?:dotenv|express|stripe|firebase-admin|.*src\/models\/|.*server\.js)/);
  assert.match(source, /_id: 'single-use'/); assert.match(source, /doNotReuseDatabase: true/);
});
test('native integration runner: CLI rejects missing configuration with nonzero exit and redacted JSON', () => {
  const filename = path.resolve(__dirname, '../scripts/mongo-native-reconciliation-reader-integration.js');
  const result = spawnSync(process.execPath, [filename], { env: {}, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 1); assert.equal(result.stdout, '');
  const summary = JSON.parse(result.stderr);
  assert.equal(summary.status, 'failed'); assert.equal(summary.failedStage, 'configuration'); assert.deepEqual(summary.passed, []);
  assert.equal(summary.remoteTermination, 'not_verified');
  assert.doesNotMatch(result.stderr, /mongodb(?:\+srv)?:\/\/|password|stack|synthetic-private/);
});
test('native integration runner: durable marker precedes fixtures, survives seeding failure and blocks reuse in a fresh module', async () => {
  const fs = require('node:fs'), vm = require('node:vm'), { createRequire } = require('node:module');
  const filename = path.resolve(__dirname, '../scripts/mongo-native-reconciliation-reader-integration.js'), localRequire = createRequire(filename);
  const state = new Map(), calls = [], fresh = 'alaia_22222222222222222222222222222222';
  const input = env({ ALAIA_MONGO_TEST_DB: fresh, ALAIA_MONGO_TEST_CONFIRM: fresh, ALAIA_MONGO_TEST_URI: env().ALAIA_MONGO_TEST_URI.replace(database, fresh) });
  class Client {
    async connect() { calls.push('connect'); }
    db() { return { databaseName: fresh,
      admin: () => ({ command: async cmd => cmd.connectionStatus ? { authInfo: { ...auth().authInfo, authenticatedUserRoles: [{ role: 'readWrite', db: fresh }], authenticatedUserPrivileges: [{ resource: { db: fresh, collection: '' }, actions: ['find', 'insert'] }] } } : { setName: 'fixture', isWritablePrimary: true, logicalSessionTimeoutMinutes: 30, maxWireVersion: 13 } }),
      listCollections: () => ({ toArray: async () => [...state.keys()].map(name => ({ name })), close: async () => {} }),
      createCollection: async name => { calls.push('create:' + name); state.set(name, []); },
      collection: name => ({ insertOne: async (doc, options) => { calls.push('insert:' + name); assert.equal(options.writeConcern.w, 'majority'); state.get(name).push(doc); }, insertMany: async () => { calls.push('seed'); assert.equal(state.get('alaia_native_reader_run')[0].doNotReuseDatabase, true); throw Error('synthetic-private'); } }),
    }; }
    async close() { calls.push('close'); }
  }
  const load = () => {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, require: localRequire, process: { env: {} }, URL, Set, WeakMap, setTimeout, clearTimeout });
    return module.exports;
  };
  const first = load();
  await assert.rejects(first.main(input, { loadDriver: () => ({ MongoClient: Client, ObjectId: require('mongodb').ObjectId }) }), error => { const summary = first.formatFailure(error); assert.equal(summary.markerAcknowledged, true); return summary.failedStage === 'synthetic fixtures'; });
  assert.equal(state.get('alaia_native_reader_run')[0]._id, 'single-use');
  assert.ok(calls.indexOf('insert:alaia_native_reader_run') < calls.indexOf('seed'));
  const writes = calls.filter(call => /^(create:|insert:|seed)/.test(call)).length, second = load();
  await assert.rejects(second.main(input, { loadDriver: () => ({ MongoClient: Client }) }), error => second.formatFailure(error).failedStage === 'read-only preflight');
  assert.equal(calls.filter(call => /^(create:|insert:|seed)/.test(call)).length, writes);
  assert.equal(state.get('alaia_native_reader_run').length, 1); assert.equal(calls.at(-1), 'close');
});
test('native integration runner: snapshot writer session acquisition failure still awaits the pending reader before shutdown', async () => {
  const now = new Date('2026-01-01T00:00:00Z'), dto = { version: 1, auditTotal: 1, source: { updatedAt: now.toISOString() } };
  let details = 0, pending = false, readerCloses = 0, comparatorCloses = 0;
  const failure = Error('Synthetic session acquisition failure');
  const reader = { connect: async () => {}, stats: () => ({ operations: 0, pendingReads: 0, openSessions: 0 }),
    handlers: {
      list: async (req, res) => { res.json({ data: { items: [], total: 0 } }); },
      detail: async (req, res) => { if (++details === 4) { pending = true; await new Promise(resolve => setImmediate(resolve)); pending = false; } res.json({ data: dto }); },
    }, close: async () => { assert.equal(pending, false, 'Shutdown must not skip pending reader work'); readerCloses++; },
  };
  const db = { client: { startSession() { throw failure; } }, collection: () => ({ find: () => ({ sort() { return this; }, toArray: async () => [], close: async () => {} }) }) };
  await assert.rejects(runner.runTrials({ db, setup: { now, key: 'fixture-order', eventKey: 'fixture-event', historicalKey: 'fixture-historical' }, config: { uri: 'synthetic', db: database }, driver: { MongoClient: class {} }, report() {},
    makeReader: () => reader, makeReference: async () => ({ service: { list: async () => ({ items: [], total: 0 }), detail: async () => dto }, close: async () => { comparatorCloses++; } }),
  }), error => error === failure);
  assert.equal(details, 4); assert.equal(pending, false); assert.equal(readerCloses, 1); assert.equal(comparatorCloses, 1);
});
test('native integration runner: CLI partial claim failure emits only failed JSON and sets nonzero exit', async () => {
  const fs = require('node:fs'), vm = require('node:vm'), { createRequire } = require('node:module');
  const filename = path.resolve(__dirname, '../scripts/mongo-native-reconciliation-reader-integration.js'), realRequire = createRequire(filename), module = { exports: {} };
  const fake = fakeClient(), processState = { env: env(), exitCode: 0 }, errors = [], successes = [];
  const localRequire = name => name === 'mongodb' ? fake.driver : realRequire(name); localRequire.main = module;
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, require: localRequire, process: processState, URL, Set, WeakMap, setTimeout, clearTimeout, console: { log: value => successes.push(value), error: value => errors.push(value) } });
  for (let index = 0; index < 100 && processState.exitCode === 0; index++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(processState.exitCode, 1); assert.deepEqual(successes, []); assert.equal(errors.length, 1);
  const summary = JSON.parse(errors[0]); assert.equal(summary.status, 'failed'); assert.equal(summary.failedStage, 'permanent single-use claim'); assert.equal(summary.markerAcknowledged, false);
  assert.deepEqual(summary.passed, []); assert.equal(summary.doNotReuseDatabase, true);
  assert.doesNotMatch(errors[0], /synthetic-private|mongodb(?:\+srv)?:\/\/|stack/);
  assert.equal(fake.calls.at(-1), 'client:close');
});
