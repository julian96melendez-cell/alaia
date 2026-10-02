'use strict';
// Inert import. Configuration validation precedes driver/model imports and connection.
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { validateConfig: previousConfig, validatePrivileges } = require('./mongo-reconciliation-review-integration');
const { hash, parseKey, sourceSnapshot } = require('../src/services/reconciliationContracts');
const diagnostics = new WeakMap(), attempted = new Set();
const names = Object.freeze({ orders: 'native_orders', events: 'native_events', cases: 'native_cases', audits: 'native_audits' });
const marker = 'alaia_native_reader_run';
function validateConfig(env) {
  try {
    const config = previousConfig(env);
    assert.ok(!attempted.has(config.db));
    assert.ok(env.NODE_ENV === undefined || ['test', 'development'].includes(env.NODE_ENV));
    for (const key of ['DATABASE_URL', 'MONGO_URL', 'MONGODB_URL', 'STRIPE_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_CONFIG']) assert.ok(!env[key]);
    // This runner selects its own bounded limits; ambient activation is forbidden.
    for (const key of Object.keys(env)) assert.ok(!key.startsWith('ALAIA_RECONCILIATION_') && !key.startsWith('MONGODB_LOG_'));
    return config;
  } catch { throw new Error('Invalid isolated native test configuration; details suppressed'); }
}
function formatFailure(error) {
  return { status: 'failed', ...(diagnostics.get(error) || { failedStage: 'unknown', passed: [] }), detailsSuppressed: true, doNotReuseDatabase: true, remoteTermination: 'not_verified' };
}
const deferred = () => { let resolve; const promise = new Promise(ok => { resolve = ok; }); return { promise, resolve }; };
function invocation(reader, method = 'list', query = {}, key) {
  const req = new EventEmitter(), res = new EventEmitter(), response = deferred();
  Object.assign(req, { usuario: { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', rol: 'admin' }, query, params: { caseKey: key } });
  Object.assign(res, { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; this.writableEnded = this.headersSent = true; this.emit('finish'); response.resolve(); return this; } });
  const work = reader.handlers[method](req, res);
  return { req, res, work, response: response.promise };
}
async function read(reader, method, query, key) {
  const call = invocation(reader, method, query, key); await call.work;
  assert.equal(call.res.statusCode, 200);
  assert.doesNotMatch(JSON.stringify(call.res.body), /synthetic-private|requestHash|operationHash|mongodb(?:\+srv)?:\/\/|clienteEmail|stripeSecret/);
  return call.res.body.data;
}
// Race is coordination only: every caller releases its gate and awaits its work
// in finally. Neither a permit nor cleanup is released by this timer.
async function barrier(gate, work) {
  let timer;
  try { await Promise.race([gate, work.then(() => { throw Error('Barrier not reached'); }), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Barrier timeout')), 15000); })]); }
  finally { clearTimeout(timer); }
}
function instrumentDriver(driver) {
  const metrics = { options: [], wire: [], sessions: 0, cursors: 0, checkedOut: new Set(), clients: 0 }, hooks = {};
  class Client extends driver.MongoClient {
    constructor(uri, options) {
      super(uri, { ...options, monitorCommands: true }); metrics.clients++;
      this.on('connectionCheckedOut', event => metrics.checkedOut.add(`${event.address}:${event.connectionId}`));
      this.on('connectionCheckedIn', event => metrics.checkedOut.delete(`${event.address}:${event.connectionId}`));
      this.on('connectionClosed', event => metrics.checkedOut.delete(`${event.address}:${event.connectionId}`));
      this.on('commandStarted', event => {
        if (event.databaseName !== this.options.dbName) return;
        // Store only approved scalars, never command bodies, filters or documents.
        metrics.wire.push({ name: event.commandName, maxTimeMS: event.command.maxTimeMS, transaction: event.command.autocommit === false, snapshot: event.command.readConcern?.level === 'snapshot' });
      });
    }
    startSession(options) {
      const session = super.startSession(options); assert.equal(session.client, this); metrics.sessions++;
      let ended = false; const end = session.endSession.bind(session);
      session.endSession = async opts => { try { return await end(opts); } finally { if (!ended) { ended = true; metrics.sessions--; } } };
      return session;
    }
    db(database, ...dbOptions) {
      const db = super.db(database, ...dbOptions), collection = db.collection.bind(db);
      db.collection = (name, ...collectionOptions) => {
        const value = collection(name, ...collectionOptions);
        for (const method of ['find', 'aggregate']) {
          const create = value[method].bind(value);
          value[method] = (filter, options) => {
            metrics.options.push({ timeoutMS: options.timeoutMS, maxTimeMS: options.maxTimeMS, ownedSession: options.session?.client === this });
            const cursor = create(filter, options); metrics.cursors++;
            let closed = false, busy = false, wrapper;
            // Proxy only the caller-facing cursor. Do not replace its internal
            // close method: the driver itself may clean up within next/toArray.
            wrapper = new Proxy(cursor, { get(target, property) {
              if (['next', 'toArray'].includes(property)) return async () => {
                assert.equal(busy, false); busy = true;
                try {
                  if (hooks.beforeRead) await hooks.beforeRead(name);
                  const result = await target[property]();
                  if (hooks.afterRead) await hooks.afterRead(name);
                  return result;
                } finally { busy = false; }
              };
              if (property === 'close') return async opts => {
                assert.equal(busy, false);
                try { return await target.close(opts); }
                finally { if (!closed) { closed = true; metrics.cursors--; } }
              };
              const value = Reflect.get(target, property, target);
              return typeof value === 'function' ? (...args) => { const result = value.apply(target, args); return result === target ? wrapper : result; } : value;
            } });
            return wrapper;
          };
        }
        return value;
      };
      return db;
    }
  }
  return { driver: { ...driver, MongoClient: Client }, metrics, hooks };
}
async function withCursor(cursor, fn) {
  try { return await fn(cursor); } finally { await cursor.close({ timeoutMS: 2000 }); }
}
async function preflight(client, config) {
  const db = client.db(config.db);
  assert.equal(db.databaseName, config.db);
  validatePrivileges(await db.admin().command({ connectionStatus: 1, showPrivileges: true }, { timeoutMS: 5000 }), config.db);
  const hello = await db.admin().command({ hello: 1 }, { timeoutMS: 5000 });
  assert.ok(hello.setName && hello.isWritablePrimary && hello.logicalSessionTimeoutMinutes != null && hello.maxWireVersion >= 13);
  assert.equal(await withCursor(db.listCollections({}, { nameOnly: true, timeoutMS: 5000 }), cursor => cursor.toArray()).then(items => items.length), 0);
  return db;
}
async function fixtures(db, ObjectId) {
  for (const name of [...Object.values(names), 'native_products', 'native_payouts', 'native_counters']) await db.createCollection(name, { timeoutMS: 5000 });
  const id = new ObjectId(), event = new ObjectId(), historical = new ObjectId(), now = new Date('2026-01-01T00:00:00Z');
  const key = `order:${id}`, caseId = new ObjectId(parseKey(key).caseId), actor = new ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb');
  const order = { _id: id, createdAt: now, updatedAt: now, inventoryReservation: { state: 'reserved', needsReconciliation: true, lines: [{ cantidad: 1 }] }, checkoutIntent: { keyHash: 'synthetic' }, estadoPago: 'pendiente', estadoFulfillment: 'pendiente', payoutBlocked: true, total: 10, moneda: 'usd', vendedorPayouts: [{ status: 'bloqueado' }], clienteEmail: 'synthetic-private' };
  await db.collection(names.orders).insertMany([order, { _id: historical, createdAt: now, updatedAt: now, inventoryReservation: { state: 'reconciliation_required' }, estadoPago: 'pendiente' }]);
  await db.collection(names.events).insertOne({ _id: event, provider: 'stripe', status: 'failed', eventId: 'evt_nativefixture', createdAt: now, updatedAt: now, summary: 'synthetic-private', ordenId: id });
  await db.collection(names.cases).insertOne({ _id: caseId, caseKey: key, sourceKind: 'order', sourceId: id, version: 1, status: 'under_review' });
  const audit = { _id: new ObjectId(), caseId, actorId: actor, resultVersion: 1, status: 'under_review', conclusion: 'awaiting_evidence', evidence: [{ kind: 'internal_ticket', reference: 'OPS-NATIVE' }], sourceSnapshot: sourceSnapshot('order', order), createdAt: now, requestHash: 'synthetic-private', operationHash: 'synthetic-private' };
  await db.collection(names.audits).insertOne(audit);
  for (const [name, record] of [['native_products', { stock: 7 }], ['native_payouts', { status: 'blocked', amount: 3 }], ['native_counters', { key: 'order', seq: 11 }]]) await db.collection(name).insertOne({ _id: new ObjectId(), ...record });
  return { id, key, caseId, audit, now, eventKey: `event:${event}`, historicalKey: `order:${historical}` };
}
async function fingerprint(db) {
  const rows = [];
  for (const name of [names.orders, names.events, 'native_products', 'native_payouts', 'native_counters']) {
    const items = await withCursor(db.collection(name).find({}, { timeoutMS: 5000 }).sort({ _id: 1 }), cursor => cursor.toArray());
    // Only order updatedAt is intentionally changed by the snapshot writer.
    if (name === names.orders) for (const item of items) delete item.updatedAt;
    rows.push(items);
  }
  return hash(rows);
}
async function baseline(uri, database) {
  const Mongoose = require('mongoose').Mongoose, mongoose = new Mongoose();
  mongoose.set('autoCreate', false); mongoose.set('autoIndex', false); mongoose.set('bufferCommands', false);
  try {
    await mongoose.connect(uri, { dbName: database, autoCreate: false, autoIndex: false, bufferCommands: false, serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, waitQueueTimeoutMS: 2000, socketTimeoutMS: 5000, maxPoolSize: 2, minPoolSize: 0, mongodbLogComponentSeverities: { default: 'off' } });
    assert.equal(mongoose.connection.name, database);
    const models = {};
    for (const [label, name] of [['Orden', names.orders], ['WebhookEvent', names.events], ['Case', names.cases], ['Audit', names.audits]]) {
      // Fixture-only models: no production models, hooks, validators or indexes.
      models[label] = mongoose.model(label, new mongoose.Schema({}, { strict: false, autoCreate: false, autoIndex: false, bufferCommands: false }), name);
    }
    const repo = require('../src/services/reconciliationRepository').createMongoRepository({ mongoose, ...models });
    return { service: require('../src/services/reconciliationReviewService').createReconciliationReviewService(repo), close: () => mongoose.disconnect() };
  } catch (error) { await mongoose.disconnect(); throw error; }
}
async function runTrials({ db, setup, config, driver, report, makeReference = baseline, makeReader = options => require('../src/services/reconciliationNativeReader').createNativeReconciliationReader(options) }) {
  const instrumentation = instrumentDriver(driver), { hooks, metrics } = instrumentation;
  const reader = makeReader({ env: { ALAIA_RECONCILIATION_NATIVE_READER_ENABLED: 'true', ALAIA_RECONCILIATION_MAX_CONCURRENT_READS: '2', ALAIA_RECONCILIATION_NATIVE_MAX_POOL_SIZE: '3' }, driver: instrumentation.driver });
  let reference;
  const evidence = {}, before = await fingerprint(db);
  const idle = () => { assert.equal(reader.stats().operations, 0); assert.equal(reader.stats().pendingReads, 0); assert.equal(reader.stats().openSessions, 0); assert.equal(metrics.sessions, 0); assert.equal(metrics.cursors, 0); assert.equal(metrics.checkedOut.size, 0); };
  try {
    await reader.connect({ uri: config.uri, database: config.db, collectionNames: names });
    reference = await makeReference(config.uri, config.db);
    report('A equivalence and privacy');
    for (const query of [{}, { limit: '1', page: '2' }, { kind: 'event' }, { kind: 'order', status: 'under_review' }, { limit: '1', page: '9' }]) assert.deepEqual(await read(reader, 'list', query), await reference.service.list(query));
    assert.deepEqual(await read(reader, 'detail', { limit: '1' }, setup.key), await reference.service.detail(setup.key, { limit: '1' }));
    for (const key of [setup.eventKey, setup.historicalKey]) assert.deepEqual(await read(reader, 'detail', {}, key), await reference.service.detail(key, {}));
    idle(); evidence.equivalence = 'native_vs_fixture_mongoose_repository';
    report('B snapshot during synthetic administrative commit');
    const entered = deferred(), release = deferred(); let intercepted = false;
    hooks.afterRead = async name => { if (name === names.cases && !intercepted) { intercepted = true; entered.resolve(); await release.promise; } };
    const call = invocation(reader, 'detail', { limit: '100' }, setup.key);
    const changedAt = new Date(setup.now.getTime() + 1000); let session;
    try {
      session = db.client.startSession();
      await barrier(entered.promise, call.work);
      session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      const caseWrite = await db.collection(names.cases).updateOne({ _id: setup.caseId, version: 1 }, { $set: { version: 2 } }, { session, timeoutMS: 2000 });
      assert.equal(caseWrite.modifiedCount, 1);
      const sourceWrite = await db.collection(names.orders).updateOne({ _id: setup.id }, { $set: { updatedAt: changedAt } }, { session, timeoutMS: 2000 });
      assert.equal(sourceWrite.modifiedCount, 1);
      await db.collection(names.audits).insertOne({ ...setup.audit, _id: new driver.ObjectId(), resultVersion: 2, createdAt: changedAt, sourceSnapshot: { ...setup.audit.sourceSnapshot, updatedAt: changedAt.toISOString() } }, { session, timeoutMS: 2000 });
      await session.commitTransaction({ timeoutMS: 2000 });
    } finally {
      release.resolve();
      try { await call.work; } finally {
        delete hooks.afterRead;
        if (session) try { if (session.inTransaction()) await session.abortTransaction({ timeoutMS: 2000 }); } finally { await session.endSession({ timeoutMS: 2000 }); }
      }
    }
    assert.equal(call.res.statusCode, 200);
    const snapshot = call.res.body.data, fresh = await read(reader, 'detail', { limit: '100' }, setup.key);
    assert.equal(snapshot.version, 1); assert.equal(snapshot.auditTotal, 1); assert.equal(snapshot.source.updatedAt, setup.now.toISOString());
    assert.equal(fresh.version, 2); assert.equal(fresh.auditTotal, 2); assert.equal(fresh.source.updatedAt, changedAt.toISOString());
    idle(); evidence.snapshot = 'case_source_audits_before_and_after_committed_writer';
    report('C effective driver limits and cursor session cleanup');
    assert.ok(metrics.options.length > 0);
    for (const option of metrics.options) { assert.ok(option.ownedSession); assert.ok(option.timeoutMS > 0 && option.timeoutMS <= 2000 && option.timeoutMS === option.maxTimeMS); }
    const commands = metrics.wire.filter(row => ['find', 'aggregate'].includes(row.name)); assert.ok(commands.length > 0);
    assert.ok(commands.every(row => row.maxTimeMS > 0 && row.maxTimeMS <= 2000));
    assert.ok(commands.some(row => row.snapshot && row.transaction)); idle();
    evidence.driver = { observedReadCommands: commands.length, wireCommandCapMS: 2000, serverTimeoutEnforcement: 'not_certified' };
    report('D HTTP timeout with retained local operation');
    const timeoutGate = deferred(), timeoutEntered = deferred();
    hooks.beforeRead = async () => { timeoutEntered.resolve(); await timeoutGate.promise; throw new driver.MongoOperationTimeoutError('Synthetic local timeout'); };
    const timeoutCall = invocation(reader);
    try {
      await barrier(timeoutEntered.promise, timeoutCall.work); await timeoutCall.response;
      assert.equal(timeoutCall.res.statusCode, 504); assert.equal(reader.stats().operations, 1); assert.equal(reader.stats().activeHTTP, 0);
    } finally { timeoutGate.resolve(); await timeoutCall.work; delete hooks.beforeRead; }
    idle(); await read(reader, 'list', {}); idle(); evidence.timeout = 'injected_local_wait_not_server_cancellation';
    report('E concurrent saturation disconnect and pool recovery');
    const concurrentGate = deferred(), concurrentEntered = deferred(); let arrivals = 0;
    hooks.beforeRead = async () => { if (++arrivals === 2) concurrentEntered.resolve(); await concurrentGate.promise; throw new driver.MongoOperationTimeoutError('Synthetic local timeout'); };
    const first = invocation(reader), second = invocation(reader);
    try {
      await barrier(concurrentEntered.promise, Promise.all([first.work, second.work]));
      const rejected = invocation(reader); await rejected.work; assert.equal(rejected.res.statusCode, 503);
      first.req.aborted = true; first.req.emit('aborted'); first.res.emit('close');
      assert.equal(reader.stats().operations, 2); assert.equal(reader.stats().activeHTTP, 1);
    } finally { concurrentGate.resolve(); await Promise.allSettled([first.work, second.work]); delete hooks.beforeRead; }
    idle(); await read(reader, 'detail', {}, setup.key); idle(); assert.equal(metrics.clients, 1);
    evidence.concurrency = 'two_retained_slots_generic_saturation_then_real_query_recovery';
    report('F financial immutability and local shutdown');
    assert.equal(await fingerprint(db), before);
    const storedOrders = await withCursor(db.collection(names.orders).find({}, { timeoutMS: 5000 }), cursor => cursor.toArray());
    for (const order of storedOrders) assert.equal(order.updatedAt.toISOString(), String(order._id) === String(setup.id) ? new Date(setup.now.getTime() + 1000).toISOString() : setup.now.toISOString());
    idle(); await reader.close(); idle();
    assert.equal(reader.stats().phase, 'closed'); evidence.financialState = 'unchanged_except_declared_order_updatedAt_metadata';
    return evidence;
  } finally {
    // Independent clients, but sequential shutdown; no cleanup is detached.
    try { await reader.close(); } finally { if (reference) await reference.close(); }
  }
}
async function main(env = process.env, { loadDriver = () => require('mongodb') } = {}) {
  let client, config, stage = 'configuration', failure, evidence, claimed = false, markerAcknowledged = false; const passed = [];
  const report = next => { if (stage.startsWith('trial: ')) passed.push(stage.slice(7)); stage = `trial: ${next}`; };
  try {
    config = validateConfig(env); // No driver import/client construction on rejection.
    assert.equal(require('mongodb/package.json').version, '7.0.0'); const driver = loadDriver();
    stage = 'connect'; client = new driver.MongoClient(config.uri, { dbName: config.db, maxPoolSize: 2, minPoolSize: 0, maxConnecting: 1, serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, waitQueueTimeoutMS: 2000, socketTimeoutMS: 5000, timeoutMS: 5000, retryWrites: false, monitorCommands: false, mongodbLogComponentSeverities: { default: 'off' } });
    await client.connect(); stage = 'read-only preflight'; const db = await preflight(client, config);
    stage = 'permanent single-use claim'; attempted.add(config.db); claimed = true;
    await db.createCollection(marker, { timeoutMS: 5000 });
    // Unique _id is an atomic cross-process claim after the empty-base check.
    await db.collection(marker).insertOne({ _id: 'single-use', runner: 'mongo-native-reconciliation-reader-integration', createdAt: new Date(), doNotReuseDatabase: true }, { timeoutMS: 5000, writeConcern: { w: 'majority' } });
    markerAcknowledged = true;
    stage = 'synthetic fixtures'; const setup = await fixtures(db, driver.ObjectId);
    evidence = await runTrials({ db, setup, config, driver, report });
    if (stage.startsWith('trial: ')) passed.push(stage.slice(7)); stage = 'setup client cleanup';
  } catch (error) {
    failure = new Error('Isolated native integration failed; details suppressed');
    diagnostics.set(failure, { failedStage: stage, passed: [...passed], syntheticDataRetained: claimed, claimAttempted: claimed, markerAcknowledged });
  } finally {
    if (client) try { await client.close(); } catch { if (!failure) { failure = new Error('Isolated cleanup failed; details suppressed'); diagnostics.set(failure, { failedStage: 'setup client cleanup', passed: [...passed], syntheticDataRetained: claimed, claimAttempted: claimed, markerAcknowledged }); } }
  }
  if (failure) throw failure;
  return { database: config.db, passed, evidence, claimAttempted: true, markerAcknowledged, syntheticDataRetained: true, doNotReuseDatabase: true, remoteTermination: 'not_verified', performance: 'not_certified' };
}
if (require.main === module) main().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(JSON.stringify(formatFailure(error))); process.exitCode = 1; });
module.exports = { validateConfig, validatePrivileges, preflight, formatFailure, instrumentDriver, invocation, barrier, main, runTrials };
