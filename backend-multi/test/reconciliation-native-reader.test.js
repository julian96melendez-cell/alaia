'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { MongoClient, ObjectId, MongoOperationTimeoutError } = require('mongodb');
const { createNativeReconciliationReader } = require('../src/services/reconciliationNativeReader');
const { getNativeReaderConfig } = require('../src/config/reconciliationNativeReader');
const { listPipeline, auditPipeline, createMongoRepository } = require('../src/services/reconciliationRepository');
const { createReconciliationReviewService } = require('../src/services/reconciliationReviewService');
const { createReadBudget } = require('../src/services/reconciliationReadRuntime');
const { parseKey, sourceSnapshot } = require('../src/services/reconciliationContracts');
const ID = 'aaaaaaaaaaaaaaaaaaaaaaaa', ACTOR = 'bbbbbbbbbbbbbbbbbbbbbbbb', EVENT = 'cccccccccccccccccccccccc';
const KEY = 'order:' + ID, CASE = parseKey(KEY).caseId;
const names = { orders: 'orders', events: 'events', cases: 'cases', audits: 'audits' };
const input = { uri: 'mongodb://127.0.0.1/native_fixture', database: 'native_fixture', collectionNames: names };
const enabled = { ALAIA_RECONCILIATION_NATIVE_READER_ENABLED: 'true' };
const copy = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; }); return { promise, resolve, reject }; };
const until = async predicate => { for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(resolve => setImmediate(resolve)); } assert.fail('Local prototype lifecycle did not settle'); };
function transport(query = {}) {
  const req = new EventEmitter(), res = new EventEmitter(), response = deferred();
  Object.assign(req, { usuario: { _id: ACTOR, rol: 'admin' }, query, params: { caseKey: KEY } });
  Object.assign(res, { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(value) { this.statusCode = value; return this; }, json(body) { this.body = body; this.writableEnded = true; this.headersSent = true; this.emit('finish'); response.resolve(); return this; } });
  return { req, res, response };
}
function data() {
  const order = { _id: ID, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', inventoryReservation: { needsReconciliation: true, state: 'reconciliation_required', lines: [{ cantidad: 1 }] }, checkoutIntent: { keyHash: 'PRIVATE_KEYHASH', stripeCorrelation: 'PRIVATE_BINDING' }, estadoPago: 'pendiente', estadoFulfillment: 'pendiente', payoutBlocked: true, total: 10, moneda: 'usd', clienteEmail: 'PRIVATE_EMAIL', raw: 'PRIVATE_RAW' };
  return { orders: order, events: { _id: EVENT, provider: 'stripe', status: 'failed', eventId: 'evt_fixture', createdAt: order.createdAt, updatedAt: order.updatedAt, raw: 'PRIVATE_RAW', ordenId: ID }, cases: { _id: CASE, caseKey: KEY, sourceKind: 'order', sourceId: ID, version: 1, status: 'under_review' }, audits: [{ _id: 'dddddddddddddddddddddddd', caseId: CASE, actorId: ACTOR, resultVersion: 1, status: 'under_review', conclusion: 'discrepancy', evidence: [{ kind: 'internal_ticket', reference: 'OPS-NATIVE' }], sourceSnapshot: sourceSnapshot('order', order), createdAt: order.updatedAt, requestHash: 'PRIVATE_HASH' }], products: [{ stock: 7 }], payouts: [{ amount: 3, status: 'blocked' }] };
}
function fakeDriver({ plan = {}, records = data(), realClient = false } = {}) {
  const events = [], clients = []; let view;
  const original = copy(records);
  async function step(stage, extra = {}) {
    events.push({ stage, ...extra }); const action = plan[stage];
    if (action instanceof Error) throw action;
    if (typeof action === 'function') await action(extra);
    else if (action?.promise) await action.promise;
  }
  function assertIdle(session) { assert.equal(session.busy, false, 'Cleanup raced an active query'); assert.equal(session.closingCursor || false, false, 'Session cleanup raced cursor close'); assert.equal(session.aborting || false, false, 'EndSession raced abort'); }
  function session(client, options) {
    return {
      client, options, busy: false, hasEnded: false, tx: false,
      startTransaction(options) { this.tx = true; this.transactionOptions = options; this.view = copy(records); events.push({ stage: 'transaction:start', options, session: this }); },
      inTransaction() { return this.tx; },
      async commitTransaction(options) { assertIdle(this); await step('commit', { options, session: this }); this.tx = false; },
      async abortTransaction(options) { assertIdle(this); this.aborting = true; try { await step('abort', { options, session: this }); } finally { this.aborting = false; this.tx = false; } },
      async endSession(options) { assertIdle(this); try { await step('endSession', { options, session: this }); } finally { this.hasEnded = true; } },
    };
  }
  const Parent = realClient ? MongoClient : class {};
  class Client extends Parent {
    constructor(uri, options) { if (plan.constructorError) throw plan.constructorError; if (realClient) super(uri, options); else super(); this.capturedOptions = options; this.sessions = []; clients.push(this); events.push({ stage: 'client:create', options }); }
    async connect() { await step('connect'); return this; }
    startSession(options) { const current = session(plan.foreignSession ? {} : this, options); this.sessions.push(current); events.push({ stage: 'session:start', options, session: current }); return current; }
    db(database) {
      if (plan.databaseError) throw plan.databaseError;
      events.push({ stage: 'database', database });
      return { databaseName: plan.foreignDatabase || database, collection(name) {
        assert.ok(Object.values(names).includes(name));
        return {
          find(filter, options) { return cursor('find', name, filter, options); },
          aggregate(pipeline, options) { return cursor('aggregate', name, pipeline, options); },
        };
      } };
    }
    async close() { await step('client:close'); }
  }
  function cursor(kind, name, filterOrPipeline, options) {
    assert.equal(options.signal, undefined); assert.ok(options.timeoutMS > 0 && options.timeoutMS <= options.maxTimeMS);
    assert.ok(options.session); assert.equal(options.session.client, clients[0]);
    events.push({ stage: 'cursor:create', kind, name, filterOrPipeline, options });
    let limit;
    async function execute() {
      const current = options.session; assertIdle(current); current.busy = true;
      try {
        await step('selection', { session: current }); await step('acquisition', { session: current });
        await step('query:' + name, { session: current });
        const snapshot = current.tx ? current.view : records;
        if (kind === 'find') { assert.equal(limit, 1); return copy(snapshot[name]); }
        if (name === names.orders) return [{ items: [{ _id: KEY, record: copy(snapshot.cases), source: copy(snapshot.orders) }], total: [{ count: 1 }] }];
        return [{ items: copy(snapshot.audits), total: [{ count: snapshot.audits.length }] }];
      } finally { current.busy = false; events.push({ stage: 'query:settled', name }); }
    }
    return {
      limit(value) { limit = value; return this; }, next: execute, toArray: execute,
      async close(closeOptions) {
        assert.equal(options.session.busy, false); options.session.closingCursor = true;
        try { await step('cursor:close', { options: closeOptions, name, session: options.session }); }
        finally { options.session.closingCursor = false; }
      },
    };
  }
  return { driver: { MongoClient: Client, ObjectId }, clients, events, records, original, plan };
}
async function fixture(t, options = {}) {
  const fake = fakeDriver(options), env = { ...enabled, ...options.env };
  const reader = createNativeReconciliationReader({ env, driver: fake.driver });
  if (!options.unconnected) await reader.connect(input);
  t.after(() => assert.deepEqual(fake.records.products, fake.original.products));
  t.after(() => assert.deepEqual(fake.records.payouts, fake.original.payouts));
  const call = async (method = 'list', query = {}) => { const h = transport(query); await reader.handlers[method](h.req, h.res); assert.doesNotMatch(JSON.stringify(h.res.body), /PRIVATE_|mongodb(?:\+srv)?:\/\/|stack|operationHash|requestHash|clienteEmail/); return h.res; };
  return { reader, ...fake, call, env };
}

test('native reader: disabled by default; flag creates neither client nor connections nor production routing changes', () => {
  let accesses = 0; const driver = new Proxy({}, { get() { accesses++; throw Error('No driver access'); } });
  for (const env of [{}, { ALAIA_RECONCILIATION_NATIVE_READER_ENABLED: 'false', ALAIA_RECONCILIATION_NATIVE_MAX_POOL_SIZE: 'PRIVATE_INPUT' }]) assert.equal(createNativeReconciliationReader({ env, driver }), null);
  assert.equal(accesses, 0);
  for (const file of ['server.js', 'src/routes/adminReconciliationRoutes.js', 'src/controllers/adminReconciliationController.js', 'src/services/reconciliationReviewService.js']) assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), /reconciliationNativeReader|NATIVE_READER_ENABLED/);
});
test('native reader: strict bounded configuration does not echo input and pool covers admitted reads plus headroom', () => {
  assert.deepEqual(getNativeReaderConfig({}), { enabled: false });
  const defaults = getNativeReaderConfig(enabled); assert.equal(defaults.maxPoolSize, 6); assert.equal(defaults.cleanupTimeoutMS, 2000);
  for (const flag of ['', 'TRUE', '1', 'PRIVATE_FLAG']) assert.throws(() => getNativeReaderConfig({ ALAIA_RECONCILIATION_NATIVE_READER_ENABLED: flag }), /^Error: Invalid native reconciliation reader configuration$/);
  for (const [suffix, low, high] of [['SERVER_SELECTION_TIMEOUT_MS', 100, 5000], ['CONNECT_TIMEOUT_MS', 100, 5000], ['WAIT_QUEUE_TIMEOUT_MS', 100, 5000], ['SOCKET_TIMEOUT_MS', 100, 10000], ['CLEANUP_TIMEOUT_MS', 100, 5000], ['MAX_POOL_SIZE', 2, 20]]) {
    for (const value of ['0', '-1', '1.2', '', 'PRIVATE_INPUT', String(high + 1), String(low - 1)]) assert.throws(() => getNativeReaderConfig({ ...enabled, ['ALAIA_RECONCILIATION_NATIVE_' + suffix]: value }), /^Error: Invalid native reconciliation reader configuration$/);
  }
  assert.throws(() => getNativeReaderConfig({ ...enabled, ALAIA_RECONCILIATION_NATIVE_MAX_POOL_SIZE: '4' }));
});
test('native reader: explicit connect, finite options accepted by real driver 7, distinct client and no read before ready', async t => {
  const h = await fixture(t, { realClient: true, unconnected: true });
  assert.equal(h.clients.length, 0); assert.equal((await h.call()).statusCode, 503);
  await h.reader.connect(input); assert.equal(h.clients.length, 1); assert.ok(h.clients[0] instanceof MongoClient);
  const options = h.clients[0].options;
  assert.equal(options.maxPoolSize, 6); assert.equal(options.minPoolSize, 0); assert.equal(options.maxConnecting, 2);
  assert.equal(options.serverSelectionTimeoutMS, 1000); assert.equal(options.waitQueueTimeoutMS, 1000); assert.equal(options.connectTimeoutMS, 2000); assert.equal(options.socketTimeoutMS, 3000); assert.equal(options.timeoutMS, 2000);
  assert.equal(options.retryReads, false); assert.equal(options.monitorCommands, false);
  assert.equal((await h.call()).statusCode, 200); await h.reader.close();
  assert.equal(h.reader.stats().phase, 'closed'); assert.equal((await h.call()).statusCode, 503);
});
test('native reader: invalid connect inputs do not construct client or expose credentials', async () => {
  const h = fakeDriver(), reader = createNativeReconciliationReader({ env: enabled, driver: h.driver });
  for (const bad of [{ ...input, uri: 'PRIVATE_URI' }, { ...input, database: 'PRIVATE/database' }, { ...input, collectionNames: { ...names, orders: 'system.users' } }, { ...input, collectionNames: { ...names, cases: names.orders } }]) await assert.rejects(reader.connect(bad), error => error.publicCode === 'REVIEW_UNAVAILABLE' && !error.message.includes('PRIVATE'));
  assert.equal(h.clients.length, 0);
});
test('native reader: exact list/audit pipelines, filters, DTOs and source projections match Mongoose reader', async t => {
  const h = await fixture(t), list = await h.call('list', { page: '2', limit: '5', kind: 'order', status: 'under_review' });
  assert.equal(list.statusCode, 200);
  const listCall = h.events.find(event => event.stage === 'cursor:create');
  const cutoff = listCall.filterOrPipeline[2].$unionWith.pipeline[0].$match.$or[1].updatedAt.$lte;
  assert.deepEqual(listCall.filterOrPipeline, listPipeline({ page: 2, limit: 5, kind: 'order', status: 'under_review' }, names, new Date(cutoff.getTime() + 300000)));
  assert.equal(h.events.filter(event => event.stage === 'transaction:start').length, 0);
  const detail = await h.call('detail', { page: '2', limit: '5' }); assert.equal(detail.statusCode, 200);
  const auditCall = h.events.find(event => event.stage === 'cursor:create' && event.name === names.audits);
  assert.deepEqual(auditCall.filterOrPipeline, auditPipeline(new ObjectId(CASE), { page: 2, limit: 5 }));
  const finds = h.events.filter(event => event.stage === 'cursor:create' && event.kind === 'find');
  assert.equal(String(finds[0].filterOrPipeline._id), CASE); assert.equal(String(finds[1].filterOrPipeline._id), ID);
  const { orderSourceProjection } = require('../src/services/reconciliationRepository');
  assert.deepEqual(finds[1].options.projection, orderSourceProjection);
  const collection = kind => ({ collection: { name: names[kind] }, aggregate: () => ({ option() { return this; }, session: async () => [{ items: copy(h.records.audits), total: [{ count: h.records.audits.length }] }] }) });
  const repo = createMongoRepository({ mongoose: { Types: { ObjectId }, startSession: async () => ({ withTransaction: async fn => fn(), endSession: async () => {} }) }, Orden: collection('orders'), WebhookEvent: collection('events'), Case: collection('cases'), Audit: collection('audits') });
  repo.getCase = async () => copy(h.records.cases); repo.getSource = async () => copy(h.records.orders);
  const oldDetail = await createReconciliationReviewService(repo).detail(KEY, { page: '2', limit: '5' });
  assert.deepEqual(detail.body.data, oldDetail);
  assert.deepEqual(h.records, h.original); assert.deepEqual(Object.keys(h.reader.handlers), ['list', 'detail']);
});
test('native reader: snapshot uses same-client session for case/source/audits and remains coherent across a simulated commit', async t => {
  const records = data(), h = await fixture(t, { records, plan: { 'query:cases': () => { records.orders.total = 999; records.cases.version = 2; records.audits.push({ resultVersion: 2 }); } } });
  const response = await h.call('detail'); assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.version, 1); assert.equal(response.body.data.source.total, 10); assert.equal(response.body.data.auditTotal, 1);
  const tx = h.events.find(event => event.stage === 'transaction:start');
  assert.deepEqual(tx.options, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary', maxCommitTimeMS: tx.options.maxCommitTimeMS });
  assert.ok(tx.options.maxCommitTimeMS > 0 && tx.options.maxCommitTimeMS <= 2000);
  for (const event of h.events.filter(event => event.stage === 'cursor:create')) assert.equal(event.options.session, tx.session);
  assert.equal(tx.session.client, h.clients[0]); assert.equal(tx.session.hasEnded, true);
});
test('native reader: refuses foreign-client sessions without starting queries or transactions', async t => {
  const h = await fixture(t, { plan: { foreignSession: true } });
  assert.equal((await h.call('detail')).statusCode, 503);
  assert.equal(h.events.filter(event => event.stage === 'cursor:create' || event.stage === 'transaction:start').length, 0);
});
test('native reader: event source projection and missing-source behavior preserve contracts', async t => {
  const records = data(); records.cases = null; records.audits = [];
  const h = await fixture(t, { records }), req = transport(); req.req.params.caseKey = 'event:' + EVENT;
  await h.reader.handlers.detail(req.req, req.res); assert.equal(req.res.statusCode, 200); assert.equal(req.res.body.data.source.eventId, 'evt_fixture');
  const find = h.events.find(event => event.stage === 'cursor:create' && event.name === names.events);
  assert.deepEqual(find.options.projection, { createdAt: 1, updatedAt: 1, provider: 1, status: 1, eventId: 1 });
  records.events = null; const missing = transport(); missing.req.params.caseKey = 'event:' + EVENT;
  await h.reader.handlers.detail(missing.req, missing.res); assert.equal(missing.res.statusCode, 404); assert.equal(missing.res.body.code, 'REVIEW_NOT_FOUND');
});
test('native reader: real driver CSOT wire preparation cannot expand command cap', async t => {
  const h = await fixture(t); await h.call('detail');
  const root = path.dirname(require.resolve('mongodb'));
  const { CSOTTimeoutContext } = require(path.join(root, 'timeout.js'));
  const { Connection } = require(path.join(root, 'cmap/connection.js'));
  const { ReadPreference } = require('mongodb');
  const fakeConnection = { description: { type: 'RSPrimary' }, supportsOpMsg: true, hasSessionSupport: false };
  for (const event of h.events.filter(event => event.stage === 'cursor:create')) {
    const cap = event.options.timeoutMS;
    const context = new CSOTTimeoutContext({ timeoutMS: cap, serverSelectionTimeoutMS: 1000 });
    const message = Connection.prototype.prepareCommand.call(fakeConnection, 'native_fixture', { find: 'cases', maxTimeMS: event.options.maxTimeMS }, { readPreference: ReadPreference.primary, timeoutContext: context });
    assert.ok(message.command.maxTimeMS > 0 && message.command.maxTimeMS <= cap);
    assert.ok(cap <= 2000);
  }
  const smaller = getNativeReaderConfig({ ...enabled, ALAIA_RECONCILIATION_MONGO_MAX_TIME_MS: '100' });
  const shrinking = createReadBudget(smaller, () => 0); shrinking.stop();
  assert.throws(() => shrinking.maxTimeMS(), error => error.statusCode === 504);
});
for (const stage of ['selection', 'acquisition', 'query:cases', 'query:orders', 'query:audits']) test('native reader: ' + stage + ' timeout waits cursor/session cleanup and returns generic error', async t => {
  const h = await fixture(t, { plan: { [stage]: new MongoOperationTimeoutError('PRIVATE_URI PRIVATE_PASSWORD') } });
  const response = await h.call('detail'); assert.equal(response.statusCode, 504); assert.equal(response.body.code, 'REVIEW_READ_TIMEOUT');
  assert.equal(h.reader.stats().operations, 0); assert.equal(h.reader.stats().openSessions, 0);
  const settled = h.events.findIndex(event => event.stage === 'query:settled'), closed = h.events.findIndex(event => event.stage === 'cursor:close'), abort = h.events.findIndex(event => event.stage === 'abort'), end = h.events.findIndex(event => event.stage === 'endSession');
  assert.ok(settled < closed && closed < abort && abort < end);
});
for (const stage of ['cursor:close', 'abort', 'endSession']) test('native reader: ' + stage + ' cleanup failure fails closed and does not expose diagnostics', async t => {
  const plan = { [stage]: Error('PRIVATE_URI PRIVATE_PASSWORD') };
  if (stage === 'abort') plan['query:cases'] = Error('PRIVATE_QUERY');
  const h = await fixture(t, { plan }); const response = await h.call('detail'); assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, { ok: false, code: 'REVIEW_UNAVAILABLE', financialActionsAllowed: false });
  assert.equal(h.reader.stats().phase, 'failed'); assert.equal(h.reader.stats().operations, 0);
  const queries = h.events.filter(event => event.stage === 'cursor:create').length;
  assert.equal((await h.call()).statusCode, 503); assert.equal(h.events.filter(event => event.stage === 'cursor:create').length, queries);
  assert.ok(h.events.some(event => event.stage === 'endSession'));
});

const shortEnv = { ALAIA_RECONCILIATION_READ_TIMEOUT_MS: '500', ALAIA_RECONCILIATION_MAX_CONCURRENT_READS: '1', ALAIA_RECONCILIATION_MONGO_MAX_TIME_MS: '100' };
for (const stage of ['query:cases', 'cursor:close', 'abort', 'endSession']) test('native reader: HTTP timeout during ' + stage + ' retains slot until all local cleanup settles', async t => {
  const gate = deferred(), plan = { [stage]: gate };
  if (stage === 'abort') plan['query:cases'] = Error('PRIVATE_LATE_ERROR');
  const h = await fixture(t, { env: shortEnv, plan }); t.after(() => gate.resolve());
  const request = transport(), pending = h.reader.handlers.detail(request.req, request.res);
  await request.response.promise;
  assert.equal(request.res.statusCode, 504); assert.deepEqual(request.res.body, { ok: false, code: 'REVIEW_READ_TIMEOUT', financialActionsAllowed: false });
  assert.equal(h.reader.stats().operations, 1); assert.equal(h.reader.stats().pendingReads, 1); assert.equal(h.reader.stats().openSessions, 1); assert.equal(h.reader.stats().activeHTTP, 0);
  const count = h.events.filter(event => event.stage === 'cursor:create').length;
  assert.equal((await h.call()).statusCode, 503); assert.equal(h.events.filter(event => event.stage === 'cursor:create').length, count);
  if (stage === 'query:cases') assert.equal(h.events.some(event => event.stage === 'cursor:close' || event.stage === 'abort'), false);
  if (stage === 'cursor:close') assert.equal(h.events.some(event => event.stage === 'abort' || event.stage === 'endSession'), false);
  if (stage === 'abort') assert.equal(h.events.some(event => event.stage === 'endSession'), false);
  gate.resolve(); await pending;
  assert.deepEqual(h.reader.stats(), { operations: 0, activeHTTP: 0, phase: 'ready', pendingReads: 0, openSessions: 0 });
  assert.equal(request.res.statusCode, 504); assert.deepEqual(h.records, h.original);
});
test('native reader: disconnect during pending query does not close/abort early or admit more reads', async t => {
  const gate = deferred(), h = await fixture(t, { env: shortEnv, plan: { 'query:cases': gate } }); t.after(() => gate.resolve());
  const request = transport(), pending = h.reader.handlers.detail(request.req, request.res);
  await until(() => h.events.some(event => event.stage === 'query:cases'));
  request.req.aborted = true; request.req.emit('aborted'); request.res.destroyed = true;
  request.res.emit('close'); request.res.emit('finish'); request.res.emit('close');
  assert.equal(h.reader.stats().operations, 1); assert.equal(h.reader.stats().activeHTTP, 0);
  assert.equal(h.events.some(event => event.stage === 'cursor:close' || event.stage === 'abort'), false);
  assert.equal((await h.call()).statusCode, 503);
  gate.reject(Error('PRIVATE_LATE_ERROR')); await pending;
  assert.equal(h.reader.stats().operations, 0); assert.equal(h.reader.stats().pendingReads, 0); assert.equal(h.reader.stats().openSessions, 0); assert.equal(h.reader.stats().activeHTTP, 0); assert.equal(request.res.body, undefined);
});
test('native reader: no cursor starts after last-case read exhausts/disconnects the shared budget', async t => {
  const h = await fixture(t), request = transport();
  h.plan['query:cases'] = () => { request.req.aborted = true; request.req.emit('aborted'); request.res.destroyed = true; request.res.emit('close'); };
  await h.reader.handlers.detail(request.req, request.res);
  assert.deepEqual(h.events.filter(event => event.stage === 'cursor:create').map(event => event.name), ['cases']);
  assert.equal(h.events.some(event => event.stage === 'commit'), false);
  assert.equal(h.events.filter(event => event.stage === 'abort').length, 1); assert.equal(h.events.filter(event => event.stage === 'endSession').length, 1);
  assert.equal(h.reader.stats().operations, 0);
});
test('native reader: close drains pending read, is idempotent and never closes client beside its query', async t => {
  const gate = deferred(), h = await fixture(t, { env: shortEnv, plan: { 'query:cases': gate } }); t.after(() => gate.resolve());
  const request = transport(), read = h.reader.handlers.detail(request.req, request.res);
  await until(() => h.events.some(event => event.stage === 'query:cases'));
  const close = h.reader.close(); assert.equal(h.reader.close(), close);
  assert.equal(h.events.some(event => event.stage === 'client:close'), false);
  assert.equal((await h.call()).statusCode, 503);
  gate.resolve(); await read; await close;
  assert.equal(h.reader.stats().phase, 'closed'); assert.equal(h.reader.stats().operations, 0);
  assert.equal(h.events.filter(event => event.stage === 'client:close').length, 1);
  assert.ok(h.events.findIndex(event => event.stage === 'client:close') > h.events.findIndex(event => event.stage === 'endSession'));
});
test('native reader: explicit connect failure awaits client cleanup and fails closed without automatic reconnect', async t => {
  const gate = deferred(), h = await fixture(t, { unconnected: true, plan: { connect: Error('PRIVATE_CONNECTION_ERROR'), 'client:close': gate } }); t.after(() => gate.resolve());
  const pending = h.reader.connect(input), rejection = assert.rejects(pending, error => error.publicCode === 'REVIEW_UNAVAILABLE' && !error.message.includes('PRIVATE'));
  await until(() => h.events.some(event => event.stage === 'client:close'));
  assert.equal((await h.call()).statusCode, 503); assert.equal(h.clients.length, 1);
  await assert.rejects(h.reader.connect(input), error => error.publicCode === 'REVIEW_UNAVAILABLE');
  gate.resolve(); await rejection; await h.reader.close(); assert.equal(h.events.filter(event => event.stage === 'client:close').length, 1);
});
test('native reader: shutdown during initial connect waits for connection/cleanup and never becomes ready', async t => {
  const gate = deferred(), h = await fixture(t, { unconnected: true, plan: { connect: gate } }); t.after(() => gate.resolve());
  const connect = h.reader.connect(input), rejection = assert.rejects(connect, error => error.publicCode === 'REVIEW_UNAVAILABLE');
  const close = h.reader.close(); assert.equal((await h.call()).statusCode, 503);
  assert.equal(h.events.some(event => event.stage === 'client:close'), false);
  gate.resolve(); await rejection; await close; assert.equal(h.reader.stats().phase, 'closed');
  assert.equal(h.events.filter(event => event.stage === 'client:close').length, 1);
});
test('native reader: real driver session/wire construction keeps one transaction snapshot without contacting MongoDB', async t => {
  const root = path.dirname(require.resolve('mongodb'));
  const { Connection } = require(path.join(root, 'cmap/connection.js'));
  const { CSOTTimeoutContext } = require(path.join(root, 'timeout.js'));
  const { ReadPreference } = require('mongodb');
  const client = new MongoClient(input.uri, { timeoutMS: 2000 }), session = client.startSession({ causalConsistency: false, defaultTimeoutMS: 2000 });
  t.after(async () => { if (session.inTransaction()) session.transaction.transition('TRANSACTION_ABORTED'); await session.endSession(); await client.close(); });
  session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary', maxCommitTimeMS: 2000 });
  const connection = { description: { type: 'RSPrimary' }, supportsOpMsg: true, hasSessionSupport: true };
  const commands = [];
  for (const command of [{ find: 'cases', filter: { _id: new ObjectId(CASE) } }, { find: 'orders', filter: { _id: new ObjectId(ID) } }, { aggregate: 'audits', pipeline: auditPipeline(new ObjectId(CASE), { page: 1, limit: 25 }), cursor: {} }]) {
    const context = new CSOTTimeoutContext({ timeoutMS: 1000, serverSelectionTimeoutMS: 1000 });
    commands.push(Connection.prototype.prepareCommand.call(connection, 'native_fixture', command, { session, readPreference: ReadPreference.primary, timeoutContext: context }).command);
  }
  assert.equal(commands[0].readConcern.level, 'snapshot'); assert.equal(commands[0].startTransaction, true);
  assert.equal(commands[1].startTransaction, undefined);
  for (const command of commands) {
    assert.equal(command.autocommit, false); assert.deepEqual(command.lsid, commands[0].lsid); assert.deepEqual(command.txnNumber, commands[0].txnNumber);
    assert.ok(command.maxTimeMS > 0 && command.maxTimeMS <= 1000);
  }
  const cursor = client.db('native_fixture').collection('cases').find({}, { session, timeoutMS: 100, maxTimeMS: 100 });
  assert.equal(cursor.cursorOptions.timeoutMS, 100); // Manual transaction permits per-command CSOT.
  await cursor.close({ timeoutMS: 100 });
  // Only local state was exercised: never call next(), connect(), commit() or abort().
  session.transaction.transition('TRANSACTION_ABORTED'); await session.endSession(); await client.close();
});
test('native reader: driver accepts cursor lifetime options and explicit cleanup API without starting an operation', async () => {
  const client = new MongoClient(input.uri, { timeoutMS: 2000 }), session = client.startSession();
  const collection = client.db('native_fixture').collection('orders');
  const cursor = collection.aggregate(listPipeline({ page: 1, limit: 25 }, names, new Date()), { session, timeoutMS: 100, maxTimeMS: 100, readPreference: 'primary' });
  assert.equal(cursor.cursorOptions.timeoutMS, 100); assert.equal(cursor.cursorOptions.maxTimeMS, 100);
  assert.equal(cursor.signal, undefined); assert.equal(cursor.abortListener, undefined);
  await cursor.close({ timeoutMS: 100 }); await session.endSession({ timeoutMS: 100 }); await client.close();
});

test('native reader: already disconnected transport admits no work or session', async t => {
  const h = await fixture(t), request = transport(); request.req.aborted = true;
  await h.reader.handlers.detail(request.req, request.res);
  assert.equal(h.events.some(event => event.stage === 'session:start'), false);
  assert.equal(h.reader.stats().operations, 0);
});
test('native reader: invalid pagination and unauthenticated callers never start driver work', async t => {
  const h = await fixture(t);
  for (const query of [{ page: '0' }, { limit: '101' }, { kind: ['order', 'event'] }, { unknown: 'PRIVATE_INPUT' }]) assert.equal((await h.call('list', query)).statusCode, 400);
  const request = transport(); delete request.req.usuario;
  await h.reader.handlers.list(request.req, request.res); assert.equal(request.res.statusCode, 401);
  const nonAdmin = transport(); nonAdmin.req.usuario.rol = 'cliente';
  await h.reader.handlers.list(nonAdmin.req, nonAdmin.res); assert.equal(nonAdmin.res.statusCode, 403);
  assert.equal(h.events.some(event => event.stage === 'session:start'), false);
});
test('native reader: commit timeout waits for sequential abort and session cleanup', async t => {
  const h = await fixture(t, { plan: { commit: new MongoOperationTimeoutError('PRIVATE_COMMIT') } });
  assert.equal((await h.call('detail')).statusCode, 504);
  const stages = h.events.map(event => event.stage);
  assert.ok(stages.indexOf('abort') > stages.indexOf('commit'));
  assert.ok(stages.indexOf('endSession') > stages.indexOf('abort'));
  assert.equal(h.reader.stats().operations, 0); assert.equal(h.reader.stats().openSessions, 0);
  for (const event of h.events.filter(event => ['cursor:close', 'abort', 'endSession'].includes(event.stage))) assert.equal(event.options.timeoutMS, 2000);
});
test('native reader: exhausted budget prevents the first operation, not merely later queries', async t => {
  const h = await fixture(t), request = transport();
  // Validation and runtime admission execute before the deferred facade work.
  const running = h.reader.handlers.detail(request.req, request.res);
  request.req.emit('aborted'); await running;
  assert.equal(h.events.some(event => event.stage === 'session:start'), false);
  assert.equal(h.reader.stats().operations, 0); assert.equal(h.reader.stats().pendingReads, 0);
});
test('native reader: isolated HTTP GET/HEAD responses share read handlers; POST has no native route', async t => {
  const express = require('express'), http = require('node:http');
  const h = await fixture(t), app = express();
  app.use((req, res, next) => { req.usuario = { _id: ACTOR, rol: 'admin' }; next(); });
  app.get('/reviews', h.reader.handlers.list);
  app.get('/reviews/:caseKey', h.reader.handlers.detail);
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = (method, route) => new Promise((resolve, reject) => {
    const outgoing = http.request({ hostname: '127.0.0.1', port: server.address().port, method, path: route }, response => {
      let body = ''; response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    }); outgoing.on('error', reject); outgoing.end();
  });
  assert.equal((await request('GET', '/reviews')).status, 200);
  const head = await request('HEAD', '/reviews/' + KEY); assert.equal(head.status, 200); assert.equal(head.body, '');
  const calls = h.events.filter(event => event.stage === 'cursor:create').length;
  assert.equal((await request('POST', '/reviews/' + KEY)).status, 404);
  assert.equal(h.events.filter(event => event.stage === 'cursor:create').length, calls);
  assert.deepEqual(h.records, h.original); assert.equal(h.reader.stats().operations, 0);
});


test('native reader: fresh import has no driver loading, connection, session or scheduled-task side effects', () => {
  const { spawnSync } = require('node:child_process');
  const modulePath = path.resolve(__dirname, '../src/services/reconciliationNativeReader.js');
  const result = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict'), Module = require('node:module');
    const load = Module._load;
    Module._load = function(id, ...args) {
      if (/^(mongodb|mongoose|stripe|firebase-admin)(\\/|$)/.test(id)) throw Error('Unexpected service dependency');
      return load.call(this, id, ...args);
    };
    const forbidden = () => { throw Error('Unexpected import side effect'); };
    require('node:net').Socket.prototype.connect = forbidden;
    require('node:tls').connect = forbidden;
    global.setTimeout = global.setInterval = global.setImmediate = global.queueMicrotask = forbidden;
    const reader = require(${JSON.stringify(modulePath)});
    assert.equal(reader.createNativeReconciliationReader(), null);
    assert.equal(typeof reader.createNativeReconciliationReader, 'function');
  `], { env: {}, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
});
test('native reader: direct dependency, lockfile and installed driver are pinned to the same version', () => {
  const backend = path.resolve(__dirname, '..');
  const current = JSON.parse(fs.readFileSync(path.join(backend, 'package-lock.json'), 'utf8'));
  assert.equal(require('../package.json').dependencies.mongodb, '7.0.0');
  assert.equal(require('mongodb/package.json').version, '7.0.0');
  assert.equal(current.packages['node_modules/mongodb'].version, '7.0.0');
  assert.equal(current.packages[''].dependencies.mongodb, '7.0.0');
});
test('native reader: enabled construction alone has no client, session or pool activity', async () => {
  const h = fakeDriver(), reader = createNativeReconciliationReader({ env: enabled, driver: h.driver });
  assert.equal(h.clients.length, 0); assert.deepEqual(h.events, []);
  assert.equal(reader.stats().phase, 'idle');
  const first = reader.close(), second = reader.close(); assert.equal(first, second); await first;
  assert.deepEqual(h.events, []); assert.equal(reader.stats().phase, 'closed');
  await assert.rejects(reader.connect(input), error => error.publicCode === 'REVIEW_UNAVAILABLE');
});
test('native reader: repeated initialization never constructs a second client, including concurrent calls', async t => {
  const gate = deferred(), h = await fixture(t, { unconnected: true, plan: { connect: gate } }); t.after(() => gate.resolve());
  const initial = h.reader.connect(input);
  await assert.rejects(h.reader.connect(input), error => error.publicCode === 'REVIEW_UNAVAILABLE');
  assert.equal(h.clients.length, 1); gate.resolve(); await initial;
  await assert.rejects(h.reader.connect(input), error => error.publicCode === 'REVIEW_UNAVAILABLE');
  await h.call(); await h.call('detail'); assert.equal(h.clients.length, 1);
  await h.reader.close(); assert.equal(h.events.filter(event => event.stage === 'client:close').length, 1);
});
for (const stage of ['constructorError', 'databaseError']) test('native reader: partial initialization ' + stage + ' fails closed and awaits owned cleanup only', async t => {
  const h = await fixture(t, { unconnected: true, plan: { [stage]: Error('PRIVATE_INITIALIZATION') } });
  await assert.rejects(h.reader.connect(input), error => error.publicCode === 'REVIEW_UNAVAILABLE' && !error.message.includes('PRIVATE'));
  assert.equal((await h.call()).statusCode, 503); await h.reader.close();
  assert.equal(h.events.filter(event => event.stage === 'client:close').length, stage === 'constructorError' ? 0 : 1);
  assert.equal(h.reader.stats().phase, 'closed');
});
test('native reader: shutdown failure is generic, memoized and prevents reconnection or replacement clients', async t => {
  const h = await fixture(t, { plan: { 'client:close': Error('PRIVATE_SHUTDOWN') } });
  const closing = h.reader.close(); assert.equal(h.reader.close(), closing);
  await assert.rejects(closing, error => error.publicCode === 'REVIEW_UNAVAILABLE' && !error.message.includes('PRIVATE'));
  await assert.rejects(h.reader.close(), error => error.publicCode === 'REVIEW_UNAVAILABLE');
  assert.equal(h.reader.stats().phase, 'failed'); assert.equal((await h.call()).statusCode, 503);
  await assert.rejects(h.reader.connect(input)); assert.equal(h.clients.length, 1);
  assert.equal(h.events.filter(event => event.stage === 'client:close').length, 1);
});

test('native reader: blocked client close remains awaited without retries or admitting reads', async t => {
  const gate = deferred(), h = await fixture(t, { plan: { 'client:close': gate } }); t.after(() => gate.resolve());
  let settled = false; const close = h.reader.close(); close.then(() => { settled = true; });
  await until(() => h.events.some(event => event.stage === 'client:close'));
  assert.equal(settled, false); assert.equal(h.reader.close(), close);
  assert.equal((await h.call()).statusCode, 503); await assert.rejects(h.reader.connect(input));
  assert.equal(h.clients.length, 1); assert.equal(h.reader.stats().phase, 'closing');
  gate.resolve(); await close; assert.equal(settled, true);
  assert.equal(h.events.filter(event => event.stage === 'client:close').length, 1);
});


test('native reader: connection identity mismatch fails before any read and closes its client', async t => {
  const h = await fixture(t, { unconnected: true, plan: { foreignDatabase: 'different_fixture' } });
  await assert.rejects(h.reader.connect(input), error => error.publicCode === 'REVIEW_UNAVAILABLE');
  assert.equal(h.events.some(event => event.stage === 'cursor:create'), false);
  assert.equal(h.events.filter(event => event.stage === 'client:close').length, 1);
  await h.reader.close();
});

test('native reader: selected production router preserves GET/HEAD auth, errors and Mongoose-only POST', async t => {
  const express = require('express'), http = require('node:http');
  const { createAdminReconciliationRouter } = require('../src/routes/adminReconciliationRoutes');
  const h = await fixture(t), app = express(); let posts = 0;
  const previousOrigin = process.env.CORS_ALLOWED_ORIGINS;
  process.env.CORS_ALLOWED_ORIGINS = 'https://fixture.invalid';
  t.after(() => { if (previousOrigin === undefined) delete process.env.CORS_ALLOWED_ORIGINS; else process.env.CORS_ALLOWED_ORIGINS = previousOrigin; });
  const auth = {
    proteger(req, res, next) { if (!req.headers['x-fixture-role']) return res.status(401).json({ ok: false }); req.usuario = { _id: ACTOR, rol: req.headers['x-fixture-role'] }; next(); },
    soloAdmin(req, res, next) { return req.usuario.rol === 'admin' ? next() : res.status(403).json({ ok: false }); }
  };
  const controller = { list: () => assert.fail('No Mongoose GET fallback'), detail: () => assert.fail('No Mongoose GET fallback'), review(req, res) { posts++; res.json({ ok: true, financialActionsAllowed: false }); } };
  app.use('/reviews', createAdminReconciliationRouter({ readHandlers: h.reader.handlers, controller, auth }));
  const server = http.createServer(app);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = (method, route, role) => new Promise((resolve, reject) => {
    const outgoing = http.request({ hostname: '127.0.0.1', port: server.address().port, method, path: route,
      headers: { ...(role ? { 'x-fixture-role': role } : {}), origin: 'https://fixture.invalid', 'content-type': 'application/json' } }, response => {
      let body = ''; response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body, headers: response.headers }));
    }); outgoing.on('error', reject); outgoing.end();
  });
  assert.equal((await request('GET', '/reviews')).status, 401);
  assert.equal((await request('GET', '/reviews', 'client')).status, 403);
  const listed = await request('GET', '/reviews', 'admin'); assert.equal(listed.status, 200); assert.equal(listed.headers['cache-control'], 'no-store');
  assert.equal((await request('GET', '/reviews?limit=9999', 'admin')).status, 400);
  const head = await request('HEAD', '/reviews/' + KEY, 'admin'); assert.equal(head.status, 200); assert.equal(head.body, '');
  const calls = h.events.filter(event => event.stage === 'cursor:create').length;
  assert.equal((await request('POST', '/reviews/' + KEY + '/reviews', 'admin')).status, 200); assert.equal(posts, 1);
  assert.equal(h.events.filter(event => event.stage === 'cursor:create').length, calls);
  await h.reader.close(); const unavailable = await request('GET', '/reviews', 'admin');
  assert.equal(unavailable.status, 503); assert.doesNotMatch(unavailable.body, /PRIVATE_|mongodb|stack/);
  assert.deepEqual(h.records, h.original);
});

test('native reader: initialization and cleanup failures remain observable without retrying client close', async t => {
  const h = await fixture(t, { unconnected: true, plan: { connect: Error('PRIVATE_CONNECT'), 'client:close': Error('PRIVATE_CLOSE') } });
  await assert.rejects(h.reader.connect(input), error => error.publicCode === 'REVIEW_UNAVAILABLE' && !error.message.includes('PRIVATE'));
  const closing = h.reader.close(); assert.equal(h.reader.close(), closing);
  await assert.rejects(closing, error => error.publicCode === 'REVIEW_UNAVAILABLE' && !error.message.includes('PRIVATE'));
  assert.equal(h.clients.length, 1); assert.equal(h.events.filter(event => event.stage === 'client:close').length, 1);
  assert.equal(h.reader.stats().phase, 'failed'); assert.equal((await h.call()).statusCode, 503);
});

test('native/Mongoose readers preserve payout discovery DTO and projected fields without flags', async t => {
  const records = data(), vendor = 'eeeeeeeeeeeeeeeeeeeeeeee';
  const obligation = `payout_obligation_${ID}_${vendor}`;
  records.orders.inventoryReservation = { state: 'consumed', needsReconciliation: false };
  records.orders.payoutBlocked = false;
  records.orders.historial = [{ estado: obligation, fecha: new Date('2026-10-04'),
    meta: { amount: 1500, currency: 'usd', destination: 'acct_fixture', password: 'PRIVATE_PASSWORD' }, raw: 'PRIVATE_HISTORY' }];
  records.cases = null; records.audits = [];
  const h = await fixture(t, { records });
  const transportDetail = transport({}); transportDetail.req.params = { caseKey: KEY };
  await h.reader.handlers.detail(transportDetail.req, transportDetail.res);
  assert.equal(transportDetail.res.statusCode, 200);
  const dto = transportDetail.res.body.data;
  assert.equal(dto.source.pendingPayouts[0].obligationId, obligation);
  assert.equal(dto.source.operationalPending, true);
  assert.doesNotMatch(JSON.stringify(dto), /PRIVATE_|historial|password/);
  const { orderSourceProjection } = require('../src/services/reconciliationRepository');
  const find = h.events.find(e => e.stage === 'cursor:create' && e.name === names.orders && e.kind === 'find');
  assert.deepEqual(find.options.projection, orderSourceProjection);
  const nativeList = await h.call('list');
  const aggregate = { option() { return Promise.resolve([{ items: [{ _id: KEY, source: records.orders }], total: [{ count: 1 }] }]); } };
  const mongo = createMongoRepository({ mongoose: {}, Orden: { collection: { name: names.orders }, aggregate: () => aggregate },
    WebhookEvent: { collection: { name: names.events } }, Case: { collection: { name: names.cases } }, Audit: {} });
  const mongooseList = await mongo.list({ page: 1, limit: 25 });
  assert.deepEqual(nativeList.body.data.items, mongooseList.items);
  assert.deepEqual(nativeList.body.data.coverage, mongooseList.coverage);
});
