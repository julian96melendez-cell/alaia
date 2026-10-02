'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createIsolatedRuntime } = require('../scripts/reconciliation-integration/isolatedRuntime');
const { createHttpApplication } = require('../scripts/reconciliation-integration/httpApplication');
const { Mongoose } = require('mongoose'), { ObjectId } = require('mongodb');
const database = 'alaia_2123456789abcdef0123456789abcdef', uri = 'mongodb+srv://fixture:fixture@fixture.invalid/' + database;
const admin = { _id: new ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb'), rol: 'admin', tokenVersion: 0, activo: true };
const source = { _id: new ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'), createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'), inventoryReservation: { state: 'reserved', needsReconciliation: true }, estadoPago: 'pendiente', estadoFulfillment: 'pendiente', payoutBlocked: true, total: 10, moneda: 'usd' };
function double() {
  const calls = [], plan = {};
  class MongoClient {
    constructor() { calls.push('construct'); }
    async connect() { calls.push('connect'); if (plan.connect) await plan.connect(); }
    async close() { calls.push('close'); if (plan.close) await plan.close(); }
    startSession() {
      let transaction = false;
      return { client: this, startTransaction() { transaction = true; calls.push('transaction'); }, inTransaction: () => transaction,
        async commitTransaction() { transaction = false; calls.push('commit'); }, async abortTransaction() { transaction = false; calls.push('abort'); }, async endSession() { calls.push('endSession'); } };
    }
    db(name) {
      assert.equal(name, database);
      return { databaseName: name, collection(name) {
        const cursor = result => ({ limit() { return this; }, async next() { if (plan.read) await plan.read(); return result; }, async toArray() { if (plan.read) await plan.read(); return result; }, async close() { calls.push('cursor:close'); } });
        return { find: (_filter, options) => { assert.ok(options.timeoutMS <= options.maxTimeMS); return cursor(name === 'express_orders' ? source : null); }, aggregate: (_pipeline, options) => { assert.ok(options.timeoutMS <= options.maxTimeMS); return cursor([{ items: [], total: [] }]); } };
      } };
    }
  }
  return { driver: { MongoClient, ObjectId }, calls, plan };
}
test('isolated runtime: original hooks/overrides and Counter closure bind to one disconnected Mongoose', async () => {
  const fake = double(), runtime = createIsolatedRuntime({ Mongoose, driver: fake.driver, database });
  assert.equal(runtime.mongoose.connection.readyState, 0); assert.equal(fake.calls.length, 0);
  for (const model of Object.values(runtime.models)) {
    assert.equal(model.db, runtime.mongoose.connection); assert.equal(model.schema.get('autoCreate'), false); assert.equal(model.schema.get('autoIndex'), false);
  }
  await assert.rejects(runtime.models.ReconciliationAudit.bulkWrite([]), /append-only/);
  const audit = new runtime.models.ReconciliationAudit({}); await assert.rejects(audit.validate());
  let counter = 0;
  runtime.models.Counter.findOneAndUpdate = () => ({ lean: async () => { counter++; return { seq: 77 }; } });
  const order = new runtime.models.Orden({}); await order.validate().catch(() => {});
  assert.equal(counter, 1); assert.equal(order.orderNumber, 77);
  assert.throws(() => runtime.load('config/firebase')); assert.throws(() => runtime.load('workers'));
  assert.throws(() => createHttpApplication(runtime, { enabled: 'false', uri, driver: fake.driver }));
});
for (const enabled of [false, true]) test('Express integration assembly with LOCAL DOUBLES: real auth/router/controller and POST provider, mode ' + enabled, async t => {
  const { acquireSandboxGuard } = require('./reconciliationSandboxGuard'), guard = acquireSandboxGuard();
  const fake = double(), runtime = createIsolatedRuntime({ Mongoose, driver: fake.driver, database });
  runtime.models.Usuario.findById = id => ({ select: async () => String(id) === String(admin._id) ? admin : null });
  runtime.repo.list = async () => ({ items: [], total: 0, readConsistency: 'single_aggregation' });
  runtime.repo.readSnapshot = fn => fn({}); runtime.repo.getCase = async () => null;
  runtime.repo.getSource = async () => source; runtime.repo.listAudits = async () => ({ items: [], total: 0 });
  const app = createHttpApplication(runtime, { enabled, uri, driver: fake.driver, primaryReady: () => true });
  t.after(async () => { try { await app.close(); assert.equal(app.listening(), false); } finally { guard.release(); } });
  await app.start(); guard.allow(app.server()); assert.equal(app.server().address().address, '127.0.0.1');
  const token = runtime.token(admin);
  assert.equal((await app.request('GET')).status, 401);
  assert.equal((await app.request('GET', '', { token })).status, 200);
  const key = 'order:' + source._id;
  assert.equal((await app.request('HEAD', '/' + key, { token })).status, 200);
  assert.equal((await app.request('GET', '?kind=order&kind=event&email=PRIVATE_QUERY', { token })).status, 400);
  assert.equal((await app.request('POST', '/' + key + '/reviews?email=PRIVATE_QUERY', { raw: '{"note":"PRIVATE_BODY",' })).status, 400);
  assert.equal((await app.request('POST', '/' + key + '/reviews', { token, body: {}, origin: null })).status, 403);
  assert.equal((await app.request('POST', '/' + key + '/reviews', { token, body: {} })).status, 400);
  assert.equal(runtime.writes(), 1);
  assert.doesNotMatch(JSON.stringify([app.logs, app.errors, runtime.logs, runtime.errors]), /PRIVATE_|mongodb(?:\+srv)?:\/\//);
  await app.close(); assert.equal(fake.calls.filter(call => call === 'construct').length, enabled ? 1 : 0);
  if (enabled) { assert.equal(app.stats().openSessions, 0); assert.equal(app.stats().operations, 0); }
});
test('Express assembly with LOCAL DOUBLES: failed init never listens and close is memoized', async () => {
  const fake = double(); fake.plan.connect = () => { throw Error('PRIVATE_INITIAL_ERROR'); };
  const runtime = createIsolatedRuntime({ Mongoose, driver: fake.driver, database });
  const app = createHttpApplication(runtime, { enabled: true, uri, driver: fake.driver, primaryReady: () => true });
  await assert.rejects(app.start()); assert.equal(app.listening(), false);
  await Promise.all([app.close(), app.close()]); assert.equal(fake.calls.filter(call => call === 'close').length, 1);
});
test('Express assembly: missing primary connection stops before native client construction or HTTP', async () => {
  const fake = double(), runtime = createIsolatedRuntime({ Mongoose, driver: fake.driver, database });
  const app = createHttpApplication(runtime, { enabled: true, uri, driver: fake.driver });
  await assert.rejects(app.start(), /Primary integration/); await app.close();
  assert.equal(app.listening(), false); assert.deepEqual(fake.calls, []);
});
test('Express assembly with LOCAL DOUBLES: shutdown during initialization never opens HTTP', async () => {
  const fake = double(); let release; fake.plan.connect = () => new Promise(resolve => { release = resolve; });
  const runtime = createIsolatedRuntime({ Mongoose, driver: fake.driver, database }), app = createHttpApplication(runtime, { enabled: true, uri, driver: fake.driver, primaryReady: () => true });
  const starting = app.start(); const rejection = assert.rejects(starting);
  await new Promise(resolve => setImmediate(resolve)); const closing = app.close(); release();
  await rejection; await closing; assert.equal(app.listening(), false);
});
for (const fail of [false, true]) test('Express assembly with LOCAL DOUBLES: shutdown retains work through active query and late errors, fail ' + fail, async t => {
  const { acquireSandboxGuard } = require('./reconciliationSandboxGuard'), guard = acquireSandboxGuard();
  const fake = double(), runtime = createIsolatedRuntime({ Mongoose, driver: fake.driver, database });
  runtime.models.Usuario.findById = () => ({ select: async () => admin });
  let entered, release;
  const admitted = new Promise(resolve => { entered = resolve; }), blocked = new Promise(resolve => { release = resolve; });
  fake.plan.read = async () => { entered(); await blocked; if (fail) throw Error('PRIVATE_LATE_QUERY_ERROR'); };
  const app = createHttpApplication(runtime, { enabled: true, uri, driver: fake.driver, primaryReady: () => true });
  t.after(async () => { try { release(); await app.close(); } finally { guard.release(); } });
  await app.start(); guard.allow(app.server());
  const request = app.request('GET', '', { token: runtime.token(admin) }); await admitted;
  let settled = false; const closing = app.close().then(() => { settled = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false); assert.equal(app.stats().operations, 1); assert.equal(app.stats().openSessions, 1);
  release(); const response = await request; await closing;
  assert.equal(response.status, fail ? 503 : 200);
  assert.equal(app.stats().operations, 0); assert.equal(app.stats().openSessions, 0);
  assert.equal(fake.calls.filter(call => call === 'close').length, 1);
  assert.ok(fake.calls.lastIndexOf('endSession') < fake.calls.lastIndexOf('close'));
  assert.doesNotMatch(JSON.stringify([app.logs, app.errors, runtime.errors]) + response.text, /PRIVATE_/);
});
test('Express runner watchdog with LOCAL TIMER/PROCESS DOUBLES records forced cleanup and retains completed evidence', () => {
  const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
  const source = fs.readFileSync(path.resolve(__dirname, '../scripts/mongo-express-native-reconciliation-integration.js'), 'utf8');
  const entry = source.slice(source.indexOf('if (require.main === module) {'), source.indexOf('\nmodule.exports ='));
  const module = {}, requireDouble = { main: module }, output = [], exits = [];
  let timer;
  const state = { runId: 'fixture', database, trials: [{ name: 'A', status: 'passed', origin: 'real_mongodb' }], claimAttempted: true, markerAcknowledged: true };
  vm.runInNewContext(entry, { module, require: requireDouble, AbortController, process: { env: {}, on() {}, removeListener() {}, exit: code => exits.push(code) },
    console: { error: line => output.push(line), log: line => output.push(line) },
    setTimeout(callback, delay) { assert.equal(delay, 180000); timer = callback; }, clearTimeout() {},
    safeSummary: require('../scripts/mongo-express-native-reconciliation-integration').safeSummary,
    main(_env, options) { options.onState(state); return new Promise(() => {}); },
  });
  timer(); const result = JSON.parse(output[0]); assert.deepEqual(exits, [1]);
  assert.equal(result.failedStage, 'watchdog'); assert.equal(result.cleanup, 'pending_or_unknown');
  assert.equal(result.remoteTermination, 'not_verified'); assert.equal(result.trials.length, 1);
});
test('Express assembly with LOCAL DOUBLES: Mongoose work also drains before clean shutdown', async t => {
  const { acquireSandboxGuard } = require('./reconciliationSandboxGuard'), guard = acquireSandboxGuard();
  const fake = double(), runtime = createIsolatedRuntime({ Mongoose, driver: fake.driver, database });
  runtime.models.Usuario.findById = () => ({ select: async () => admin });
  let enter, release;
  const admitted = new Promise(resolve => { enter = resolve; }), blocked = new Promise(resolve => { release = resolve; });
  runtime.repo.list = async () => { enter(); await blocked; return { items: [], total: 0 }; };
  const app = createHttpApplication(runtime, { enabled: false, uri, driver: fake.driver, primaryReady: () => true });
  t.after(async () => { try { release(); await app.close(); } finally { guard.release(); } });
  await app.start(); guard.allow(app.server());
  const request = app.request('GET', '', { token: runtime.token(admin) }); await admitted;
  let settled = false; const closing = app.close().then(() => { settled = true; });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(settled, false); assert.equal(runtime.pendingWork(), 1);
  release(); assert.equal((await request).status, 200); await closing;
  assert.equal(runtime.pendingWork(), 0); assert.equal(fake.calls.length, 0);
});
test('Express assembly with LOCAL DOUBLES: partial init and cleanup errors both fail and close is never retried', async () => {
  const fake = double(); fake.plan.connect = () => { throw Error('PRIVATE_INITIAL'); }; fake.plan.close = () => { throw Error('PRIVATE_CLEANUP'); };
  const runtime = createIsolatedRuntime({ Mongoose, driver: fake.driver, database });
  const app = createHttpApplication(runtime, { enabled: true, uri, driver: fake.driver, primaryReady: () => true });
  await assert.rejects(app.start()); await assert.rejects(app.close(), /cleanup/); await assert.rejects(app.close(), /cleanup/);
  assert.equal(app.listening(), false); assert.equal(fake.calls.filter(call => call === 'close').length, 1);
});
test('Express signal with LOCAL DOUBLES: abort during initialization cannot open HTTP, repeated abort is safe', async () => {
  const fake = double(), controller = new AbortController(); let release;
  fake.plan.connect = () => new Promise(resolve => { release = resolve; });
  const runtime = createIsolatedRuntime({ Mongoose, driver: fake.driver, database });
  const app = createHttpApplication(runtime, { enabled: true, uri, driver: fake.driver, signal: controller.signal, primaryReady: () => true });
  const startup = app.start(), failed = assert.rejects(startup);
  await new Promise(resolve => setImmediate(resolve)); controller.abort(); controller.abort(); release();
  await failed; await app.close(); assert.equal(app.listening(), false);
  assert.equal(fake.calls.filter(call => call === 'close').length, 1);
});
