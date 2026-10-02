'use strict';
// Import is inert. No dotenv, server, Stripe, Firebase, workers or financial services.
const assert = require('node:assert/strict');
const { validateConfig: baseConfig } = require('./mongo-phase5b-integration');
const { hash } = require('../src/services/reconciliationContracts');
const usedDatabases = new Set([
  'alaia_integration_ef588efb1b388be659120f9c1b6254cc',
  'alaia_78943cf524ef883d31e9628163931fe8',
  'alaia_ba98fd0d1a69e51e79c3bd384d23916c',
  'alaia_faf7a4d2651ecd5fb67539a6eb5889ad',
]);
const diagnostics = new WeakMap();
function validateConfig(env) {
  try {
    const config = baseConfig(env), uri = new URL(config.uri);
    assert.ok(!usedDatabases.has(config.db));
    assert.ok(env.NODE_ENV !== 'production');
    for (const key of ['MONGO_URI', 'MONGODB_URI', 'STRIPE_SECRET_KEY', 'FIREBASE_SERVICE_ACCOUNT_JSON']) assert.ok(!env[key]);
    assert.equal(decodeURIComponent(uri.username), 'alaia_integration_test');
    assert.ok(decodeURIComponent(uri.password).length > 0);
    assert.equal(uri.pathname, `/${config.db}`);
    assert.equal(uri.hash, ''); assert.equal(uri.port, '');
    const keys = [...uri.searchParams.keys()]; assert.equal(new Set(keys).size, keys.length);
    for (const [key, value] of uri.searchParams) {
      if (key === 'authSource') assert.equal(value, 'admin');
      if (key === 'retryWrites' || key === 'tls') assert.equal(value, 'true');
      if (key === 'w') assert.equal(value, 'majority');
      if (key === 'appName') assert.match(value, /^[A-Za-z0-9_-]{1,64}$/);
    }
    return config;
  } catch { throw new Error('Invalid isolated test configuration; details suppressed'); }
}
function validatePrivileges(result, database) {
  const info = result?.authInfo;
  assert.equal(info?.authenticatedUsers?.length, 1);
  assert.equal(info.authenticatedUsers[0].user, 'alaia_integration_test'); assert.equal(info.authenticatedUsers[0].db, 'admin');
  assert.equal(info.authenticatedUserRoles?.length, 1);
  assert.equal(info.authenticatedUserRoles[0].role, 'readWrite'); assert.equal(info.authenticatedUserRoles[0].db, database);
  assert.ok(info.authenticatedUserPrivileges?.length > 0);
  for (const privilege of info.authenticatedUserPrivileges) {
    assert.equal(privilege.resource?.db, database);
    assert.equal(typeof privilege.resource.collection, 'string');
    assert.ok(!privilege.resource.anyResource && !privilege.resource.cluster);
  }
}
function formatFailure(error) {
  return { status: 'failed', ...(diagnostics.get(error) || { failedStage: 'unknown', passed: [], numericCode: null }), detailsSuppressed: true, syntheticDataRetained: true, doNotReuseDatabase: true };
}
async function runTrials({ repo, service, models, mongoose, db, report }) {
  const { Orden, WebhookEvent, Case, Audit } = models;
  const objectId = () => new mongoose.Types.ObjectId();
  const actor = String(objectId()), other = String(objectId());
  const id = objectId(), eventId = objectId(), historicalId = objectId();
  const key = `order:${id}`, eventKey = `event:${eventId}`, historicalKey = `order:${historicalId}`;
  const input = async (caseKey = key) => {
    const detail = await service.detail(caseKey, {});
    return { expectedVersion: detail.version, sourceVersion: detail.sourceVersion, status: 'under_review', conclusion: 'awaiting_evidence', evidence: [{ kind: 'internal_ticket', reference: 'OPS-ISOLATED' }] };
  };
  const review = (body, idem, who = actor, caseKey = key) => service.review(caseKey, body, idem, who);
  report('A empty aggregation');
  assert.equal((await service.list({})).total, 0); // Also exercises absent namespaces.
  for (const model of Object.values(models)) await db.createCollection(model.collection.name);
  // Raw synthetic fixtures avoid order-save hooks and all financial services.
  const now = new Date();
  await Orden.collection.insertMany([
    { _id: id, createdAt: now, updatedAt: now, inventoryReservation: { state: 'reserved', needsReconciliation: true, lines: [] }, estadoPago: 'pendiente', estadoFulfillment: 'pendiente', payoutBlocked: true, total: 10, moneda: 'usd', checkoutIntent: { keyHash: 'synthetic' }, vendedorPayouts: [{ status: 'bloqueado' }] },
    { _id: historicalId, createdAt: now, updatedAt: now, inventoryReservation: { state: 'reconciliation_required' }, estadoPago: 'pendiente' },
  ]);
  await WebhookEvent.collection.insertOne({ _id: eventId, provider: 'stripe', status: 'failed', eventId: 'evt_synthetic', createdAt: now, updatedAt: now, ordenId: id, summary: { secret: 'synthetic-private' } });
  await models.Producto.collection.insertOne({ _id: objectId(), stock: 7, nombre: 'Synthetic only' });
  await models.Counter.collection.insertOne({ _id: objectId(), key: 'order', seq: 11 });
  const businessModels = [Orden, WebhookEvent, models.Producto, models.Counter];
  const businessDigest = async () => hash(await Promise.all(businessModels.map(model => model.collection.find({}).sort({ _id: 1 }).toArray())));
  const before = await businessDigest();
  report('B aggregation and privacy');
  const queue = await service.list({ limit: '1' });
  assert.equal(queue.total, 3); assert.equal(queue.items.length, 1);
  assert.equal((await service.list({ kind: 'event' })).total, 1);
  assert.equal((await service.list({ kind: 'order' })).total, 2);
  assert.equal((await service.list({ page: '4', limit: '1' })).items.length, 0);
  assert.doesNotMatch(JSON.stringify(await service.detail(eventKey, {})), /synthetic-private|ordenId|summary/);
  assert.equal((await service.detail(historicalKey, {})).source.managed, false);
  report('C idempotency and concurrency');
  const first = await input();
  const copies = await Promise.all([review(first, 'integration-identical-key-0001'), review(first, 'integration-identical-key-0001')]);
  assert.equal(copies.filter(row => row.replayed).length, 1); assert.equal(await Audit.countDocuments({}), 1);
  const next = await input();
  const race = await Promise.allSettled([review(next, 'integration-competing-key-0002'), review(next, 'integration-competing-key-0002', other)]);
  assert.equal(race.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(race.find(row => row.status === 'rejected').reason.publicCode, 'REVIEW_STALE_VERSION');
  assert.equal((await review(first, 'integration-identical-key-0001')).review.version, 1);
  await assert.rejects(review({ ...first, conclusion: 'discrepancy' }, 'integration-identical-key-0001'), error => error.publicCode === 'REVIEW_IDEMPOTENCY_CONFLICT');
  report('D CAS and rollback');
  const detail = await service.detail(key, {}), caseId = require('../src/services/reconciliationContracts').parseKey(key).caseId;
  await assert.rejects(repo.transaction(session => repo.writeCase({ _id: caseId, status: 'closed', lastAuditId: objectId() }, 999, session)), error => error.publicCode === 'REVIEW_STALE_VERSION');
  const count = await Audit.countDocuments({});
  const abort = new Error('synthetic audit abort');
  const failing = require('../src/services/reconciliationReviewService').createReconciliationReviewService({ ...repo, createAudit: async () => { throw abort; } });
  await assert.rejects(failing.review(key, await input(), 'integration-rollback-key-0003', actor), error => error === abort);
  assert.equal((await service.detail(key, {})).version, detail.version); assert.equal(await Audit.countDocuments({}), count);
  report('E snapshot under concurrent commit');
  let entered, resume; const gate = new Promise(resolve => { entered = resolve; }); const release = new Promise(resolve => { resume = resolve; });
  const writerInput = await input(); let intercepted = false;
  const reader = require('../src/services/reconciliationReviewService').createReconciliationReviewService({ ...repo, getCase: async (reference, session) => {
    const record = await repo.getCase(reference, session);
    if (!intercepted) { intercepted = true; entered(); await release; }
    return record;
  } });
  const pending = reader.detail(key, { limit: '100' });
  let timer;
  try {
    await Promise.race([gate, pending, new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('Synthetic snapshot barrier timeout')), 15000); })]);
    await review(writerInput, 'integration-snapshot-key-0004');
  } catch (error) { resume(); await pending.catch(() => {}); throw error; }
  finally { clearTimeout(timer); resume(); }
  const snapshot = await pending, fresh = await service.detail(key, { limit: '100' });
  assert.equal(snapshot.version, writerInput.expectedVersion);
  assert.equal(snapshot.auditTotal, snapshot.version); assert.equal(snapshot.audits.length, snapshot.auditTotal);
  assert.ok(snapshot.audits.every(audit => audit.version <= snapshot.version));
  assert.equal(fresh.version, snapshot.version + 1); assert.equal(fresh.auditTotal, fresh.version);
  report('F administrative close and financial immutability');
  await review({ ...await input(), status: 'closed', conclusion: 'payment_confirmed' }, 'integration-close-key-0005');
  const closed = await service.list({ status: 'closed' }); assert.equal(closed.total, 1); assert.equal(closed.items[0].source.needsReconciliation, true);
  assert.equal(await businessDigest(), before);
  assert.equal(await Case.countDocuments({}), 1);
}
async function main(env = process.env) {
  let client, config, failure, stage = 'configuration'; const passed = [];
  const report = next => { if (stage.startsWith('trial: ')) passed.push(stage.slice(7)); stage = `trial: ${next}`; };
  try {
    config = validateConfig(env); // Must precede even the Mongo driver import.
    stage = 'connect';
    const Mongoose = require('mongoose').Mongoose; client = new Mongoose();
    client.set('autoCreate', false); client.set('autoIndex', false); client.set('bufferCommands', false);
    await client.connect(config.uri, { dbName: config.db, autoCreate: false, autoIndex: false, bufferCommands: false, serverSelectionTimeoutMS: 10000, authSource: 'admin', tls: true, retryWrites: true, w: 'majority' });
    assert.equal(client.connection.name, config.db); const db = client.connection.db;
    stage = 'effective privileges';
    validatePrivileges(await db.admin().command({ connectionStatus: 1, showPrivileges: true }), config.db);
    stage = 'primary and sessions';
    const hello = await db.admin().command({ hello: 1 });
    assert.ok(hello.setName && hello.isWritablePrimary && hello.logicalSessionTimeoutMinutes != null);
    assert.ok(hello.maxWireVersion >= 13); // MongoDB 5.0+ for concise lookup pipelines.
    stage = 'unused database'; assert.equal((await db.listCollections({}, { nameOnly: true }).toArray()).length, 0);
    usedDatabases.add(config.db); // Never reuse an attempted database in this process.
    stage = 'claim isolated database';
    // A permanent marker makes a failed first trial non-reusable. Its unique _id
    // also arbitrates two processes that both observed an empty database.
    const marker = 'alaia_reconciliation_review_run';
    await db.createCollection(marker);
    await db.collection(marker).insertOne({ _id: 'single-use', runner: 'mongo-reconciliation-review-integration', createdAt: new Date() });
    stage = 'models'; const models = {};
    for (const name of ['Orden', 'WebhookEvent', 'ReconciliationCase', 'ReconciliationAudit', 'Producto', 'Counter']) {
      const original = require(`../src/models/${name}`);
      const schema = original.schema.clone(); schema.set('autoCreate', false); schema.set('autoIndex', false); schema.set('bufferCommands', false);
      models[{ ReconciliationCase: 'Case', ReconciliationAudit: 'Audit' }[name] || name] = client.model(name, schema, original.collection.name);
    }
    const repo = require('../src/services/reconciliationRepository').createMongoRepository({ mongoose: client, ...models });
    const service = require('../src/services/reconciliationReviewService').createReconciliationReviewService(repo);
    await runTrials({ repo, service, models, mongoose: client, db, report });
    if (stage.startsWith('trial: ')) passed.push(stage.slice(7)); stage = 'disconnect';
  } catch (error) {
    failure = new Error('Integration failed; details suppressed');
    const code = error && typeof error === 'object' ? Object.getOwnPropertyDescriptor(error, 'code')?.value : null;
    diagnostics.set(failure, { failedStage: stage, passed: [...passed], numericCode: Number.isSafeInteger(code) ? code : null });
  } finally {
    if (client) try { await client.disconnect(); } catch { if (!failure) { failure = new Error('Disconnect failed; details suppressed'); diagnostics.set(failure, { failedStage: 'disconnect', passed: [...passed], numericCode: null }); } }
  }
  if (failure) throw failure;
  return { database: config.db, passed, syntheticDataRetained: true, doNotReuseDatabase: true };
}
if (require.main === module) main().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(JSON.stringify(formatFailure(error))); process.exitCode = 1; });
module.exports = { validateConfig, validatePrivileges, formatFailure, main, runTrials };
