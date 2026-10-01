'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const Orden = require('../src/models/Orden');
const Counter = require('../src/models/Counter');
const { withAuthorizedFinancialTransition, assertFulfillmentAllowed, assertStripeCorrelation } = require('../src/services/orderInvariants');
const { preserveOmittedStock, updateProductWithReservationGuard } = require('../src/services/stockEditing');
const A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
function order() {
  const doc = Orden.hydrate({ _id: A, estadoPago: 'fallido', estadoFulfillment: 'pendiente', total: 10, moneda: 'usd', items: [], historial: [], firebaseUserId: 'fixture-buyer', checkoutIntent: { keyHash: 'fixture-hash', stripeCorrelation: 'synthetic-correlation' }, inventoryReservation: { state: 'released', lines: [] } });
  return doc;
}
const saveHook = Orden.schema.s.hooks._pres.get('save').find(h => h.fn.toString().includes('consumeStripePaidAuthorization')).fn;
test('real Mongoose financial hook denies arbitrary failed -> paid', () => {
  const doc = order(); doc.estadoPago = 'pagado';
  assert.throws(() => saveHook.call(doc), /Transición estadoPago inválida/);
});
test('real Mongoose hook permits correlated trusted late payment and preserves blocks', async () => {
  const doc = order(); const proof = { orderId: A, paymentIntentId: 'pi_fixture', correlation: 'synthetic-correlation', uid: 'fixture-buyer', amount: 1000, currency: 'usd' };
  assertStripeCorrelation(doc, proof);
  await withAuthorizedFinancialTransition(doc, async () => {
  doc.estadoPago = 'pagado'; doc.inventoryReservation.state = 'reconciliation_required'; doc.inventoryReservation.needsReconciliation = true; doc.payoutBlocked = true;
  saveHook.call(doc); assert.equal(doc.estadoPago, 'pagado'); assert.equal(doc.inventoryReservation.state, 'reconciliation_required'); assert.equal(doc.isPayoutEligible(), false);
  });
  assert.throws(() => saveHook.call(doc), /Transición estadoPago inválida/); // capability is single use
});
for (const state of ['procesando', 'enviado', 'entregado']) test(`real model/admin guard blocks reconciliation -> ${state}`, () => {
  const doc = order(); doc.estadoPago = 'pagado'; doc.inventoryReservation.needsReconciliation = true;
  assert.throws(() => assertFulfillmentAllowed(doc, state), e => e.statusCode === 409);
  assert.throws(() => doc.setEstadoFulfillment(state), e => e.statusCode === 409);
  assert.equal(doc.estadoFulfillment, 'pendiente');
});
test('fulfillment hook catches direct assignment and payout-only block', () => {
  const doc = order(); doc.estadoPago = 'pagado'; doc.$locals.prevEstadoPago = 'pagado'; doc.payoutBlocked = true; doc.estadoFulfillment = 'procesando';
  assert.throws(() => saveHook.call(doc), e => e.statusCode === 409);
});
test('Counter real creation middleware uses the document session', async () => {
  const original = Counter.findOneAndUpdate; const session = { fixture: true }; let options;
  Counter.findOneAndUpdate = (filter, update, opts) => { options = opts; return { lean: async () => ({ seq: 17 }) }; };
  try {
    const doc = new Orden({ items: [] }); doc.$session(session);
    const hook = Orden.schema.s.hooks._pres.get('validate').find(h => h.fn.toString().includes('nextOrderNumber')).fn;
    await hook.call(doc); assert.equal(doc.orderNumber, 17); assert.equal(options.session, session);
  } finally { Counter.findOneAndUpdate = original; }
});
function stockHarness(reserved) {
  const session = { withTransaction: async fn => fn(), endSession: async () => {} }; const writes = []; let seenSession;
  const mongoose = { startSession: async () => session };
  const Orders = { exists: () => ({ session: async s => { seenSession = s; return reserved ? { _id: A } : null; } }) };
  const Product = { findOneAndUpdate: async (filter, payload, opts) => { writes.push({ payload, opts }); return { stock: 5, ...payload }; } };
  return { run: payload => updateProductWithReservationGuard({ mongoose, Orden: Orders, Producto: Product, filter: { _id: A }, payload }), writes, session, seen: () => seenSession };
}
test('admin/seller omission preserves stock and stock management', async () => {
  const payload = preserveOmittedStock({ nombre: 'fixture' }, { nombre: 'fixture', stock: 0, gestionStock: false });
  assert.equal(Object.hasOwn(payload, 'stock'), false); assert.equal(Object.hasOwn(payload, 'gestionStock'), false);
  const h = stockHarness(true); assert.equal((await h.run(payload)).stock, 5);
});
test('admin/seller stock replacement with a reservation returns 409 and writes nothing', async () => {
  const h = stockHarness(true); await assert.rejects(h.run({ stock: 10 }), e => e.statusCode === 409);
  assert.equal(h.writes.length, 0); assert.equal(h.seen(), h.session);
});
test('stock replacement without reservations is transactional and succeeds', async () => {
  const h = stockHarness(false); assert.equal((await h.run({ stock: 9 })).stock, 9); assert.equal(h.writes[0].opts.session, h.session);
});
function load(file, mocks) {
 const filename = path.join(__dirname, '..', file), module = { exports: {} }, localRequire = createRequire(filename);
 vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, require: n => Object.hasOwn(mocks, n) ? mocks[n] : localRequire(n), console: { log() {}, warn() {}, error() {} }, process: { env: {} }, Buffer, Date, setInterval() {}, clearInterval() {} }, { filename }); return module.exports;
}
test('active web checkout requires cookie auth and invokes the shared lifecycle', async () => {
 const routes = new Map(); let call; const auth = () => {}; const router = { post: (p, ...h) => routes.set(p, h), get: (p, ...h) => routes.set(p, h) };
 load('src/routes/stripeRoutes.js', { express: { Router: () => router }, '../middleware/auth': { proteger: auth }, '../models/Orden': {}, '../models/Producto': {}, '../payments/stripeService': {}, '../controllers/ordenController': {}, '../payments/stripeWebhookController': {}, '../services/checkoutLifecycle': { getLifecycle: mode => { assert.equal(mode, 'web'); return { prepare: async input => { call = input; return { order: { _id: A }, checkoutUrl: 'https://checkout.stripe.com/fixture' }; } }; } } });
 const handlers = routes.get('/checkout'); assert.equal(handlers[0], auth);
 let body; const res = { status: () => res, json: value => { body = value; } };
 await handlers.at(-1)({ usuario: { _id: A }, headers: { 'idempotency-key': 'fixture-web-intention-00001' }, body: { userId: 'untrusted' } }, res);
 assert.equal(call.uid, `web:${A}`); assert.equal(body.ok, true); assert.equal(Object.hasOwn(body.data, 'clientSecret'), false);
});
test('signed simulated webhook with wrong correlation cannot mutate order or stock', async () => {
 for (const type of ['payment_intent.succeeded', 'payment_intent.payment_failed', 'payment_intent.canceled', 'charge.refunded', 'refund.updated', 'checkout.session.completed']) {
 const doc = order(); doc.stripePaymentIntentId = ''; let writes = 0;
 const event = { id: 'evt_fixture', type, data: { object: { id: type.startsWith('payment_intent.') ? 'pi_fixture' : 'cs_fixture', payment_intent: 'pi_fixture', amount: 1000, amount_received: 1000, currency: 'usd', metadata: { ordenId: A, firebaseUserId: 'fixture-buyer', checkoutCorrelation: 'wrong-fixture' } } } };
 const controller = load('src/payments/stripeWebhookController.js', { '../models/Orden': { findById: () => ({ select: async () => doc }), updateOne: async () => { writes++; } }, '../models/WebhookEvent': { create: async p => p, updateOne: async () => ({}) }, './stripeService': { construirEventoDesdeWebhook: () => event, stripe: { paymentIntents: { retrieve: async () => ({ ...event.data.object, id: 'pi_fixture' }) } }, resumirEventoStripe: () => ({ eventId: event.id, eventType: event.type, ordenId: A }) } });
 let status = 200; const res = { status: n => { status = n; return res; }, json: () => res, send: () => res };
 await controller.procesarWebhookStripe({ headers: { 'stripe-signature': 'simulated-signature' }, body: Buffer.from('{}') }, res);
 assert.equal(writes, 0); assert.equal(doc.estadoPago, 'fallido'); assert.ok(status >= 400);
 }
});
test('real Mongoose save persists trusted late payment with expected-state filter and session', async () => {
  const original = Orden.collection.updateOne; let captured;
  Orden.collection.updateOne = async (filter, update, options) => { captured = { filter, update, options }; return { matchedCount: 1, modifiedCount: 1 }; };
  try {
    const doc = order(); class FixtureSession {} const session = new FixtureSession();
    doc.$where = { 'inventoryReservation.state': 'released', estadoPago: 'fallido' };
    doc.estadoPago = 'pagado'; doc.inventoryReservation.state = 'reconciliation_required'; doc.inventoryReservation.needsReconciliation = true; doc.payoutBlocked = true;
    await withAuthorizedFinancialTransition(doc, () => doc.save({ validateBeforeSave: false, session }));
    assert.equal(captured.filter['inventoryReservation.state'], 'released'); assert.equal(captured.filter.estadoPago, 'fallido'); assert.equal(captured.options.session, session);
    assert.equal(captured.update.$set.estadoPago, 'pagado'); assert.equal(captured.update.$set.payoutBlocked, true);
    assert.equal(captured.update.$set['inventoryReservation.state'], 'reconciliation_required');
  } finally { Orden.collection.updateOne = original; }
});
test('serialization never exposes the internal checkout correlation or fingerprint', () => {
  const doc = order(); assert.equal(Object.hasOwn(doc.toJSON(), 'checkoutIntent'), false); assert.equal(Object.hasOwn(doc.toObject(), 'checkoutIntent'), false);
});

test('logging redacts opaque correlation metadata', () => {
  const { redactText, sanitize } = require('../src/utils/safeLogging');
  assert.equal(sanitize({ checkoutCorrelation: 'synthetic-correlation' }).checkoutCorrelation, '[REDACTED]');
  assert.equal(redactText('checkoutCorrelation: "synthetic-correlation"').includes('synthetic-correlation'), false);
});
for (const target of ['procesando', 'enviado', 'entregado']) test(`actual admin fulfillment endpoint returns 409 for ${target}`, async () => {
  const doc = order(); doc.estadoPago = 'pagado'; doc.inventoryReservation.needsReconciliation = true; let saved = 0; doc.save = async () => { saved++; };
  const controller = load('src/controllers/adminOrdenController.js', {
    '../models/Orden': { findById: () => ({ populate: async () => doc }) },
    '../services/payoutService': { pagarVendedoresDeOrden: async () => { throw new Error('No external payout allowed'); } },
    '../services/firestoreAdminOrderSync': { syncFirestoreOrderFromAdmin: async () => { throw new Error('No Firebase allowed'); } },
    './ordenRealtimeController': {}, '../services/emailService': {}, '../models/Usuario': {},
  });
  let status = 200; const res = { status: n => { status = n; return res; }, json: () => res };
  await controller.adminActualizarFulfillment({ usuario: { rol: 'admin', _id: A }, params: { id: A }, body: { estadoFulfillment: target }, headers: {} }, res);
  assert.equal(status, 409); assert.equal(saved, 0); assert.equal(doc.estadoFulfillment, 'pendiente');
});
for (const kind of ['admin', 'seller']) test(`actual ${kind} product controller preserves omitted stock and rejects reserved replacement`, async () => {
  let reserved = true, writes = 0, product = { stock: 5, gestionStock: true };
  const session = { withTransaction: async fn => fn(), endSession: async () => {} };
  const mongoose = { Types: require('mongoose').Types, startSession: async () => session };
  const Product = { findOneAndUpdate: async (_filter, payload) => { writes++; product = { ...product, ...payload }; return product; } };
  const Orders = { exists: () => ({ session: async () => reserved ? { _id: A } : null }) };
  const controller = load(`src/controllers/${kind === 'admin' ? 'productosController' : 'sellerProductosController'}.js`, { mongoose, '../models/Producto': Product, '../models/Orden': Orders, 'express-validator': { validationResult: () => ({ isEmpty: () => true }) } });
  const handler = kind === 'admin' ? controller.editarProducto : controller.actualizarProducto;
  let status = 200; const res = { status: n => { status = n; return res; }, json: () => res };
  const req = { params: { id: A }, usuario: { rol: 'vendedor', _id: A }, headers: {}, body: { nombre: 'fixture', precioFinal: 10 } };
  const next = err => { status = err.statusCode; };
  await handler(req, res, next); assert.equal(product.stock, 5); assert.equal(writes, 1);
  req.body.stock = 9; await handler(req, res, next); assert.equal(status, 409); assert.equal(product.stock, 5); assert.equal(writes, 1);
  reserved = false; status = 200; await handler(req, res, next); assert.equal(status, 200); assert.equal(product.stock, 9);
});
