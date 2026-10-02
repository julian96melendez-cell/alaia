'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { getReconciliationReadLimits } = require('../src/config/reconciliationReads');
const { createReadBudget, createReconciliationReadRuntime } = require('../src/services/reconciliationReadRuntime');
const { createMongoRepository, listPipeline, auditPipeline } = require('../src/services/reconciliationRepository');
const { createReconciliationReviewService } = require('../src/services/reconciliationReviewService');
const ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';

test('reconciliation read limits: defaults, bounds and invalid configuration fail without echoing input', () => {
  assert.deepEqual(getReconciliationReadLimits({}), { mongoMaxTimeMS: 2000, httpTimeoutMS: 8000, maxConcurrent: 4 });
  for (const [name, low, high] of [['ALAIA_RECONCILIATION_MONGO_MAX_TIME_MS', 100, 10000], ['ALAIA_RECONCILIATION_READ_TIMEOUT_MS', 500, 15000], ['ALAIA_RECONCILIATION_MAX_CONCURRENT_READS', 1, 16]]) {
    for (const value of [String(low), String(high)]) assert.doesNotThrow(() => getReconciliationReadLimits({ [name]: value }));
    for (const value of ['0', '-1', '1.2', ' 4', '', 'PRIVATE_PASSWORD', String(high + 1), String(low - 1)]) {
      assert.throws(() => getReconciliationReadLimits({ [name]: value }), error => error.message === 'Invalid reconciliation read configuration');
    }
  }
});
test('reconciliation read budget: command cap shrinks with shared deadline and never emits maxTimeMS zero', () => {
  let now = 1000;
  const budget = createReadBudget({ mongoMaxTimeMS: 100, httpTimeoutMS: 500 }, () => now);
  assert.equal(budget.maxTimeMS(), 100); assert.equal(budget.remainingTimeMS(), 500);
  now = 1499; assert.equal(budget.maxTimeMS(), 1);
  now = 1500; assert.throws(() => budget.maxTimeMS(), error => error.publicCode === 'REVIEW_READ_TIMEOUT');
  const stopped = createReadBudget({ mongoMaxTimeMS: 100, httpTimeoutMS: 500 }); stopped.stop();
  assert.throws(() => stopped.maxTimeMS(), error => error.statusCode === 504);
});
test('reconciliation repository: list/audit aggregates receive bounded options without changing pipelines', async () => {
  const mongoose = require('mongoose'), session = {}, options = { page: 2, limit: 5 }, calls = [];
  const collections = { orders: 'orders', events: 'events', cases: 'cases' };
  const aggregate = kind => pipeline => ({
    option(value) { calls.push({ kind, pipeline, value }); return this; },
    session(actual) { assert.equal(actual, session); return Promise.resolve([{ items: [], total: [] }]); },
    then(resolve, reject) { return Promise.resolve([{ items: [], total: [] }]).then(resolve, reject); },
  });
  const repo = createMongoRepository({ mongoose, Orden: { collection: { name: 'orders' }, aggregate: aggregate('list') }, WebhookEvent: { collection: { name: 'events' } }, Case: { collection: { name: 'cases' } }, Audit: { aggregate: aggregate('audit') } });
  await repo.list(options); await repo.listAudits(ID, options, session);
  assert.deepEqual(calls.map(call => call.value), [{ maxTimeMS: 2000 }, { maxTimeMS: 2000 }]);
  const cutoff = calls[0].pipeline[2].$unionWith.pipeline[0].$match.$or[1].updatedAt.$lte;
  assert.deepEqual(calls[0].pipeline, listPipeline(options, collections, new Date(cutoff.getTime() + 300000)));
  assert.deepEqual(calls[1].pipeline, auditPipeline(new mongoose.Types.ObjectId(ID), options));
  await repo.list(options, { maxTimeMS: () => 37 });
  await repo.listAudits(ID, options, session, { maxTimeMS: () => 23 });
  assert.deepEqual(calls.slice(2).map(call => call.value), [{ maxTimeMS: 37 }, { maxTimeMS: 23 }]);
});
test('reconciliation detail: case/source queries and snapshot commit have bounded execution options', async () => {
  let commitOptions, cleanup = 0; const queries = [];
  const session = { withTransaction: async (fn, options) => { commitOptions = options; await fn(); }, endSession: async () => { cleanup++; } };
  const findById = id => {
    assert.equal(id, ID); const query = { session(actual) { assert.equal(actual, session); return this; }, select() { return this; }, maxTimeMS(value) { queries.push(value); return this; }, lean: async () => null };
    return query;
  };
  const repo = createMongoRepository({ mongoose: { startSession: async () => session }, Case: { findById }, Orden: { findById }, WebhookEvent: { findById }, Audit: {} });
  const budget = { maxTimeMS: () => 42 };
  await repo.readSnapshot(async actual => {
    await repo.getCase(ID, actual, budget); await repo.getSource({ kind: 'order', id: ID }, actual, budget); await repo.getSource({ kind: 'event', id: ID }, actual, budget);
  }, budget);
  assert.deepEqual(queries, [42, 42, 42]); assert.equal(commitOptions.maxCommitTimeMS, 42); assert.equal(cleanup, 1);
  assert.equal(commitOptions.readConcern.level, 'snapshot');
});
test('reconciliation detail: disconnect/deadline prevents subsequent reads and still awaits snapshot cleanup', async () => {
  const budget = createReadBudget({ mongoMaxTimeMS: 100, httpTimeoutMS: 500 }); let reads = 0, cleanup = 0;
  const repo = { readSnapshot: async fn => { try { return await fn({}); } finally { cleanup++; } }, getCase: async () => { reads++; budget.stop(); return null; }, getSource: async () => assert.fail('Read after disconnect'), listAudits: async () => assert.fail('Audit after disconnect') };
  await assert.rejects(createReconciliationReviewService(repo).detail('order:' + ID, {}, budget), error => error.statusCode === 504);
  assert.equal(reads, 1); assert.equal(cleanup, 1);
});
test('reconciliation detail: direct service calls also receive a budget without requiring HTTP', async () => {
  let passed;
  const service = createReconciliationReviewService({ readSnapshot: async (fn, budget) => { passed = budget; return fn({}); }, getCase: async () => null, getSource: async (_reference, _session, budget) => { assert.equal(budget, passed); return null; } });
  await assert.rejects(service.detail('order:' + ID, {}), error => error.publicCode === 'REVIEW_NOT_FOUND');
  assert.ok(passed.maxTimeMS() > 0 && passed.maxTimeMS() <= 2000);
});
test('reconciliation runtime: synchronous failure and late rejection free capacity without unhandled errors', async () => {
  const runtime = createReconciliationReadRuntime({ mongoMaxTimeMS: 100, httpTimeoutMS: 500, maxConcurrent: 1 });
  const res = new EventEmitter(); res.status = () => res; res.json = () => { res.writableEnded = true; res.emit('finish'); };
  await assert.rejects(runtime.run(new EventEmitter(), res, () => { throw Error('fixture failure'); }));
  assert.equal(runtime.stats().operations, 0); res.emit('close'); assert.equal(runtime.stats().activeHTTP, 0);
  const disconnected = new EventEmitter(); let reject;
  const pending = runtime.run(new EventEmitter(), disconnected, () => new Promise((_resolve, fail) => { reject = fail; }));
  disconnected.destroyed = true; disconnected.emit('close');
  assert.deepEqual(runtime.stats(), { operations: 1, activeHTTP: 0 });
  reject(Error('late failure')); await assert.rejects(pending);
  assert.deepEqual(runtime.stats(), { operations: 0, activeHTTP: 0 });
});

const deferred = () => {
  let resolve, reject; const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
};
const tickUntil = async predicate => {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setImmediate(resolve)); }
  assert.fail('Local lifecycle did not reach expected stage');
};
function transport() {
  const req = new EventEmitter(), res = new EventEmitter(), response = deferred();
  res.status = status => { res.statusCode = status; return res; };
  res.json = body => { res.body = body; res.headersSent = true; res.writableEnded = true; res.emit('finish'); response.resolve(); return res; };
  return { req, res, response };
}
function driverSession({ abortWait, cleanupWait, commitError, cleanupError } = {}) {
  const { ClientSession } = require('mongodb');
  const session = new EventEmitter(), events = [];
  Object.assign(session, {
    clientOptions: {}, client: { topology: null }, serverSession: null, hasEnded: false,
    transaction: { state: 'NO_TRANSACTION' },
    inTransaction() { return this.transaction.state === 'TRANSACTION_IN_PROGRESS'; },
    startTransaction() { events.push('start'); this.transaction.state = 'TRANSACTION_IN_PROGRESS'; },
    async abortTransaction() {
      events.push('abort:start'); if (abortWait) await abortWait;
      this.transaction.state = 'TRANSACTION_ABORTED'; events.push('abort:end');
    },
    async commitTransaction() {
      events.push('commit'); if (commitError) throw commitError;
      this.transaction.state = 'TRANSACTION_COMMITTED';
    },
    withTransaction: ClientSession.prototype.withTransaction,
    async endSession() {
      events.push('cleanup:start'); if (cleanupWait) await cleanupWait;
      try { await ClientSession.prototype.endSession.call(this); }
      finally { events.push('cleanup:end'); }
      if (cleanupError) throw cleanupError;
    },
  });
  return { session, events };
}

test('reconciliation runtime: disconnected/finished transports never acquire even when all slots are occupied', async () => {
  const runtime = createReconciliationReadRuntime({ mongoMaxTimeMS: 100, httpTimeoutMS: 500, maxConcurrent: 1 });
  const first = transport(), gate = deferred();
  const pending = runtime.run(first.req, first.res, () => gate.promise);
  for (const flag of ['aborted', 'destroyed', 'closed', 'writableEnded']) {
    const h = transport(); (flag === 'aborted' ? h.req : h.res)[flag] = true;
    await assert.rejects(runtime.run(h.req, h.res, () => assert.fail('Operation after disconnect')), error => error.publicCode === 'REVIEW_READ_TIMEOUT');
    assert.deepEqual(runtime.stats(), { operations: 1, activeHTTP: 1 });
    assert.equal(h.res.listenerCount('finish'), 0); assert.equal(h.req.listenerCount('aborted'), 0);
  }
  gate.resolve(); await pending; first.res.writableEnded = true; first.res.emit('finish');
  assert.deepEqual(runtime.stats(), { operations: 0, activeHTTP: 0 });
});
test('reconciliation runtime: abort/close/finish races release HTTP once and hold operation until settlement', async () => {
  const runtime = createReconciliationReadRuntime({ mongoMaxTimeMS: 100, httpTimeoutMS: 500, maxConcurrent: 1 });
  for (const sequence of [['aborted', 'close', 'finish', 'close'], ['close', 'aborted', 'finish', 'close'], ['finish', 'close', 'aborted', 'finish']]) {
    const h = transport(), gate = deferred();
    const pending = runtime.run(h.req, h.res, () => gate.promise);
    const rejected = assert.rejects(pending, error => error.statusCode === 504);
    for (const event of sequence) {
      if (event === 'aborted') { h.req.aborted = true; h.req.emit(event); }
      else h.res.emit(event);
      assert.deepEqual(runtime.stats(), { operations: 1, activeHTTP: 0 });
    }
    gate.resolve(); await rejected;
    assert.deepEqual(runtime.stats(), { operations: 0, activeHTTP: 0 });
    assert.equal(h.req.listenerCount('aborted'), 0); assert.equal(h.res.listenerCount('close'), 0); assert.equal(h.res.listenerCount('finish'), 0);
  }
});
test('reconciliation snapshot: HTTP 504 retains slot through late query, driver abort and endSession', async () => {
  const runtime = createReconciliationReadRuntime({ mongoMaxTimeMS: 100, httpTimeoutMS: 500, maxConcurrent: 1 });
  const query = deferred(), abort = deferred(), cleanup = deferred(), h = transport();
  const { session, events } = driverSession({ abortWait: abort.promise, cleanupWait: cleanup.promise });
  const repo = createMongoRepository({ mongoose: { startSession: async () => session }, Orden: {}, WebhookEvent: {}, Case: {}, Audit: {} });
  const pending = runtime.run(h.req, h.res, budget => repo.readSnapshot(async () => { events.push('query'); await query.promise; return {}; }, budget));
  const rejected = assert.rejects(pending, error => error.statusCode === 504);
  await h.response.promise;
  assert.deepEqual(h.res.body, { ok: false, code: 'REVIEW_READ_TIMEOUT', financialActionsAllowed: false });
  assert.deepEqual(runtime.stats(), { operations: 1, activeHTTP: 0 });
  assert.deepEqual(events, ['start', 'query']); // No abort alongside the active query.
  query.resolve(); await tickUntil(() => events.includes('abort:start'));
  assert.equal(events.includes('commit'), false); assert.equal(runtime.stats().operations, 1);
  abort.resolve(); await tickUntil(() => events.includes('cleanup:start'));
  assert.equal(runtime.stats().operations, 1); assert.equal(events.includes('cleanup:end'), false);
  cleanup.resolve(); await rejected;
  assert.deepEqual(events, ['start', 'query', 'abort:start', 'abort:end', 'cleanup:start', 'cleanup:end']);
  assert.equal(session.hasEnded, true); assert.deepEqual(runtime.stats(), { operations: 0, activeHTTP: 0 });
});
test('reconciliation snapshot: disconnect during last read awaits abort/cleanup without a commit', async () => {
  const runtime = createReconciliationReadRuntime({ mongoMaxTimeMS: 100, httpTimeoutMS: 500, maxConcurrent: 1 });
  const query = deferred(), h = transport(), { session, events } = driverSession();
  const repo = createMongoRepository({ mongoose: { startSession: async () => session }, Orden: {}, WebhookEvent: {}, Case: {}, Audit: {} });
  const pending = runtime.run(h.req, h.res, budget => repo.readSnapshot(async () => { events.push('query'); await query.promise; }, budget));
  const rejected = assert.rejects(pending, error => error.statusCode === 504);
  await tickUntil(() => events.includes('query')); h.req.aborted = true; h.req.emit('aborted');
  assert.deepEqual(events, ['start', 'query']); assert.deepEqual(runtime.stats(), { operations: 1, activeHTTP: 0 });
  query.resolve(); await rejected;
  assert.equal(events.includes('commit'), false); assert.equal(session.hasEnded, true);
  assert.deepEqual(runtime.stats(), { operations: 0, activeHTTP: 0 }); assert.equal(h.res.body, undefined);
});
test('reconciliation snapshot: failed commit and cleanup failure still await endSession; write transaction stays unchanged', async () => {
  const { MongoServerError } = require('mongodb');
  const commitError = new MongoServerError({ code: 50, errmsg: 'PRIVATE_DRIVER_ERROR' });
  const { session, events } = driverSession({ commitError });
  const repo = createMongoRepository({ mongoose: { startSession: async () => session }, Orden: {}, WebhookEvent: {}, Case: {}, Audit: {} });
  await assert.rejects(repo.readSnapshot(async () => ({}), { maxTimeMS: () => 100 }), error => error.code === 50);
  assert.deepEqual(events, ['start', 'commit', 'cleanup:start', 'abort:start', 'abort:end', 'cleanup:end']); assert.equal(session.hasEnded, true);
  const broken = driverSession({ cleanupError: Error('PRIVATE_CLEANUP_ERROR') });
  const cleanupRepo = createMongoRepository({ mongoose: { startSession: async () => broken.session }, Orden: {}, WebhookEvent: {}, Case: {}, Audit: {} });
  await assert.rejects(cleanupRepo.readSnapshot(async () => ({}), { maxTimeMS: () => 100 }), /PRIVATE_CLEANUP_ERROR/);
  assert.equal(broken.session.hasEnded, true);
  let options;
  const writeSession = { withTransaction: async (fn, actual) => { options = actual; await fn(); }, endSession: async () => {} };
  const writeRepo = createMongoRepository({ mongoose: { startSession: async () => writeSession }, Orden: {}, WebhookEvent: {}, Case: {}, Audit: {} });
  await writeRepo.transaction(async actual => assert.equal(actual, writeSession));
  assert.deepEqual(options, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
});
test('reconciliation snapshot: timeout before session creation settles still awaits endSession with no transaction start', async () => {
  const runtime = createReconciliationReadRuntime({ mongoMaxTimeMS: 100, httpTimeoutMS: 500, maxConcurrent: 1 });
  const acquire = deferred(), h = transport(), { session, events } = driverSession();
  const repo = createMongoRepository({ mongoose: { startSession: () => acquire.promise }, Orden: {}, WebhookEvent: {}, Case: {}, Audit: {} });
  const pending = runtime.run(h.req, h.res, budget => repo.readSnapshot(async () => assert.fail('Late transaction callback'), budget));
  const rejected = assert.rejects(pending, error => error.statusCode === 504);
  h.req.aborted = true; h.req.emit('aborted'); assert.equal(runtime.stats().operations, 1);
  acquire.resolve(session); await rejected;
  assert.deepEqual(events, ['cleanup:start', 'cleanup:end']); assert.equal(session.hasEnded, true);
  assert.deepEqual(runtime.stats(), { operations: 0, activeHTTP: 0 });
});
test('reconciliation snapshot: transaction retry checks stopped budget before starting another read', async () => {
  const { MongoServerError } = require('mongodb'), budget = createReadBudget({ mongoMaxTimeMS: 100, httpTimeoutMS: 500 });
  const { session, events } = driverSession(); let callbacks = 0;
  const repo = createMongoRepository({ mongoose: { startSession: async () => session }, Orden: {}, WebhookEvent: {}, Case: {}, Audit: {} });
  await assert.rejects(repo.readSnapshot(async () => {
    callbacks++; budget.stop(); const error = new MongoServerError({ errmsg: 'PRIVATE_RETRY_ERROR' }); error.addErrorLabel('TransientTransactionError'); throw error;
  }, budget), error => error.statusCode === 504);
  assert.equal(callbacks, 1); assert.equal(events.filter(event => event === 'start').length, 2);
  assert.equal(events.filter(event => event === 'abort:start').length, 2); assert.equal(session.hasEnded, true);
});

test('reconciliation controller: pre-disconnected read never invokes service or admission', async () => {
  const { createAdminReconciliationController } = require('../src/controllers/adminReconciliationController');
  const controller = createAdminReconciliationController(() => assert.fail('Service after disconnect'), { run: () => assert.fail('Admission after disconnect') });
  for (const flag of ['aborted', 'destroyed', 'closed', 'writableEnded']) {
    const h = transport(); h.req.usuario = { rol: 'admin' };
    h.res.setHeader = () => assert.fail('Headers after disconnect');
    (flag === 'aborted' ? h.req : h.res)[flag] = true;
    await controller.list(h.req, h.res); assert.equal(h.res.body, undefined);
  }
});
