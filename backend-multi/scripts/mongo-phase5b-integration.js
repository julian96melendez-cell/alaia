'use strict';
// Opt-in integration runner. Importing this module never connects to MongoDB.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const failureDiagnostics = new WeakMap();
function diagnosticFailure(error, stage, passed) {
  const failure = new Error('Integration failed; details suppressed to protect credentials');
  const code = error && typeof error === 'object' ? Object.getOwnPropertyDescriptor(error, 'code')?.value : undefined;
  failureDiagnostics.set(failure, { failedStage: stage, passed: [...passed], numericCode: Number.isSafeInteger(code) ? code : null });
  return failure;
}
function formatFailure(error) {
  const diagnostic = error && typeof error === 'object' ? failureDiagnostics.get(error) : undefined;
  return { status: 'failed', ...(diagnostic || { failedStage: 'unknown', passed: [], numericCode: null }), detailsSuppressed: true, syntheticDataRetained: true, doNotReuseDatabase: true };
}
function validateConfig(env) {
  const db = env.ALAIA_MONGO_TEST_DB;
  // 6-byte prefix + 32 ASCII hex characters fits Atlas Free's 38-byte limit.
  if (typeof db !== 'string' || db.length !== 38 || !/^alaia_[a-f0-9]{32}$/.test(db)) throw new Error('Dedicated random test database required');
  if (env.ALAIA_MONGO_TEST_CONFIRM !== db) throw new Error('Explicit database confirmation required');
  if (!env.ALAIA_MONGO_TEST_URI) throw new Error('Dedicated test URI required; MONGO_URI is never used');
  let uri;
  try { uri = new URL(env.ALAIA_MONGO_TEST_URI); } catch { throw new Error('Invalid test URI'); }
  if (uri.protocol !== 'mongodb+srv:' || !uri.hostname.endsWith('.mongodb.net')) throw new Error('Atlas SRV host required');
  if (uri.username && !uri.password) throw new Error('Incomplete authentication');
  if (uri.pathname !== '/' && uri.pathname !== '' && uri.pathname !== `/${db}`) throw new Error('URI database must be empty or match test database');
  for (const key of uri.searchParams.keys()) if (!['authSource', 'retryWrites', 'w', 'appName', 'tls'].includes(key)) throw new Error('Unsupported URI option');
  if (uri.searchParams.get('tls') === 'false') throw new Error('TLS cannot be disabled');
  return { uri: env.ALAIA_MONGO_TEST_URI, db };
}
async function main(env = process.env) {
  let config; let mongoose; let failure; let stage = 'configuration';
  const passed = [];
  try {
  config = validateConfig(env); // Must run before importing models or opening a connection.
  stage = 'load models';
  mongoose = require('mongoose');
  mongoose.set('autoCreate', false); mongoose.set('autoIndex', false); mongoose.set('bufferCommands', false);
  const Producto = require('../src/models/Producto');
  const Orden = require('../src/models/Orden');
  const Counter = require('../src/models/Counter');
  const { reserveProductStock } = require('../src/services/inventoryReservation');
  const { createCheckoutLifecycle } = require('../src/services/checkoutLifecycle');
    stage = 'connect';
    await mongoose.connect(config.uri, { dbName: config.db, autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 10000 });
    stage = 'connection database';
    assert.equal(mongoose.connection.name, config.db);
    const db = mongoose.connection.db;
    stage = 'primary and sessions';
    const hello = await db.admin().command({ hello: 1 });
    assert.ok(hello.setName && hello.isWritablePrimary && hello.logicalSessionTimeoutMinutes != null, 'Replica set primary and logical sessions required');
    // No existing collections, including empty ones: never reuse a database.
    stage = 'unused database';
    assert.equal((await db.listCollections({}, { nameOnly: true }).toArray()).length, 0, 'Test database must be unused');
    for (const [model, label] of [[Producto, 'Producto'], [Orden, 'Orden'], [Counter, 'Counter']]) { stage = `create ${label} collection`; await db.createCollection(model.collection.name); }
    stage = 'create Counter index';
    await Counter.collection.createIndex({ key: 1 }, { unique: true });
    // No production model init/syncIndexes. All data is synthetic and retained for inspection.
    const transaction = async fn => {
      const session = await mongoose.startSession();
      try { let result; await session.withTransaction(async () => { result = await fn(session); }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' }); return result; }
      finally { await session.endSession(); }
    };
    const product = stock => Producto.create({ nombre: 'Synthetic integration product', stock, gestionStock: true, activo: true, visible: true, precioFinal: 10, costoProveedor: 5, metadata: { integrationOnly: true } });
    async function createReserved(p, session) {
      await reserveProductStock(Producto, p._id, 1, session);
      const order = new Orden({ firebaseUserId: 'synthetic-integration-user', source: 'mobile', items: [{ producto: p._id, nombre: 'Synthetic integration product', cantidad: 1, precioUnitario: 10, costoProveedorUnitario: 5, proveedor: 'synthetic', tipoProducto: 'marketplace', subtotal: 10, ganancia: 5 }], total: 10, totalCostoProveedor: 5, gananciaTotal: 5, checkoutIntent: { keyHash: crypto.randomBytes(32).toString('hex'), fingerprint: 'synthetic', stripeCorrelation: crypto.randomBytes(32).toString('hex') }, inventoryReservation: { state: 'reserved', reservedAt: new Date(), expiresAt: new Date(Date.now() + 900000), lines: [{ producto: p._id, cantidad: 1 }] } });
      order.$session(session); await order.save({ session }); return order;
    }
    const stock = async p => (await Producto.findById(p._id).lean()).stock;
    const seq = async () => (await Counter.findOne({ key: 'order' }).lean())?.seq ?? 0;
    const orders = () => Orden.countDocuments({});
    // A: hook-driven Counter insert and order insert must roll back with stock.
    stage = 'A rollback';
    const a = await product(2); const abort = new Error('synthetic rollback');
    await assert.rejects(transaction(async session => { await createReserved(a, session); throw abort; }), e => e === abort);
    assert.equal(await stock(a), 2); assert.equal(await orders(), 0); assert.equal(await seq(), 0); assert.equal(await Counter.countDocuments({}), 0); passed.push('A rollback');
    // B: actual model validation/save hooks and same-session Counter.
    stage = 'B commit';
    const b = await product(2); const committed = await transaction(session => createReserved(b, session));
    assert.equal(await stock(b), 1); assert.equal(await orders(), 1); assert.equal(await seq(), 1);
    const stored = await Orden.findById(committed._id); assert.equal(stored.orderNumber, 1); assert.equal(stored.inventoryReservation.state, 'reserved'); passed.push('B commit');
    // C: force both initial snapshots to see the final unit; retries skip the barrier.
    stage = 'C concurrency';
    const c = await product(1); let arrived = 0; let open; const barrier = new Promise(resolve => { open = resolve; });
    const contender = () => { let first = true; return transaction(async session => {
      if (first) {
        first = false; await Producto.findById(c._id).session(session); if (++arrived === 2) open();
        let timer;
        try { await Promise.race([barrier, new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('Synthetic concurrency barrier timeout')), 10000); })]); }
        finally { clearTimeout(timer); }
      }
      return createReserved(c, session);
    }); };
    const results = await Promise.allSettled([contender(), contender()]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.find(r => r.status === 'rejected').reason.statusCode, 409);
    assert.equal(await stock(c), 0); assert.equal(await orders(), 2); assert.equal(await seq(), 2); passed.push('C concurrency');
    // D: only Counter is mocked; real order.save() must reject and abort its stock reservation.
    stage = 'D counter failure';
    const d = await product(2); const original = Counter.findOneAndUpdate; const failure = new Error('synthetic counter failure'); let sameSession = false;
    try {
      await assert.rejects(transaction(async session => {
        Counter.findOneAndUpdate = (filter, update, options) => { sameSession = options.session === session; return { lean: async () => { throw failure; } }; };
        return createReserved(d, session);
      }), e => e === failure);
    } finally { Counter.findOneAndUpdate = original; }
    assert.ok(sameSession); assert.equal(await stock(d), 2); assert.equal(await orders(), 2); assert.equal(await seq(), 2); passed.push('D counter failure');
    // E: real lifecycle release(), stock restoration and document $where CAS.
    const repo = { transaction, get: (id, session) => Orden.findById(id).session(session || null), restore: async (id, qty, session) => { const result = await Producto.updateOne({ _id: id }, { $inc: { stock: qty } }, { session }); assert.equal(result.matchedCount, 1); }, saveExpected: (order, session, expected) => { order.$where = expected; return order.save({ session }); } };
    const forbiddenStripe = new Proxy({}, { get() { throw new Error('Stripe forbidden in integration runner'); } });
    const lifecycle = createCheckoutLifecycle(repo, forbiddenStripe);
    stage = 'E first release';
    assert.equal(await lifecycle.release(String(committed._id), 'synthetic_test', 'never_attempted'), true);
    stage = 'E stock after first release';
    assert.equal(await stock(b), 2);
    stage = 'E repeated release';
    assert.equal(await lifecycle.release(String(committed._id), 'synthetic_test', 'never_attempted'), false);
    stage = 'E stock and Counter after repeated release';
    assert.equal(await stock(b), 2); assert.equal(await seq(), 2);
    stage = 'E final order state';
    const released = await Orden.findById(committed._id); assert.equal(released.inventoryReservation.state, 'released'); assert.equal(released.estadoPago, 'fallido'); passed.push('E idempotent release');
  } catch (error) { failure = diagnosticFailure(error, stage, passed); }
  finally {
    if (mongoose) {
      try { await mongoose.disconnect(); }
      catch (error) { if (!failure) failure = diagnosticFailure(error, 'disconnect', passed); }
    }
  }
  if (failure) throw failure;
  console.log(JSON.stringify({ database: config.db, passed, syntheticDataRetained: true }));
}
module.exports = { validateConfig, main, formatFailure };
if (require.main === module) main().catch(error => { console.error(JSON.stringify(formatFailure(error))); process.exitCode = 1; });
