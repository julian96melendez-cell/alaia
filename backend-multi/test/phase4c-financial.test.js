'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const Orden = require('../src/models/Orden');
const { withAuthorizedFinancialTransition, hasExactLegacyBinding } = require('../src/services/orderInvariants');
const { createFinancialCoordinator } = require('../src/services/financialCoordinator');
const { assertSafeQueryUpdate, assertSafeBulk } = require('../src/services/financialQueryGuard');
const ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const saveHook = Orden.schema.s.hooks._pres.get('save').find(h => h.fn.toString().includes('consumeStripePaidAuthorization')).fn;
function failedOrder() { return Orden.hydrate({ _id: ID, estadoPago: 'fallido', estadoFulfillment: 'pendiente', items: [], historial: [], total: 10, moneda: 'usd', stripePaymentIntentId: 'pi_synthetic' }); }
function assertNoPrivilege(doc) { doc.estadoPago = 'pagado'; doc.markModified('estadoPago'); assert.throws(() => saveHook.call(doc), /Transición estadoPago inválida/); }
test('scope cleans authorization even when successful callback does not consume it', async () => {
  const doc = failedOrder(); await withAuthorizedFinancialTransition(doc, async () => 'done'); assertNoPrivilege(doc);
});
test('scope cleans authorization after actual validation fails before financial hook', async () => {
  const doc = failedOrder(); doc.moneda = 'invalid-currency'; doc.estadoPago = 'pagado';
  // Inject validator failure before pre-save without accessing a database.
  doc.invalidate('total', 'synthetic-validation-failure');
  await assert.rejects(withAuthorizedFinancialTransition(doc, () => doc.save()));
  assertNoPrivilege(doc);
});
test('scope cleans authorization if middleware or save throws before consumption', async () => {
  const doc = failedOrder(); await assert.rejects(withAuthorizedFinancialTransition(doc, async () => { throw new Error('synthetic-middleware-failure'); })); assertNoPrivilege(doc);
});
test('successful real save consumes capability and second save on same reference is denied', async () => {
  const original = Orden.collection.updateOne; let writes = 0;
  Orden.collection.updateOne = async () => { writes++; return { matchedCount: 1, modifiedCount: 1 }; };
  try {
    const doc = failedOrder(); doc.estadoPago = 'pagado'; await withAuthorizedFinancialTransition(doc, () => doc.save({ validateBeforeSave: false }));
    doc.markModified('estadoPago'); await assert.rejects(doc.save({ validateBeforeSave: false }), /Transición estadoPago inválida/); assert.equal(writes, 1);
  } finally { Orden.collection.updateOne = original; }
});
test('normal caller cannot save failed -> paid', async () => {
  const doc = failedOrder(); doc.estadoPago = 'pagado'; await assert.rejects(doc.save({ validateBeforeSave: false }), /Transición estadoPago inválida/);
});
for (const method of ['updateOne', 'updateMany', 'findOneAndUpdate', 'findByIdAndUpdate']) test(`real model ${method} rejects financial query before driver`, async () => {
  const filter = method === 'findByIdAndUpdate' ? ID : { _id: ID };
  await assert.rejects(Orden[method](filter, { $set: { estadoPago: 'pagado' } }), e => e.publicCode === 'FINANCIAL_QUERY_FORBIDDEN');
});
test('direct update and pipeline update cannot bypass financial guard', async () => {
  await assert.rejects(Orden.updateOne({ _id: ID }, { estadoPago: 'pagado' }), e => e.publicCode === 'FINANCIAL_QUERY_FORBIDDEN');
  await assert.rejects(Orden.updateOne({ _id: ID }, [{ $set: { estadoPago: 'pagado' } }], { updatePipeline: true }), e => e.publicCode === 'FINANCIAL_QUERY_FORBIDDEN');
});
test('unset, rename destinations, replacement, upsert and bulk financial writes are rejected', async () => {
  for (const update of [{ $unset: { 'checkoutIntent.state': 1 } }, { $rename: { harmless: 'estadoPago' } }, { $inc: { stripeAmountReceived: 1 } }, { $setOnInsert: { estadoPago: 'pagado' } }, { $set: { 'inventoryReservation.state': 'consumed' } }, { $set: { 'vendedorPayouts.0.monto': 999 } }, { $set: { ingresoVendedorTotal: 999 } }, { $set: { firebaseUserId: 'other' } }]) assert.throws(() => assertSafeQueryUpdate(update));
  await assert.rejects(Orden.replaceOne({ _id: ID }, { nombre: 'synthetic' }));
  await assert.rejects(Orden.findOneAndReplace({ _id: ID }, { nombre: 'synthetic' }));
  await assert.rejects(Orden.updateOne({ estadoPago: 'pagado' }, { $set: { paymentStatusDetail: 'synthetic' } }, { upsert: true }));
  for (const operation of [{ updateOne: { filter: { _id: ID }, update: { $set: { estadoPago: 'pagado' } } } }, { updateMany: { filter: {}, update: { estadoPago: 'pagado' } } }, { replaceOne: { filter: {}, replacement: { estadoPago: 'pagado' } } }, { insertOne: { document: { estadoPago: 'pagado' } } }]) await assert.rejects(Orden.bulkWrite([operation]), e => e.publicCode === 'FINANCIAL_QUERY_FORBIDDEN');
});
test('nonfinancial audit and payout ledger queries remain allowed', () => {
  assert.doesNotThrow(() => assertSafeQueryUpdate({ $set: { stripeLatestEventId: 'evt_synthetic', paymentStatusDetail: 'safe' }, $push: { historial: { estado: 'audit' } } }));
  assert.doesNotThrow(() => assertSafeBulk([{ updateOne: { filter: {}, update: { $push: { historial: { estado: 'payout_claim' } } } } }]));
});
test('legacy requires exact persisted binding appropriate to event type', () => {
  const doc = { stripePaymentIntentId: 'pi_synthetic', stripeSessionId: 'cs_synthetic' };
  assert.equal(hasExactLegacyBinding(doc, { eventType: 'payment_intent.succeeded', paymentIntentId: 'pi_synthetic' }), true);
  assert.equal(hasExactLegacyBinding(doc, { eventType: 'checkout.session.completed', sessionId: 'cs_synthetic', paymentIntentId: 'pi_synthetic' }), true);
  assert.equal(hasExactLegacyBinding({ stripeSessionId: 'cs_synthetic' }, { eventType: 'payment_intent.succeeded', paymentIntentId: 'pi_synthetic' }), false);
  assert.equal(hasExactLegacyBinding({}, { eventType: 'payment_intent.succeeded', paymentIntentId: 'pi_synthetic' }), false);
  assert.equal(hasExactLegacyBinding(doc, { eventType: 'payment_intent.succeeded', paymentIntentId: 'pi_other' }), false);
});
test('legacy exact binding may record legitimate late payment through real hooks, not query', async () => {
  const doc = failedOrder(); const original = Orden.collection.updateOne; let captured;
  Orden.collection.updateOne = async (filter, update) => { captured = { filter, update }; return { matchedCount: 1, modifiedCount: 1 }; };
  try {
    const apply = createFinancialCoordinator({ transaction: fn => fn({}), get: async () => doc, save: order => order.save({ validateBeforeSave: false }) });
    await apply(ID, { estadoPago: 'pagado' }, { eventType: 'payment_intent.succeeded', paymentIntentId: 'pi_synthetic', amount: 1000, currency: 'usd' });
    assert.equal(captured.filter.estadoPago, 'fallido'); assert.equal(captured.update.$set.estadoPago, 'pagado'); assertNoPrivilege(doc);
  } finally { Orden.collection.updateOne = original; }
});
test('financial coordinator refuses legacy metadata-only proof without any save', async () => {
  const doc = failedOrder(); doc.stripePaymentIntentId = ''; let saves = 0;
  const apply = createFinancialCoordinator({ transaction: fn => fn({}), get: async () => doc, save: async () => { saves++; } });
  await assert.rejects(apply(ID, { estadoPago: 'pagado' }, { eventType: 'payment_intent.succeeded', orderId: ID, paymentIntentId: 'pi_synthetic', amount: 1000, currency: 'usd' }), e => e.publicCode === 'FINANCIAL_REVIEW_REQUIRED');
  assert.equal(saves, 0); assert.equal(doc.estadoPago, 'fallido');
});
function webhookHarness(binding) {
  const event = { id: 'evt_synthetic', type: 'payment_intent.succeeded', data: { object: { id: 'pi_synthetic', amount: 1000, amount_received: 1000, status: 'succeeded', currency: 'usd', metadata: { ordenId: ID } } } };
  const document = { _id: ID, total: 10, moneda: 'usd', estadoPago: 'pendiente', stripePaymentIntentId: binding ? 'pi_synthetic' : '' };
  let applied = 0, orderWrites = 0, ledgerUpdate;
  const filename = path.join(__dirname, '../src/payments/stripeWebhookController.js'), localRequire = createRequire(filename), module = { exports: {} };
  const query = { select: () => query, lean: async () => document, then: resolve => resolve(document) };
  const mocks = {
    '../models/Orden': { findById: () => query, updateOne: async () => { orderWrites++; return {}; } },
    '../models/WebhookEvent': { create: async () => ({ _id: ID }), updateOne: async (_filter, update) => { ledgerUpdate = update; } },
    './stripeService': { construirEventoDesdeWebhook: () => event, resumirEventoStripe: () => ({ eventId: event.id, eventType: event.type, ordenId: ID }) },
    '../services/checkoutLifecycle': { getLifecycle: () => ({ settlePaid: async () => ({ managed: false }) }) },
    '../services/financialCoordinator': { applyFinancialEvent: async () => { applied++; return null; } },
    '../services/emailService': {}, '../services/firestoreOrderSync': { updateFirestoreOrderFromStripe: () => { throw new Error('No external effects permitted'); } },
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, require: n => Object.hasOwn(mocks, n) ? mocks[n] : localRequire(n), console: { log() {}, error() {}, warn() {} }, process: { env: { EMAIL_ON_PAYMENT: 'false' } }, Buffer, Date }, { filename });
  const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json() { return this; }, send() { return this; } };
  return { run: () => module.exports.procesarWebhookStripe({ headers: { 'stripe-signature': 'simulated' }, body: Buffer.from('{}') }, res), res, result: () => ({ applied, orderWrites, ledgerUpdate }) };
}
test('signed legacy unbound event is acknowledged for manual review without order/stock effects', async () => {
  const h = webhookHarness(false); await h.run(); const result = h.result();
  assert.equal(h.res.statusCode, 200); assert.equal(result.applied, 0); assert.equal(result.orderWrites, 0);
  assert.equal(result.ledgerUpdate.$set.status, 'skipped'); assert.equal(result.ledgerUpdate.$set.ordenId, null); assert.match(result.ledgerUpdate.$set.errorMessage, /LEGACY_BINDING_REQUIRED/);
});
test('signed legacy bound event reaches financial coordinator', async () => {
  const h = webhookHarness(true); await h.run(); assert.equal(h.res.statusCode, 200); assert.equal(h.result().applied, 1);
});
test('actual driver/save failure cannot retain scope privilege', async () => {
  const original = Orden.collection.updateOne;
  Orden.collection.updateOne = async () => { throw new Error('synthetic-driver-failure'); };
  try {
    const doc = failedOrder(); doc.estadoPago = 'pagado';
    await assert.rejects(withAuthorizedFinancialTransition(doc, () => doc.save({ validateBeforeSave: false })), /synthetic-driver-failure/);
    assertNoPrivilege(doc);
  } finally { Orden.collection.updateOne = original; }
});
test('managed intent missing correlation fails closed for manual review without save', async () => {
  const doc = failedOrder(); doc.checkoutIntent.keyHash = 'synthetic-hash'; let saves = 0;
  const apply = createFinancialCoordinator({ transaction: fn => fn({}), get: async () => doc, save: async () => { saves++; } });
  await assert.rejects(apply(ID, { estadoPago: 'fallido' }, { eventType: 'payment_intent.payment_failed', paymentIntentId: 'pi_synthetic', amount: 1000, currency: 'usd' }), e => e.publicCode === 'FINANCIAL_REVIEW_REQUIRED');
  assert.equal(saves, 0);
});
