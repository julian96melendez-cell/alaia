'use strict';
// Independent opt-in runner. Import/configuration never loads a driver or service.
const assert = require('node:assert/strict'), path = require('node:path'), crypto = require('node:crypto');
const { validateConfig: previousConfig, validatePrivileges } = require('./mongo-native-reconciliation-reader-integration');
const { acquireLedger, historical } = require('./reconciliation-integration/consumptionLedger');
const marker = 'alaia_express_native_run';
const names = Object.freeze(['express_users', 'express_orders', 'express_events', 'express_cases', 'express_audits', 'express_counters', 'express_products', 'express_payouts', marker]);
function validateConfig(env) {
  try {
    const config = previousConfig(env), ledger = env.ALAIA_MONGO_TEST_LEDGER_PATH;
    for (const key of ['NODE_OPTIONS', 'NODE_DEBUG', 'DEBUG']) assert.equal(env[key], undefined);
    assert.ok(!historical.includes(config.db));
    assert.equal(typeof ledger, 'string'); assert.ok(path.isAbsolute(ledger));
    assert.equal(path.basename(ledger), 'consumed-databases.json');
    assert.ok(!ledger.startsWith(path.resolve(__dirname, '../..') + path.sep));
    return { ...config, ledger };
  } catch { throw Error('Invalid isolated Express integration configuration'); }
}
async function cursorResult(cursor) { try { return await cursor.toArray(); } finally { await cursor.close({ timeoutMS: 2000 }); } }
async function verifyConnection(client, config, { empty = false, transaction = false } = {}) {
  const db = client.db(config.db); assert.equal(db.databaseName, config.db);
  const authentication = await db.admin().command({ connectionStatus: 1, showPrivileges: true }, { timeoutMS: 5000 });
  validatePrivileges(authentication, config.db);
  const actions = new Set();
  for (const privilege of authentication.authInfo.authenticatedUserPrivileges) {
    assert.ok(Array.isArray(privilege.actions) && privilege.actions.length > 0);
    for (const action of privilege.actions) { assert.ok(typeof action === 'string' && /^[A-Za-z][A-Za-z0-9]*$/.test(action) && action !== 'anyAction'); actions.add(action); }
  }
  assert.ok(['find', 'insert', 'update', 'listCollections', 'createCollection'].every(action => actions.has(action)));
  const hello = await db.admin().command({ hello: 1 }, { timeoutMS: 5000 });
  assert.ok(hello.isWritablePrimary === true && typeof hello.setName === 'string' && hello.setName.length > 0 && Number.isFinite(hello.logicalSessionTimeoutMinutes) && hello.logicalSessionTimeoutMinutes > 0 && Number.isSafeInteger(hello.maxWireVersion) && hello.maxWireVersion >= 13);
  if (empty) {
    const collections = await cursorResult(db.listCollections({}, { nameOnly: true, timeoutMS: 5000 }));
    assert.ok(Array.isArray(collections)); assert.equal(collections.length, 0);
  }
  if (transaction) {
    const session = client.startSession();
    try {
      session.startTransaction({ readConcern: { level: 'snapshot' }, readPreference: 'primary' });
      await cursorResult(db.collection(marker).find({ _id: 'read-only-capability-probe' }, { session, timeoutMS: 5000, maxTimeMS: 2000 }));
    } finally {
      try { if (session.inTransaction()) await session.abortTransaction({ timeoutMS: 2000 }); }
      finally { await session.endSession({ timeoutMS: 2000 }); }
    }
  }
  return db;
}
async function seed(runtime, db, checkSignal = () => {}) {
  for (const name of names.filter(name => name !== marker)) { checkSignal(); await db.createCollection(name, { timeoutMS: 5000 }); }
  const id = new runtime.mongoose.Types.ObjectId(), eventId = new runtime.mongoose.Types.ObjectId();
  checkSignal(); await db.collection('express_orders').insertOne({ _id: id, orderNumber: 900001, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'), inventoryReservation: { state: 'reserved', needsReconciliation: true, lines: [{ cantidad: 1 }] }, estadoPago: 'pendiente', estadoFulfillment: 'pendiente', payoutBlocked: true, total: 10, moneda: 'usd', clienteEmail: 'PRIVATE_ORDER_EMAIL', direccionEntrega: { street: 'PRIVATE_ADDRESS' }, vendedorPayouts: [{ status: 'bloqueado' }] }, { writeConcern: { w: 'majority' } });
  checkSignal(); await runtime.models.WebhookEvent.create({ _id: eventId, provider: 'stripe', eventId: 'evt_expressfixture', eventType: 'checkout.session.completed', status: 'failed', errorMessage: 'PRIVATE_EVENT_ERROR' });
  const password = crypto.randomBytes(32).toString('hex');
  const users = [];
  for (const user of [{ nombre: 'Fixture Admin', email: 'admin@fixture.invalid', password, rol: 'admin', activo: true }, { nombre: 'Fixture User', email: 'user@fixture.invalid', password, rol: 'usuario', activo: true }]) { checkSignal(); users.push(await runtime.models.Usuario.create(user)); }
  for (const [name, record] of [['express_products', { stock: 7 }], ['express_payouts', { status: 'blocked', amount: 3 }], ['express_counters', { key: 'order', seq: 11 }]]) { checkSignal(); await db.collection(name).insertOne({ _id: new runtime.mongoose.Types.ObjectId(), ...record }, { writeConcern: { w: 'majority' } }); }
  return { key: 'order:' + id, eventKey: 'event:' + eventId, admin: users[0], user: users[1] };
}
async function fingerprint(db) {
  const records = [];
  for (const name of ['express_orders', 'express_events', 'express_products', 'express_payouts', 'express_counters']) records.push(await cursorResult(db.collection(name).find({}, { timeoutMS: 5000 }).sort({ _id: 1 })));
  return crypto.createHash('sha256').update(JSON.stringify(records)).digest('hex');
}
function safeSummary(state) {
  return { status: state.failed ? 'failed' : 'passed', failedStage: state.failed ? state.stage : null, runId: state.runId, referenceCommit: '199f067d0ffe4a2a74009e48c2d427a0b7c9ff51', startedAt: state.startedAt, endedAt: state.endedAt || null, database: state.database || null,
    trials: state.trials, claimAttempted: state.claimAttempted, markerAcknowledged: state.markerAcknowledged, markerVerified: Boolean(state.markerVerified),
    syntheticDataRetained: state.fixturesSeeded ? true : state.seedAttempted ? null : false, consumptionAttempted: Boolean(state.consumptionAttempted), doNotReuseDatabase: true, cleanup: state.cleanup,
    interrupted: Boolean(state.interrupted), remoteTermination: 'not_verified', serverTimeoutEnforcement: 'not_verified', performance: 'not_verified', detailsSuppressed: true };
}
async function main(env = process.env, dependencies = {}) {
  const state = { runId: crypto.randomUUID(), startedAt: new Date().toISOString(), stage: 'configuration', trials: [], claimAttempted: false, markerAcknowledged: false, failed: false, cleanup: 'not_started' };
  dependencies.onState?.(state);
  const signal = dependencies.signal;
  const checkSignal = () => { if (signal?.aborted) { state.interrupted = true; throw Error('Integration interrupted'); } };
  let config, ledger, client, runtime;
  const applications = [], fenceEvidence = { forbiddenAttempt: false };
  const trial = async (name, origin, operation) => {
    checkSignal();
    state.stage = 'trial:' + name;
    try { const evidence = await operation(); checkSignal(); state.trials.push({ name, origin, status: 'passed', evidence }); }
    catch { state.trials.push({ name, origin, status: 'failed', evidence: { detailsSuppressed: true } }); throw Error('Integration trial failed'); }
  };
  try {
    config = validateConfig(env); state.database = config.db; checkSignal();
    state.stage = 'consumption ledger'; ledger = (dependencies.acquireLedger || acquireLedger)(config.ledger); ledger.assertUnused(config.db);
    state.stage = 'load isolated dependencies';
    const raw = (dependencies.loadDependencies || (() => ({ driver: require('mongodb'), Mongoose: require('mongoose').Mongoose, version: require('mongodb/package.json').version })))();
    assert.equal(raw.version, '7.0.0'); checkSignal();
    const { fencedDriver, fenceClient } = require('./reconciliation-integration/databaseFence');
    const driver = fencedDriver(raw.driver, { uri: config.uri, database: config.db, names, authorize: connected => { checkSignal(); return verifyConnection(connected, config); } }, fenceEvidence);
    state.stage = 'connect and read-only preflight';
    client = new driver.MongoClient(config.uri, { dbName: config.db, maxPoolSize: 2, minPoolSize: 0, maxConnecting: 1, serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, waitQueueTimeoutMS: 2000, socketTimeoutMS: 5000, timeoutMS: 5000, retryWrites: false, mongodbLogComponentSeverities: { default: 'off' } });
    await client.connect(); checkSignal(); const db = await verifyConnection(client, config, { empty: true, transaction: true }); checkSignal();
    state.stage = 'isolated Mongoose';
    runtime = (dependencies.createRuntime || require('./reconciliation-integration/isolatedRuntime').createIsolatedRuntime)({ Mongoose: raw.Mongoose, driver, database: config.db });
    await runtime.mongoose.connect(config.uri, { dbName: config.db, autoCreate: false, autoIndex: false, bufferCommands: false, maxPoolSize: 3, minPoolSize: 0, serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, waitQueueTimeoutMS: 2000, socketTimeoutMS: 5000, retryWrites: false, mongodbLogComponentSeverities: { default: 'off' } });
    assert.equal(runtime.mongoose.connection.name, config.db);
    checkSignal();
    fenceClient(runtime.mongoose.connection.getClient(), { database: config.db, names }, fenceEvidence);
    runtime.mongoose.connection.db = runtime.mongoose.connection.getClient().db(config.db);
    for (const model of Object.values(runtime.models)) model.collection.collection = runtime.mongoose.connection.db.collection(model.collection.name);
    await verifyConnection(runtime.mongoose.connection.getClient(), config, { empty: true, transaction: true });
    checkSignal();
    state.stage = 'durable consumption'; state.consumptionAttempted = true; ledger.consume(config.db);
    state.stage = 'permanent marker'; checkSignal(); state.claimAttempted = true;
    await db.createCollection(marker, { timeoutMS: 5000 });
    checkSignal();
    const acknowledged = await db.collection(marker).insertOne({ _id: 'single-use', runId: state.runId, createdAt: new Date(), runner: 'mongo-express-native-reconciliation-integration', doNotReuseDatabase: true }, { timeoutMS: 5000, writeConcern: { w: 'majority' } });
    assert.equal(acknowledged.acknowledged, true); state.markerAcknowledged = true;
    const markers = await cursorResult(db.collection(marker).find({ _id: 'single-use' }, { timeoutMS: 5000 }));
    assert.equal(markers.length, 1); assert.equal(markers[0].runId, state.runId);
    state.markerVerified = true;
    checkSignal(); state.stage = 'fixtures'; state.seedAttempted = true; const fixture = await seed(runtime, db, checkSignal); state.fixturesSeeded = true;
    const initial = await fingerprint(db);
    const makeApp = dependencies.createApplication || require('./reconciliation-integration/httpApplication').createHttpApplication;
    const instrumented = require('./mongo-native-reconciliation-reader-integration').instrumentDriver(driver);
    const nativeDriver = instrumented.driver;
    const requests = [], logs = [];
    let baseline;
    await trial('A startup_and_equivalence', 'real_mongodb', async () => {
      for (const enabled of [false, true]) {
        const app = makeApp(runtime, { enabled, uri: config.uri, driver: nativeDriver, signal }); applications.push(app);
        await app.start(); assert.equal(app.listening(), true);
        const token = runtime.token(fixture.admin), list = await app.request('GET', '', { token }), detail = await app.request('GET', '/' + fixture.key, { token });
        assert.equal(list.status, 200); assert.equal(detail.status, 200);
        assert.equal((await app.request('HEAD', '/' + fixture.key, { token })).status, 200);
        assert.equal(detail.headers['cache-control'], 'no-store');
        const actual = { list: list.body, detail: detail.body };
        if (baseline) assert.deepEqual(actual, baseline); else baseline = actual;
        requests.push(list.text, detail.text); logs.push(app.logs, app.errors);
        await app.close();
      }
      return { http: '127.0.0.1_ephemeral', getHead: true, readersEquivalent: true, restartSelection: true };
    });
    checkSignal(); const app = makeApp(runtime, { enabled: true, uri: config.uri, driver: nativeDriver, signal }); applications.push(app); await app.start();
    const token = runtime.token(fixture.admin), input = async () => { const response = await app.request('GET', '/' + fixture.key, { token }); assert.equal(response.status, 200); return { expectedVersion: response.body.data.version, sourceVersion: response.body.data.sourceVersion, status: 'under_review', conclusion: 'awaiting_evidence', evidence: [{ kind: 'internal_ticket', reference: 'OPS-INTEGRATION' }] }; };
    await trial('B authentication_validation_privacy', 'real_mongodb', async () => {
      for (const [method, suffix, options, status] of [
        ['GET', '', {}, 401], ['GET', '', { token: runtime.token(fixture.user) }, 403],
        ['GET', '?kind=order&kind=event&email=PRIVATE_QUERY', { token }, 400],
        ['GET', '?limit=9999', { token }, 400], ['GET', '/%ZZ?email=PRIVATE_QUERY', { token }, 400],
        ['POST', '/' + fixture.key + '/reviews', { token, origin: null, body: {} }, 403],
        ['POST', '/' + fixture.key + '/reviews?email=PRIVATE_QUERY', { raw: '{"note":"PRIVATE_BODY",' }, 400],
        ['GET', '?email=PRIVATE_QUERY', { origin: 'https://PRIVATE_ORIGIN.invalid' }, 403],
      ]) { const response = await app.request(method, suffix, options); assert.equal(response.status, status); requests.push(response.text); }
      return { jwtCookies: true, authorization: true, preauthParsingAndCors: true, strictValidation: true };
    });
    await trial('C mongoose_review_idempotency_cas', 'real_mongodb', async () => {
      const body = await input(), headers = { 'idempotency-key': 'express-integration-review-0001' }, before = runtime.writes();
      const first = await app.request('POST', '/' + fixture.key + '/reviews', { token, body, headers }); assert.equal(first.status, 200);
      const repeat = await app.request('POST', '/' + fixture.key + '/reviews', { token, body, headers }); assert.equal(repeat.status, 200); assert.equal(repeat.body.data.replayed, true);
      const stale = await app.request('POST', '/' + fixture.key + '/reviews', { token, body, headers: { 'idempotency-key': 'express-integration-stale-0002' } }); assert.equal(stale.status, 409);
      assert.equal(runtime.writes() - before, 3); assert.equal(await runtime.models.ReconciliationAudit.countDocuments({}), 1);
      const concurrent = await input();
      const racers = await Promise.all(['0003', '0004'].map(suffix => app.request('POST', '/' + fixture.key + '/reviews', { token, body: concurrent, headers: { 'idempotency-key': 'express-integration-concurrent-' + suffix } })));
      assert.deepEqual(racers.map(result => result.status).sort(), [200, 409]);
      assert.equal(await runtime.models.ReconciliationAudit.countDocuments({}), 2);
      requests.push(first.text, repeat.text, stale.text);
      return { postProvider: 'isolated_mongoose', replayedAuditNotDuplicated: true, staleVersionRejected: true, concurrentCasOneWinner: true };
    });
    await trial('D snapshot_and_financial_invariants', 'local_injection', async () => {
      const response = await app.request('GET', '/' + fixture.key, { token }); assert.equal(response.status, 200);
      assert.equal(response.body.data.readConsistency, 'snapshot'); assert.equal(response.body.data.auditTotal, 2);
      const body = await input();
      let entered, release, timer;
      const admitted = new Promise(resolve => { entered = resolve; }), barrier = new Promise(resolve => { release = resolve; });
      instrumented.hooks.afterRead = async name => { if (name === 'express_cases') { entered(); await barrier; } };
      const reading = app.request('GET', '/' + fixture.key, { token });
      try {
        // Race only admission notification, never query/cleanup or its slot.
        await Promise.race([admitted, reading.then(() => { throw Error('Read settled before scheduling admission'); }), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Snapshot scheduling barrier failed')), 10000); })]);
        clearTimeout(timer);
        const writer = await app.request('POST', '/' + fixture.key + '/reviews', { token, body, headers: { 'idempotency-key': 'express-integration-snapshot-0005' } });
        assert.equal(writer.status, 200);
        release(); const held = await reading; assert.equal(held.status, 200);
        assert.equal(held.body.data.version, response.body.data.version); assert.equal(held.body.data.auditTotal, 2);
      } finally { clearTimeout(timer); delete instrumented.hooks.afterRead; release(); await reading.catch(() => {}); }
      const after = await app.request('GET', '/' + fixture.key, { token }); assert.equal(after.status, 200);
      assert.equal(after.body.data.version, response.body.data.version + 1); assert.equal(after.body.data.auditTotal, 3);
      assert.equal(await fingerprint(db), initial);
      return { real_mongodb: { snapshotTransactionCompleted: true, concurrentCaseAuditSnapshotObserved: true, completeFinancialFixturesUnchanged: true }, local_injection: { schedulingBarrier: 'after_case_cursor_read' } };
    });
    await trial('E administrative_hooks_rollback', 'local_injection', async () => {
      const auditCount = await runtime.models.ReconciliationAudit.countDocuments({});
      const current = await runtime.models.ReconciliationCase.findOne({}).lean();
      const original = runtime.repo.createAudit, body = await input();
      runtime.repo.createAudit = async () => { throw Error('PRIVATE_INJECTED_AUDIT_FAILURE'); };
      try {
        const failed = await app.request('POST', '/' + fixture.key + '/reviews', { token, body, headers: { 'idempotency-key': 'express-integration-rollback-0006' } });
        assert.equal(failed.status, 503); requests.push(failed.text);
      } finally { runtime.repo.createAudit = original; }
      assert.equal((await runtime.models.ReconciliationCase.findById(current._id).lean()).version, current.version);
      assert.equal(await runtime.models.ReconciliationAudit.countDocuments({}), auditCount);
      await assert.rejects(runtime.models.ReconciliationAudit.bulkWrite([]));
      return { real_mongodb: { httpPostRollback: true, auditModelOverridePreserved: true }, local_injection: { trigger: 'audit_failure_after_transactional_case_write' } };
    });
    await trial('F shutdown_and_privacy', 'local_injection', async () => {
      assert.equal((await app.request('GET', '', { route: '/readyz' })).status, 200);
      const clientsBefore = instrumented.metrics.clients;
      instrumented.hooks.beforeRead = async () => { throw Error('PRIVATE_INJECTED_QUERY_FAILURE'); };
      try {
        const failure = await app.request('GET', '', { token }); assert.equal(failure.status, 503); requests.push(failure.text);
      } finally { delete instrumented.hooks.beforeRead; }
      assert.equal((await app.request('GET', '', { token })).status, 200); assert.equal(instrumented.metrics.clients, clientsBefore);
      let entered, release;
      const admitted = new Promise(resolve => { entered = resolve; }), blocked = new Promise(resolve => { release = resolve; });
      instrumented.hooks.beforeRead = async () => { entered(); await blocked; };
      const pendingHttp = app.request('GET', '', { token });
      let closing, capacityRetained;
      try {
        await Promise.race([admitted, pendingHttp.then(() => { throw Error('HTTP settled before scheduling admission'); })]);
        assert.equal((await app.request('GET', '', { token })).status, 503);
        assert.equal((await pendingHttp).status, 504);
        capacityRetained = app.stats().operations === 1; assert.equal(capacityRetained, true);
        closing = app.close(); await new Promise(resolve => setImmediate(resolve));
        assert.equal(app.stats().operations, 1);
      } finally {
        delete instrumented.hooks.beforeRead; release(); await pendingHttp.catch(() => {}); await (closing || app.close());
      }
      assert.equal(app.listening(), false);
      assert.equal(app.stats().pendingReads, 0); assert.equal(app.stats().openSessions, 0); assert.equal(app.stats().operations, 0);
      assert.equal(instrumented.metrics.sessions, 0); assert.equal(instrumented.metrics.cursors, 0);
      assert.equal(instrumented.metrics.checkedOut.size, 0);
      assert.ok(!instrumented.metrics.wire.some(command => ['insert', 'update', 'delete', 'create', 'createIndexes', 'drop', 'dropDatabase'].includes(command.name)));
      assert.ok(instrumented.metrics.wire.some(command => command.snapshot));
      assert.ok(instrumented.metrics.options.every(options => options.timeoutMS > 0 && options.timeoutMS <= options.maxTimeMS && options.ownedSession));
      logs.push(app.logs, app.errors, runtime.logs, runtime.errors);
      const captured = JSON.stringify(logs) + requests.join('');
      assert.ok(!captured.includes(config.uri));
      for (const secret of [token, runtime.env.JWT_SECRET, runtime.env.JWT_REFRESH_SECRET]) assert.ok(!captured.includes(secret));
      assert.doesNotMatch(captured, /PRIVATE_|mongodb(?:\+srv)?:\/\//);
      assert.equal(fenceEvidence.forbiddenAttempt, false); assert.ok(!fenceEvidence.connectionError && !runtime.connectionErrorSeen()); assert.equal(await fingerprint(db), initial);
      class FailureClient extends nativeDriver.MongoClient { async connect() { throw Error('PRIVATE_INJECTED_CONNECT'); } }
      checkSignal(); const failedApp = makeApp(runtime, { enabled: true, uri: config.uri, driver: { ...nativeDriver, MongoClient: FailureClient }, signal }); applications.push(failedApp);
      await assert.rejects(failedApp.start()); assert.equal(failedApp.listening(), false); await failedApp.close();
      return { real_mongodb: { localNativeDrainObserved: true, loggingCaptured: true, readyz: 'mongoose_only', commandOptionsObserved: true, snapshotCommandSubmitted: true, nativeWriteCommandsAbsent: true, nativePoolCheckedOutZero: true }, local_injection: { timeoutHttp: true, capacityRetainedUntilCleanup: capacityRetained, initialFailureNoHttp: true, queryFailureNoFallbackSameClient: true }, not_verified: ['forcedShutdown', 'realNetworkLoss', 'remoteTermination', 'serverTimeoutEnforcement'] };
    });
  } catch { state.failed = true; if (signal?.aborted) { state.interrupted = true; state.stage = 'interrupted'; } }
  finally {
    let clean = true;
    for (const application of applications) try { await application.close(); } catch { clean = false; }
    if (runtime) try { await runtime.drain?.(); await runtime.mongoose.disconnect(); } catch { clean = false; }
    if (client) try { await client.close(); } catch { clean = false; }
    if (ledger) try { ledger.close(); } catch { clean = false; }
    if (fenceEvidence.connectionError || runtime?.connectionErrorSeen?.()) { state.failed = true; state.stage = 'connection event'; }
    if (!clean) { state.failed = true; state.stage = 'cleanup'; }
    if (signal?.aborted) { state.interrupted = true; state.failed = true; if (clean) state.stage = 'interrupted'; }
    state.cleanup = clean ? 'local_work_settled' : 'failed';
    state.endedAt = new Date().toISOString();
  }
  return safeSummary(state);
}
if (require.main === module) {
  // A hard stop is not a graceful drain and cannot certify remote cancellation.
  let progress;
  const interruption = new AbortController();
  const interrupt = () => { if (progress) progress.interrupted = true; interruption.abort(); };
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
  const removeSignals = () => { process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt); };
  const watchdog = setTimeout(() => { console.error(JSON.stringify(progress ? safeSummary({ ...progress, failed: true, stage: 'watchdog', cleanup: 'pending_or_unknown' }) : { status: 'failed', doNotReuseDatabase: true, detailsSuppressed: true })); process.exit(1); }, 180000);
  main(process.env, { signal: interruption.signal, onState: state => { progress = state; } }).then(result => { clearTimeout(watchdog); removeSignals(); console.log(JSON.stringify(result)); if (result.status !== 'passed') process.exitCode = 1; }, () => { clearTimeout(watchdog); removeSignals(); console.error(JSON.stringify({ status: 'failed', detailsSuppressed: true, doNotReuseDatabase: true })); process.exitCode = 1; });
}
module.exports = { validateConfig, verifyConnection, main, safeSummary, seed, fingerprint, marker, names };
