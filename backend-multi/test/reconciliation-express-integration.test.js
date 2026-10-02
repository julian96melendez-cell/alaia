'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), util = require('node:util');
const http = require('node:http');
const { fixture, BASE, KEY, EVENT, ADMIN, CLIENT, ORIGIN, COOKIE } = require('./reconciliationExpressHarness');
const { isReconciliationRequest, reconciliationErrorLog } = require('../src/middleware/reconciliationLogging');
const gate = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const until = async check => { for (let i = 0; i < 1000; i++) { if (check()) return; await new Promise(resolve => setImmediate(resolve)); } assert.fail('Local sandbox did not settle'); };
const limits = { ALAIA_RECONCILIATION_READ_TIMEOUT_MS: '500', ALAIA_RECONCILIATION_MONGO_MAX_TIME_MS: '100', ALAIA_RECONCILIATION_MAX_CONCURRENT_READS: '1' };

for (const flag of [undefined, 'false', 'true']) test('full Express sandbox: startup, real JWT auth, GET/HEAD and Mongoose POST in mode ' + String(flag), async t => {
  const h = await fixture(t, { integrated: true, nativeFlag: flag });
  assert.equal(h.sandbox.server().address().address, '127.0.0.1');
  assert.equal(h.sandbox.events.indexOf('main:ready') < h.sandbox.events.indexOf('listen'), true);
  assert.equal(h.sandbox.driver.clients.length, flag === 'true' ? 1 : 0);
  assert.equal((await h.request('GET', '', { session: null })).status, 401);
  assert.equal((await h.request('GET', '', { session: h.token(CLIENT) })).status, 403);
  assert.equal((await h.request('GET', '', { session: 'PRIVATE_INVALID_TOKEN' })).status, 401);
  const list = await h.request('GET'); assert.equal(list.status, 200); assert.equal(list.headers['cache-control'], 'no-store');
  const head = await h.request('HEAD', '/' + KEY); assert.equal(head.status, 200); assert.equal(head.text, '');
  assert.equal((await h.request('GET', '?kind=order&kind=event')).status, 400);
  assert.equal((await h.request('GET', '?limit=101')).status, 400);
  assert.equal((await h.request('GET', '/PRIVATE_BAD_REFERENCE')).status, 400);
  assert.equal((await h.request('POST', '/' + KEY + '/reviews', { origin: null, body: {} })).status, 403);
  const body = await h.input();
  const first = await h.request('POST', '/' + KEY + '/reviews', { body });
  const repeat = await h.request('POST', '/' + KEY + '/reviews', { body });
  assert.equal(first.status, 200); assert.equal(repeat.status, 200); assert.equal(repeat.body.data.replayed, true);
  assert.equal(h.audits.size, 1); assert.equal(h.state.mongooseReviews, 2);
  if (flag === 'true') assert.equal(h.state.mongooseReads, 0);
  assert.deepEqual(h.sandbox.denied, []);
});

test('full Express sandbox: native/Mongoose HTTP DTO equivalence and post-review visibility', async t => {
  const off = await fixture(t, { integrated: true, nativeFlag: 'false' });
  const on = await fixture(t, { integrated: true, nativeFlag: 'true' });
  for (const suffix of ['', '?kind=order', '?kind=event', '?status=open', '?page=2&limit=1', '?page=9', '/' + KEY, '/' + EVENT, '/' + KEY + '?limit=1']) {
    const a = await off.request('GET', suffix), b = await on.request('GET', suffix);
    assert.equal(a.status, b.status); assert.deepEqual(a.body, b.body);
    assert.equal(a.headers['cache-control'], b.headers['cache-control']);
  }
  for (const h of [off, on]) { const body = await h.input(); assert.equal((await h.request('POST', '/' + KEY + '/reviews', { body })).status, 200); }
  const a = await off.request('GET', '/' + KEY), b = await on.request('GET', '/' + KEY);
  // Fixture audit clocks are deterministic; compare complete DTOs.
  assert.deepEqual(a.body, b.body); assert.equal(on.state.mongooseReads, 0);
});

for (const flag of ['false', 'true']) test('full Express sandbox: Morgan and console capture preauth errors without URL/body/message leaks, mode ' + flag, async t => {
  const h = await fixture(t, { integrated: true, nativeFlag: flag, nodeEnv: 'development' });
  const body = await h.request('POST', '/' + KEY + '/reviews?email=PRIVATE_QUERY', { session: null, raw: '{"address":"PRIVATE_BODY",', headers: { cookie: 'fixture=PRIVATE_COOKIE', authorization: 'Bearer PRIVATE_AUTHORIZATION' } });
  assert.equal(body.status, 400); assert.equal(body.body.message, 'Error interno del servidor');
  assert.ok(h.logs.some(line => JSON.parse(line).route === BASE + '/:caseKey/reviews'));
  assert.equal(h.errorLogs[0], util.format(reconciliationErrorLog({ method: 'POST', originalUrl: BASE + '/' + KEY + '/reviews' }, 400, { type: 'entity.parse.failed' })));
  assert.equal((await h.request('POST', '/' + KEY + '/reviews', { session: null, raw: '{"note":"PRIVATE_BODY"}', contentType: 'application/json; charset=PRIVATE_CHARSET' })).status, 415);
  const before = h.errorLogs.length;
  assert.equal((await h.request('GET', '/PRIVATE_CASE?phone=PRIVATE_QUERY', { origin: 'https://PRIVATE_ORIGIN.invalid', session: null })).status, 403);
  assert.equal(h.errorLogs.length, before + 1);
  assert.match(h.errorLogs.at(-1), /REQUEST_ORIGIN_FORBIDDEN/);
  assert.equal((await h.request('GET', '/%ZZ?email=PRIVATE_QUERY')).status, 400);
  assert.match(h.errorLogs.at(-1), /REVIEW_HTTP_ERROR/);
  h.state.globalError = Object.assign(Error('PRIVATE_ARBITRARY_MESSAGE'), { code: 'PRIVATE_ARBITRARY_CODE' });
  assert.equal((await h.request('GET', '/PRIVATE_CASE/unknown?email=PRIVATE_QUERY')).status, 500);
  assert.match(h.errorLogs.at(-1), /REVIEW_HTTP_ERROR/);
  assert.doesNotMatch(h.logs.join('') + h.errorLogs.join('') + h.sandbox.consoles.join(''), /PRIVATE_|\?|aaaaaaaa|cookie|token/i);
});

test('full Express sandbox: primary and native connections complete before HTTP opens', async t => {
  const main = gate(), native = gate();
  const h = await fixture(t, { integrated: true, nativeFlag: 'true', pendingStart: true, mainGate: main, nativePlan: { connect: native } });
  assert.equal(h.sandbox.server(), undefined); assert.equal(h.sandbox.driver.clients.length, 0);
  main.resolve(); await until(() => h.sandbox.driver.events.includes('connect'));
  assert.equal(h.sandbox.server(), undefined); native.resolve(); await h.sandbox.startup;
  await until(() => h.sandbox.server()?.listening); assert.equal((await h.request('GET')).status, 200);
});

test('full Express sandbox: failed primary/native initialization and invalid flag never listen or fall back', async t => {
  for (const options of [{ mainError: Error('PRIVATE_PRIMARY') }, { nativePlan: { connect: Error('PRIVATE_CONNECT') } }]) {
    const h = await fixture(t, { integrated: true, nativeFlag: 'true', ...options });
    await until(() => h.sandbox.exits.length > 0);
    assert.equal(h.sandbox.server(), undefined); assert.deepEqual(h.sandbox.exits, [1]); assert.equal(h.state.mongooseReads, 0);
    assert.ok(h.sandbox.driver.clients.length <= 1); assert.deepEqual(h.sandbox.denied, []);
    assert.doesNotMatch(h.sandbox.consoles.join(''), /PRIVATE_/);
  }
  await assert.rejects(fixture(t, { integrated: true, nativeFlag: 'invalid' }), /Invalid native/);
});

test('full Express sandbox: later native connectivity error is generic and recovers on the same client without fallback', async t => {
  const h = await fixture(t, { integrated: true, nativeFlag: 'true' });
  h.state.nativePlan.query = Error('PRIVATE_NETWORK');
  assert.equal((await h.request('GET')).status, 503); assert.equal(h.state.mongooseReads, 0);
  delete h.state.nativePlan.query;
  assert.equal((await h.request('GET')).status, 200); assert.equal(h.sandbox.driver.clients.length, 1);
});

test('full Express sandbox: timeout, saturation and pending cleanup retain one native slot', async t => {
  const query = gate(), cleanup = gate();
  const h = await fixture(t, { integrated: true, nativeFlag: 'true', readEnv: limits, nativePlan: { query, 'cursor:close': cleanup } });
  const timed = h.request('GET'); await until(() => h.sandbox.driver.events.includes('query'));
  assert.equal((await h.request('GET')).status, 503);
  assert.equal((await timed).status, 504); assert.equal(h.state.reader.stats().operations, 1);
  query.resolve(); await until(() => h.sandbox.driver.events.includes('cursor:close'));
  assert.equal(h.state.reader.stats().operations, 1); assert.equal((await h.request('GET')).status, 503);
  cleanup.resolve(); await until(() => h.state.reader.stats().operations === 0);
  assert.equal((await h.request('GET')).status, 200); assert.equal(h.sandbox.driver.clients.length, 1);
});

test('full Express sandbox: disconnected HTTP cannot free native capacity before cleanup', async t => {
  const query = gate(), cleanup = gate();
  const h = await fixture(t, { integrated: true, nativeFlag: 'true', readEnv: limits, nativePlan: { query, 'cursor:close': cleanup } });
  await h.disconnect(); await until(() => h.state.reader.stats().activeHTTP === 0);
  assert.equal(h.state.reader.stats().operations, 1); assert.equal((await h.request('GET')).status, 503);
  query.resolve(); await until(() => h.sandbox.driver.events.includes('cursor:close'));
  assert.equal(h.state.reader.stats().operations, 1); cleanup.resolve();
  await until(() => h.state.reader.stats().operations === 0); assert.equal((await h.request('GET')).status, 200);
});

for (const stage of ['main', 'native']) test('full Express sandbox: signal during ' + stage + ' initialization cannot open HTTP', async t => {
  const wait = gate();
  const h = await fixture(t, { integrated: true, nativeFlag: 'true', pendingStart: true,
    ...(stage === 'main' ? { mainGate: wait } : { nativePlan: { connect: wait } }) });
  if (stage === 'native') await until(() => h.sandbox.driver.events.includes('connect'));
  h.sandbox.signal(); h.sandbox.signal('SIGINT'); wait.resolve(); await h.sandbox.startup;
  await until(() => h.sandbox.exits.length > 0); assert.equal(h.sandbox.server(), undefined);
  assert.equal(h.sandbox.driver.events.filter(event => event === 'client:close').length, stage === 'native' ? 1 : 0);
});

test('full Express sandbox: shutdown waits active query/session cleanup; watchdog never claims remote cancellation', async t => {
  const query = gate(), session = gate();
  const h = await fixture(t, { integrated: true, nativeFlag: 'true', readEnv: limits, nativePlan: { query, endSession: session } });
  const pending = h.request('GET'); await until(() => h.sandbox.driver.events.includes('query'));
  h.sandbox.signal(); h.sandbox.signal('SIGINT'); assert.deepEqual(h.sandbox.exits, []);
  h.sandbox.force(); assert.deepEqual(h.sandbox.exits, [1]); assert.equal(h.state.reader.stats().operations, 1);
  query.resolve(); await until(() => h.sandbox.driver.events.includes('endSession'));
  assert.equal(h.state.reader.stats().operations, 1); session.resolve(); await pending;
  await h.sandbox.owner().close(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.sandbox.exits, [1]); assert.doesNotMatch(h.sandbox.consoles.join(''), /closed cleanly/);
  assert.match(h.sandbox.consoles.join(''), /remote termination unverified/);
});

test('full Express sandbox: readyz remains Mongoose-only, clean shutdown and reversal require a new process fixture', async t => {
  const on = await fixture(t, { integrated: true, nativeFlag: 'true' });
  assert.equal((await on.request('GET', '', { path: '/readyz' })).status, 200);
  on.state.nativePlan.query = Error('PRIVATE_NETWORK'); assert.equal((await on.request('GET')).status, 503);
  assert.equal((await on.request('GET', '', { path: '/readyz' })).status, 200);
  on.sandbox.connection.readyState = 0; assert.equal((await on.request('GET', '', { path: '/readyz' })).status, 503);
  on.env.ALAIA_RECONCILIATION_NATIVE_READER_ENABLED = 'false';
  assert.equal((await on.request('GET')).status, 503); assert.equal(on.state.mongooseReads, 0);
  on.sandbox.signal(); await on.sandbox.owner().close(); await until(() => on.sandbox.exits.length > 0);
  assert.deepEqual(on.sandbox.exits, [0]); assert.match(on.sandbox.consoles.join(''), /closed cleanly/);
  const off = await fixture(t, { integrated: true, nativeFlag: 'false' });
  assert.equal((await off.request('GET')).status, 200); assert.equal(off.sandbox.driver.clients.length, 0);
});

test('logging classification: malformed authorities and arbitrary error fields produce only fixed approved values', () => {
  for (const url of [BASE + '/PRIVATE_CASE?email=PRIVATE_QUERY', 'http://[PRIVATE_HOST]' + BASE + '/PRIVATE_CASE?email=PRIVATE_QUERY', 'http://fixture.invalid' + BASE.toUpperCase() + '/%ZZ']) {
    const req = { method: 'PRIVATE_METHOD', originalUrl: url }; assert.equal(isReconciliationRequest(req), true);
    const entry = reconciliationErrorLog(req, 500, { code: 'PRIVATE_CODE', publicCode: 'PRIVATE_CODE', type: '__proto__', message: 'PRIVATE_MESSAGE' });
    assert.deepEqual(Object.keys(entry), ['method', 'route', 'status', 'code']);
    assert.equal(entry.method, 'OTHER'); assert.equal(entry.route, BASE + '/:caseKey');
    assert.equal(entry.code, 'REVIEW_HTTP_ERROR'); assert.doesNotMatch(JSON.stringify(entry), /PRIVATE_|\?/);
  }
  assert.equal(isReconciliationRequest({ originalUrl: '/other?next=' + BASE }), false);
  assert.equal(isReconciliationRequest({ originalUrl: BASE + '-other' }), false);
});

test('full Express sandbox: headers-sent reconciliation error closes response without default Express error logging', async t => {
  const hostErrors = [], originalError = console.error;
  console.error = (...args) => hostErrors.push(util.format(...args));
  t.after(() => { console.error = originalError; });
  const h = await fixture(t, { integrated: true, nativeFlag: 'true' });
  h.state.globalError = Error('PRIVATE_AFTER_HEADERS'); h.state.headersSentError = true;
  const outcome = await new Promise(resolve => {
    const req = http.request({ hostname: '127.0.0.1', port: h.sandbox.server().address().port, method: 'GET',
      path: BASE + '/PRIVATE_CASE/unknown?email=PRIVATE_QUERY', agent: false,
      headers: { origin: ORIGIN, cookie: `${COOKIE}=${h.token(ADMIN)}` } }, res => {
      let body = ''; res.on('data', chunk => { body += chunk; });
      res.on('aborted', () => resolve({ aborted: true, body })); res.on('end', () => resolve({ aborted: false, body }));
    }); req.on('error', () => resolve({ aborted: true, body: '' })); req.end();
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(outcome.aborted, true); assert.equal(h.errorLogs.length, 1);
  assert.match(h.errorLogs[0], /REVIEW_HTTP_ERROR/);
  assert.doesNotMatch(outcome.body + h.logs.join('') + h.errorLogs.join('') + hostErrors.join(''), /PRIVATE_|\?/);
  assert.deepEqual(hostErrors, []);
});

test('full Express sandbox: logging and global error responses for non-reconciliation APIs remain unchanged', async t => {
  const h = await fixture(t, { integrated: true, nativeFlag: 'false' });
  h.state.globalError = Object.assign(Error('ordinary fixture error'), { statusCode: 418, code: 'FIXTURE_PUBLIC' });
  const response = await h.request('GET', '', { path: '/api/productos/public?tag=public' });
  assert.equal(response.status, 418); assert.equal(response.body.message, 'Error interno del servidor');
  assert.match(h.logs.at(-1), /\/api\/productos\/public\?tag=public/);
  assert.match(h.errorLogs.at(-1), /GLOBAL ERROR:/); assert.match(h.errorLogs.at(-1), /ordinary fixture error/);
});


for (const flag of ['false', 'true']) test('full Express sandbox: real authentication catch logs approved metadata instead of sensitive errors, mode ' + flag, async t => {
  const h = await fixture(t, { integrated: true, nativeFlag: flag });
  h.state.fault = 'auth';
  assert.equal((await h.request('GET', '/' + KEY + '?email=PRIVATE_QUERY')).status, 401);
  assert.equal(h.errorLogs.length, 1);
  const entry = JSON.parse(h.errorLogs[0])[0];
  assert.deepEqual(Object.keys(entry), ['method', 'route', 'status', 'code']);
  assert.deepEqual(entry, { method: 'GET', route: BASE + '/:caseKey', status: 401, code: 'REVIEW_AUTH_ERROR' });
  assert.doesNotMatch(h.logs.join('') + h.errorLogs.join(''), /PRIVATE_|reqId|aaaaaaaa/);
});

test('full Express sandbox: Mongoose mode retains slots through timeout and disconnected local work', async t => {
  const wait = gate();
  const h = await fixture(t, { integrated: true, nativeFlag: 'false', readEnv: limits });
  t.after(() => wait.resolve()); h.state.listWait = wait.promise;
  const timed = h.request('GET'); await until(() => h.reads.stats().operations === 1);
  assert.equal((await h.request('GET')).status, 503); assert.equal((await timed).status, 504);
  assert.equal(h.reads.stats().operations, 1); wait.resolve(); await until(() => h.reads.stats().operations === 0);
  const disconnected = gate(); t.after(() => disconnected.resolve()); h.state.listWait = disconnected.promise;
  await h.disconnect(); await until(() => h.reads.stats().activeHTTP === 0);
  assert.equal(h.reads.stats().operations, 1); assert.equal((await h.request('GET')).status, 503);
  disconnected.resolve(); await until(() => h.reads.stats().operations === 0);
  assert.equal((await h.request('GET')).status, 200); assert.equal(h.sandbox.driver.clients.length, 0);
});

for (const flag of ['false', 'true']) test('full Express sandbox: concurrent POST CAS and audit failure rollback remain on Mongoose provider, mode ' + flag, async t => {
  const h = await fixture(t, { integrated: true, nativeFlag: flag });
  const body = await h.input(); h.concurrentReads();
  const results = await Promise.all([
    h.request('POST', '/' + KEY + '/reviews', { body, headers: { 'idempotency-key': 'integrated-review-first-0001' } }),
    h.request('POST', '/' + KEY + '/reviews', { body: { ...body, conclusion: 'discrepancy' }, headers: { 'idempotency-key': 'integrated-review-second-0002' } })
  ]);
  assert.deepEqual(results.map(row => row.status).sort(), [200, 409]); assert.equal(h.audits.size, 1);
  const next = await h.input(), before = structuredClone([...h.cases]);
  h.state.fault = 'audit';
  assert.equal((await h.request('POST', '/' + KEY + '/reviews', { body: next, headers: { 'idempotency-key': 'integrated-review-rollback-0003' } })).status, 503);
  assert.deepEqual([...h.cases], before); assert.equal(h.audits.size, 1); assert.equal(h.state.mongooseReviews, 3);
  if (flag === 'true') assert.equal(h.state.mongooseReads, 0);
});

test('full Express sandbox: absolute-form target with malformed authority and preauth parse error cannot leak URL or body', async t => {
  const h = await fixture(t, { integrated: true, nativeFlag: 'false', nodeEnv: 'development' });
  const response = await h.request('POST', '', { session: null, path: 'http://[PRIVATE_HOST]' + BASE + '/PRIVATE_CASE/reviews?email=PRIVATE_QUERY', raw: '{"address":"PRIVATE_BODY",' });
  assert.equal(response.status, 400); assert.equal(response.body.message, 'Error interno del servidor');
  assert.ok(h.errorLogs.length > 0); assert.doesNotMatch(h.errorLogs.join('') + h.logs.join('') + response.text, /PRIVATE_|\?/);
});

for (const flag of ['false', 'true']) test('full Express sandbox: oversized JSON before authentication is redacted in both logging channels, mode ' + flag, async t => {
  const h = await fixture(t, { integrated: true, nativeFlag: flag });
  const response = await h.request('POST', '/' + KEY + '/reviews?email=PRIVATE_QUERY', {
    session: null, raw: '{"note":"PRIVATE_BODY_' + 'x'.repeat(1024 * 1024) + '"}', headers: { cookie: 'fixture=PRIVATE_COOKIE' }
  });
  assert.equal(response.status, 413); assert.equal(h.errorLogs.length, 1);
  assert.match(h.errorLogs[0], /REQUEST_BODY_TOO_LARGE/);
  assert.doesNotMatch(h.logs.join('') + h.errorLogs.join('') + response.text, /PRIVATE_|\?/);
});

test('sandbox guard: SDK imports, external DNS, non-fixture sockets and non-loopback binds are rejected before action', t => {
  const guard = require('./reconciliationSandboxGuard').acquireSandboxGuard();
  t.after(() => guard.release(['service import', 'external DNS', 'non-fixture socket', 'non-loopback listener', 'credential file', 'service import', 'child process']));
  assert.throws(() => require('stripe'), /Forbidden sandbox/);
  assert.throws(() => require('node:dns').promises.resolveSrv('_mongodb._tcp.fixture.invalid'), /Forbidden sandbox/);
  assert.throws(() => require('node:net').Socket.prototype.connect.call({}, { port: 27017, host: '127.0.0.1' }), /Forbidden sandbox/);
  assert.throws(() => require('node:net').Server.prototype.listen.call({}, 3001, '0.0.0.0'), /Forbidden sandbox/);
  assert.throws(() => require('node:fs').readFileSync('/fixture/.env'), /Forbidden sandbox/);
  assert.throws(() => require('dotenv'), /Forbidden sandbox/);
  assert.throws(() => require('node:child_process').spawn('fixture-no-process'), /Forbidden sandbox/);
});

test('sandbox teardown: both modes restore host APIs/env/signals and leave no fixture sockets or listeners', async t => {
  const net = require('node:net'), dns = require('node:dns'), fs = require('node:fs');
  const Module = require('node:module'), children = require('node:child_process');
  const originals = [Module._load, net.Socket.prototype.connect, net.Server.prototype.listen, dns.resolveSrv, fs.readFileSync, fs.promises.open, children.spawn, console.error];
  // Compare names and nonsecret selection flags; never inspect host credentials.
  const environment = Object.keys(process.env).sort();
  const flags = [process.env.NODE_ENV, process.env.ALAIA_RECONCILIATION_NATIVE_READER_ENABLED];
  const signals = ['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal));
  const before = new Set(process._getActiveHandles());
  for (const flag of [undefined, 'true']) await t.test('teardown mode ' + String(flag), async child => {
    const h = await fixture(child, { integrated: true, nativeFlag: flag });
    assert.equal((await h.request('GET')).status, 200);
  });
  await until(() => !process._getActiveHandles().some(handle => !before.has(handle) && (handle instanceof net.Server || handle instanceof net.Socket)));
  assert.deepEqual(Object.keys(process.env).sort(), environment, 'Host environment names were modified');
  assert.deepEqual([process.env.NODE_ENV, process.env.ALAIA_RECONCILIATION_NATIVE_READER_ENABLED], flags);
  assert.deepEqual(['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal)), signals);
  assert.deepEqual([Module._load, net.Socket.prototype.connect, net.Server.prototype.listen, dns.resolveSrv, fs.readFileSync, fs.promises.open, children.spawn, console.error], originals);
});
