"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createCheckoutLifecycle, identity, normalizePayload } = require("../src/services/checkoutLifecycle");
const { reserveProductStock } = require("../src/services/inventoryReservation");
const A = "aaaaaaaaaaaaaaaaaaaaaaaa"; const B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const key = "fixture-intention-key-000000001";
const address = { fullName: "Buyer", phone: "12345678", street: "Street", city: "City", state: "State", zip: "00000" };
const input = { items: [{ producto: A, cantidad: 1 }], shippingAddress: address, couponCode: "" };
const copy = value => value == null ? value : structuredClone(value);
// Serializable in-memory repository with rollback. No real Mongo or Stripe calls.
// Mongo adapter correctness is also checked through its conditional update contract.
function harness(stock = { [A]: 5, [B]: 5 }) {
  const orders = new Map(); const stocks = { ...stock }; const intents = new Map();
  let clock = new Date("2026-01-01T00:00:00Z"); let lock = Promise.resolve();
  let logicalIntents = 0; let createCalls = 0; let restoreCalls = 0; let failure = null;
  const repo = {
    transaction: async fn => {
      const previous = lock; let unlock; lock = new Promise(resolve => { unlock = resolve; }); await previous;
      const snapshotOrders = copy([...orders]); const snapshotStock = copy(stocks);
      try { return copy(await fn({ active: true })); }
      catch (err) { orders.clear(); for (const [id, value] of snapshotOrders) orders.set(id, value); for (const id of Object.keys(stocks)) delete stocks[id]; Object.assign(stocks, snapshotStock); throw err; }
      finally { unlock(); }
    },
    get: async id => copy(orders.get(String(id))),
    create: async payload => { const id = String(payload._id); if (orders.has(id)) throw Object.assign(new Error("duplicate"), { code: 11000 }); const order = { stripePaymentIntentId: "", ...copy(payload) }; orders.set(id, order); return copy(order); },
    save: async order => orders.set(String(order._id), copy(order)),
    saveExpected: async (order, session, expected) => {
      assert.ok(session);
      const previous = orders.get(String(order._id));
      assert.equal(previous.inventoryReservation.state, expected["inventoryReservation.state"]);
      assert.equal(previous.estadoPago, expected.estadoPago);
      orders.set(String(order._id), copy(order));
    },
    reserve: async (id, qty, session) => { assert.ok(session); if (stocks[id] == null) throw Object.assign(new Error("missing"), { statusCode: 404 }); if (stocks[id] < qty) throw Object.assign(new Error("stock"), { statusCode: 409 }); stocks[id] -= qty; return true; },
    restore: async (id, qty, session) => { assert.ok(session); restoreCalls++; stocks[id] += qty; },
    expired: async (date, limit) => copy([...orders.values()].filter(order => order.inventoryReservation.state === "reserved" && order.inventoryReservation.expiresAt <= date).slice(0, limit)),
  };
  const stripe = {
    create: async (order, stripeKey) => {
      createCalls++;
      if (failure === "definitive") throw Object.assign(new Error("fixture invalid"), { type: "StripeInvalidRequestError" });
      if (!intents.has(stripeKey)) { logicalIntents++; intents.set(stripeKey, { paymentIntentId: `pi_fixture_${logicalIntents}`, status: "requires_payment_method", amount: order.total * 100, clientSecret: "fixture-payment-sheet-credential" }); }
      if (failure === "lost") { failure = null; throw new Error("fixture lost response"); }
      return copy(intents.get(stripeKey));
    },
    retrieve: async id => copy([...intents.values()].find(intent => intent.paymentIntentId === id)),
    cancel: async id => { const intent = [...intents.values()].find(value => value.paymentIntentId === id); if (!['succeeded', 'processing'].includes(intent.status)) intent.status = "canceled"; return copy(intent); },
  };
  const rawLifecycle = createCheckoutLifecycle(repo, stripe, { now: () => clock, minutes: 15 });
  const proof = (id, piId) => { const order = orders.get(String(id)); return { orderId: String(id), paymentIntentId: piId || order.stripePaymentIntentId, correlation: order.checkoutIntent.stripeCorrelation, uid: order.firebaseUserId, amount: Math.round(order.total * 100), currency: order.moneda }; };
  const lifecycle = { ...rawLifecycle,
    settlePaid: (id, fields = {}, suppliedProof) => rawLifecycle.settlePaid(id, { ...fields, stripePaymentIntentId: fields.stripePaymentIntentId || orders.get(String(id)).stripePaymentIntentId }, suppliedProof || proof(id, fields.stripePaymentIntentId)),
    cancelledWebhook: (id, piId, suppliedProof) => rawLifecycle.cancelledWebhook(id, piId, suppliedProof || proof(id, piId)),
  };
  const buildOrder = async payload => ({ firebaseUserId: payload.firebaseUserId, clienteEmail: payload.userEmail, direccionEntrega: payload.shippingAddress, items: payload.items, moneda: "usd", subtotal: 10, shipping: 0, tax: 0, discount: 0, total: 10, estadoPago: "pendiente" });
  const prepare = (changes = {}) => lifecycle.prepare({ uid: "buyer", key, input, buildOrder, ...changes });
  return { lifecycle, rawLifecycle, proof, repo, stripe, orders, stocks, intents, prepare, buildOrder, counts: () => ({ logicalIntents, createCalls, restoreCalls }), advance: () => { clock = new Date(clock.getTime() + 16 * 60000); }, fail: value => { failure = value; } };
}
test("simultaneous same UID/key requests create one persistent order and logical intent", async () => {
  const h = harness();
  const anotherProcess = createCheckoutLifecycle(h.repo, h.stripe, { now: () => new Date("2026-01-01T00:00:00Z") });
  const [a, b] = await Promise.all([h.prepare(), anotherProcess.prepare({ uid: "buyer", key, input, buildOrder: h.buildOrder })]);
  assert.equal(String(a.order._id), String(b.order._id)); assert.equal(h.orders.size, 1);
  assert.equal(h.counts().logicalIntents, 1); assert.equal(h.stocks[A], 4);
});
test("equivalent normalized retry reuses order and Stripe intent", async () => {
  const h = harness(); const a = await h.prepare(); const b = await h.prepare({ input: { ...input, shippingAddress: { ...address, street: ' Street ' } } });
  assert.equal(a.order._id, b.order._id); assert.equal(h.counts().createCalls, 1); assert.equal(h.stocks[A], 4);
});
test("same key and materially different commercial payload is a conflict", async () => {
  const h = harness(); await h.prepare();
  for (const changed of [{ ...input, couponCode: 'OTHER' }, { ...input, items: [{ producto: A, cantidad: 2 }] }, { ...input, shippingAddress: { ...address, street: 'Other' } }]) {
    await assert.rejects(h.prepare({ input: changed }), error => error.publicCode === 'INTENT_PAYLOAD_CONFLICT');
  }
  assert.equal(h.orders.size, 1); assert.equal(h.stocks[A], 4);
});
test("another UID cannot resolve or cancel the owner's intention", async () => {
  const h = harness(); await h.prepare();
  await assert.rejects(h.lifecycle.resolve('another-buyer', key), error => error.statusCode === 404);
  await assert.rejects(h.lifecycle.cancel('another-buyer', key), error => error.statusCode === 404);
  assert.equal(h.stocks[A], 4);
});
test("two buyers competing for the last unit only allow one reservation", async () => {
  const h = harness({ [A]: 1 }); const results = await Promise.allSettled([h.prepare(), h.prepare({ uid: 'another-buyer' })]);
  assert.equal(results.filter(value => value.status === 'fulfilled').length, 1); assert.equal(h.stocks[A], 0); assert.equal(h.orders.size, 1);
});
test("multi-item failure rolls back every stock decrement and order creation", async () => {
  const h = harness({ [A]: 1, [B]: 0 });
  await assert.rejects(h.prepare({ input: { ...input, items: [{ producto: A, cantidad: 1 }, { producto: B, cantidad: 1 }] } }));
  assert.equal(h.stocks[A], 1); assert.equal(h.stocks[B], 0); assert.equal(h.orders.size, 0); assert.equal(h.counts().logicalIntents, 0);
});
test("expiry cancels Stripe then restores stock exactly once across parallel runners", async () => {
  const h = harness({ [A]: 1 }); const result = await h.prepare(); h.advance();
  await Promise.all([h.lifecycle.expire(), h.lifecycle.expire()]); await h.lifecycle.expire();
  const order = await h.repo.get(result.order._id); assert.equal(order.inventoryReservation.state, 'released');
  assert.equal(h.stocks[A], 1); assert.equal(h.counts().restoreCalls, 1);
});
test("duplicate success webhook consumes the reservation once without decrementing again", async () => {
  const h = harness({ [A]: 1 }); const result = await h.prepare();
  const fields = { stripePaymentIntentId: result.order.stripePaymentIntentId };
  const outcomes = await Promise.all([h.lifecycle.settlePaid(result.order._id, fields), h.lifecycle.settlePaid(result.order._id, fields)]);
  assert.equal(outcomes.filter(value => value.changed).length, 1); assert.equal(h.stocks[A], 0);
  assert.equal((await h.repo.get(result.order._id)).estadoPago, 'pagado');
});
test("retry after lost Stripe/HTTP result retains the key and recovers the same intent", async () => {
  const h = harness(); h.fail('lost'); await assert.rejects(h.prepare(), error => error.publicCode === 'INTENT_PENDING');
  const result = await h.prepare(); assert.ok(result.clientSecret); assert.equal(h.orders.size, 1); assert.equal(h.counts().logicalIntents, 1); assert.equal(h.stocks[A], 4);
  // Lost HTTP response after persistence also recovers via retrieve, never another create.
  await h.prepare(); assert.equal(h.counts().createCalls, 2);
});
test("definitive preparation rejection releases reservation; unknown outcome does not", async () => {
  const h = harness({ [A]: 1 }); h.fail('definitive'); await assert.rejects(h.prepare());
  assert.equal(h.stocks[A], 1); assert.equal([...h.orders.values()][0].inventoryReservation.state, 'released');
  const uncertain = harness({ [A]: 1 }); uncertain.fail('lost'); await assert.rejects(uncertain.prepare()); uncertain.advance(); await uncertain.lifecycle.expire();
  const order = [...uncertain.orders.values()][0]; assert.equal(uncertain.stocks[A], 0); assert.equal(order.inventoryReservation.needsReconciliation, true);
});
test("paid Stripe state prevents expiry release; signed success finalizes after nominal expiry", async () => {
  const h = harness({ [A]: 1 }); const result = await h.prepare(); [...h.intents.values()][0].status = 'succeeded'; h.advance();
  await h.lifecycle.expire(); assert.equal(h.stocks[A], 0); assert.equal(h.counts().restoreCalls, 0);
  await h.lifecycle.settlePaid(result.order._id, { stripePaymentIntentId: result.order.stripePaymentIntentId });
  assert.equal((await h.repo.get(result.order._id)).inventoryReservation.state, 'consumed');
});
test("late paid event after release is an explicit reconciliation state, never hidden overselling", async () => {
  const h = harness({ [A]: 1 }); const result = await h.prepare(); await h.lifecycle.cancel('buyer', key);
  await h.lifecycle.settlePaid(result.order._id, { stripePaymentIntentId: result.order.stripePaymentIntentId });
  await h.lifecycle.settlePaid(result.order._id, { stripePaymentIntentId: result.order.stripePaymentIntentId });
  const order = await h.repo.get(result.order._id); assert.equal(order.estadoPago, 'pagado'); assert.equal(order.inventoryReservation.state, 'reconciliation_required'); assert.equal(order.payoutBlocked, true); assert.equal(h.stocks[A], 1);
});
test("client cannot override stock, reservation state, financial state or server pricing", async () => {
  const h = harness({ [A]: 1 }); const result = await h.prepare({ input: { ...input, stock: 999, inventoryReservation: { state: 'consumed' }, estadoPago: 'pagado', total: .01 } });
  assert.equal(result.order.inventoryReservation.state, 'reserved'); assert.equal(result.order.estadoPago, 'pendiente'); assert.equal(result.order.total, 10); assert.equal(h.stocks[A], 0);
});
test("Mongo stock adapter requires transaction and uses guarded conditional decrement", async () => {
  let query; let update; let options;
  const Product = { findById: () => ({ session: () => ({ lean: async () => ({ activo: true, gestionStock: true }) }) }), updateOne: async (q, u, o) => { query = q; update = u; options = o; return { modifiedCount: 0 }; } };
  await assert.rejects(reserveProductStock(Product, A, 1, null));
  const session = {}; await assert.rejects(reserveProductStock(Product, A, 1, session), error => error.statusCode === 409);
  assert.deepEqual(query.stock, { $gte: 1 }); assert.deepEqual(update, { $inc: { stock: -1 } }); assert.equal(options.session, session);
});
test("signed cancellation and repeated release do not restore stock twice", async () => {
  const h = harness({ [A]: 1 }); const result = await h.prepare();
  await h.lifecycle.cancelledWebhook(result.order._id, result.order.stripePaymentIntentId);
  await h.lifecycle.cancelledWebhook(result.order._id, result.order.stripePaymentIntentId);
  assert.equal(h.counts().restoreCalls, 1); assert.equal(h.stocks[A], 1);
});
test("stable identity rejects invalid keys; fingerprints normalize items and coupon", () => {
  assert.throws(() => identity('buyer', 'short'));
  assert.notEqual(identity('buyer', key).id, identity('other', key).id);
  assert.equal(identity('buyer', key).id, identity('buyer', key).id);
  assert.deepEqual(normalizePayload({ ...input, couponCode: ' vip20 ', items: [{ producto: A.toUpperCase(), cantidad: 1 }, { producto: A, cantidad: 1 }] }).items, [{ producto: A, cantidad: 2 }]);
});
test("unknown Stripe attempt after expiry never recreates an intent beyond its retention window", async () => {
  const h = harness(); h.fail('lost'); await assert.rejects(h.prepare());
  for (let i = 0; i < 100; i++) h.advance();
  await assert.rejects(h.prepare(), error => error.publicCode === 'INTENT_EXPIRED');
  assert.equal(h.counts().createCalls, 1); assert.equal(h.stocks[A], 4);
});
test("unique-ID insert race recovers the committed compatible order instead of another create", async () => {
  const h = harness(); const original = await h.prepare();
  h.repo.transaction = async () => { throw Object.assign(new Error('fixture unique race'), { code: 11000 }); };
  const retry = await h.prepare(); assert.equal(retry.order._id, original.order._id);
  assert.equal(h.counts().createCalls, 1); assert.equal(h.orders.size, 1);
});
test("refund financial state is not overwritten by a later success event", async () => {
  const h = harness(); const result = await h.prepare();
  await h.lifecycle.settlePaid(result.order._id, {});
  const order = await h.repo.get(result.order._id); order.estadoPago = 'reembolsado'; await h.repo.save(order);
  const late = await h.lifecycle.settlePaid(result.order._id, {}); assert.equal(late.changed, false);
  assert.equal((await h.repo.get(result.order._id)).estadoPago, 'reembolsado');
});
test("owner-only recovery route returns buyer DTO without Stripe identifiers or reservation internals", async () => {
  const h = harness(); const prepared = await h.prepare();
  const routes = new Map(); const filename = require('node:path').join(__dirname, '../src/routes/stripeRoutes.js');
  const localRequire = require('node:module').createRequire(filename);
  const mocks = {
    express: { Router: () => ({ post: (path, ...handlers) => routes.set(path, handlers), get: (path, ...handlers) => routes.set(path, handlers) }) },
    mongoose: { Types: { ObjectId: { isValid: () => true } } },
    '../models/Orden': {}, '../models/Producto': {},
    '../services/checkoutLifecycle': { getLifecycle: () => h.lifecycle },
    '../middleware/firebaseAuth': { verificarFirebase() {} },
    '../payments/stripeService': {}, '../payments/stripeWebhookController': {}, '../controllers/ordenController': {},
  };
  require('node:vm').runInNewContext(require('node:fs').readFileSync(filename, 'utf8'), {
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : localRequire(name),
    module: { exports: {} }, console: { log() {}, error() {} }, process: { env: {} },
  });
  const handler = routes.get('/checkout-intent')[1];
  const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } });
  const res = response(); await handler({ headers: { 'idempotency-key': key }, firebaseUser: { uid: 'buyer' } }, res);
  assert.equal(res.code, 200); assert.equal(res.body.data.order._id, prepared.order._id);
  const content = JSON.stringify(res.body);
  for (const value of [prepared.order.stripePaymentIntentId, 'clientSecret', 'keyHash', 'fingerprint', 'inventoryReservation', 'costoProveedor']) assert.equal(content.includes(value), false);
  const other = response(); await handler({ headers: { 'idempotency-key': key }, firebaseUser: { uid: 'other-buyer' } }, other);
  assert.equal(other.code, 404);
});

test('4B: wrong opaque correlation before PI persistence cannot pay or cancel', async () => {
  const h = harness({ [A]: 1 }); const result = await h.prepare();
  const order = h.orders.get(result.order._id); order.stripePaymentIntentId = '';
  const proof = { ...h.proof(order._id, 'pi_fixture_1'), correlation: 'synthetic-wrong-correlation' };
  const before = copy([...h.orders]);
  await assert.rejects(h.rawLifecycle.settlePaid(order._id, { stripePaymentIntentId: 'pi_fixture_1' }, proof), e => e.publicCode === 'STRIPE_CORRELATION_MISMATCH');
  await assert.rejects(h.rawLifecycle.cancelledWebhook(order._id, 'pi_fixture_1', proof));
  assert.deepEqual([...h.orders], before); assert.equal(h.stocks[A], 0);
});
test('4B: valid early correlation records payment before PI persistence', async () => {
  const h = harness(); const result = await h.prepare(); const order = h.orders.get(result.order._id); order.stripePaymentIntentId = '';
  await h.rawLifecycle.settlePaid(order._id, { stripePaymentIntentId: 'pi_fixture_1' }, h.proof(order._id, 'pi_fixture_1'));
  assert.equal(h.orders.get(order._id).estadoPago, 'pagado'); assert.equal(h.stocks[A], 4);
});
test('4B: known PI mismatch, amount, currency and owner mismatch leave inventory intact', async () => {
  const h = harness(); const result = await h.prepare(); const valid = h.proof(result.order._id);
  for (const patch of [{ paymentIntentId: 'pi_other_fixture' }, { amount: 1 }, { currency: 'eur' }, { uid: 'other' }, { orderId: B }]) {
    await assert.rejects(h.rawLifecycle.settlePaid(result.order._id, { stripePaymentIntentId: valid.paymentIntentId }, { ...valid, ...patch }));
  }
  assert.equal(h.stocks[A], 4); assert.equal(h.orders.get(result.order._id).estadoPago, 'pendiente');
});
test('4B: release/consume racing has one stock effect and paid state', async () => {
  const h = harness({ [A]: 1 }); const result = await h.prepare();
  await Promise.all([h.lifecycle.cancel('buyer', key), h.lifecycle.settlePaid(result.order._id)]);
  const order = h.orders.get(result.order._id); assert.equal(order.estadoPago, 'pagado');
  assert.equal(h.stocks[A], order.inventoryReservation.state === 'consumed' ? 0 : 1);
  assert.ok(['consumed', 'reconciliation_required'].includes(order.inventoryReservation.state));
  await h.lifecycle.release(order._id, 'duplicate', 'stripe_canceled', order.stripePaymentIntentId);
  assert.ok(h.counts().restoreCalls <= 1);
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('expiry revalidates reconciliation flag added after selection before Stripe contact', async () => {
  const h = harness({ [A]: 1 }); const result = await h.prepare(); h.advance();
  const select = h.repo.expired;
  h.repo.expired = async (...args) => {
    const selected = await select(...args);
    const order = await h.repo.get(result.order._id);
    order.inventoryReservation.needsReconciliation = true;
    order.inventoryReservation.reconciliationReason = 'review_after_selection';
    await h.repo.save(order);
    return selected;
  };
  let cancellations = 0;
  h.stripe.cancel = async () => { cancellations++; throw Error('Must not contact Stripe'); };
  assert.deepEqual(await h.lifecycle.expire(), { checked: 1, failed: 0 });
  const order = await h.repo.get(result.order._id);
  assert.equal(cancellations, 0); assert.equal(h.counts().restoreCalls, 0);
  assert.equal(h.stocks[A], 0); assert.equal(order.inventoryReservation.state, 'reserved');
  assert.equal(order.inventoryReservation.reconciliationReason, 'review_after_selection');
});

test('expiry retains stock when reconciliation is marked while Stripe cancellation is pending', async () => {
  const h = harness({ [A]: 1 }); const result = await h.prepare(); h.advance();
  const started = deferred(), resume = deferred(); let cancellations = 0;
  h.stripe.cancel = async () => {
    cancellations++; started.resolve(); await resume.promise;
    return { status: 'canceled', paymentIntentId: result.order.stripePaymentIntentId };
  };
  const pending = h.lifecycle.expire(); await started.promise;
  await h.repo.transaction(async session => {
    const order = await h.repo.get(result.order._id, session);
    order.inventoryReservation.needsReconciliation = true;
    order.inventoryReservation.reconciliationReason = 'review_during_cancellation';
    await h.repo.save(order, session);
  });
  resume.resolve();
  assert.deepEqual(await pending, { checked: 1, failed: 0 });
  const order = await h.repo.get(result.order._id);
  assert.equal(cancellations, 1); assert.equal(h.counts().restoreCalls, 0);
  assert.equal(h.stocks[A], 0); assert.equal(order.estadoPago, 'pendiente');
  assert.equal(order.inventoryReservation.state, 'reserved');
  assert.equal(order.inventoryReservation.reconciliationReason, 'review_during_cancellation');
});

for (const state of ['pagado', 'reembolsado', 'reembolsado_parcial', 'unknown']) {
  test(`release refuses incompatible payment state ${state} before restoring stock`, async () => {
    const h = harness({ [A]: 1 }); const result = await h.prepare();
    const order = await h.repo.get(result.order._id); order.estadoPago = state; await h.repo.save(order);
    const before = copy(order);
    assert.equal(await h.lifecycle.release(order._id, 'expired', 'stripe_canceled', order.stripePaymentIntentId), false);
    assert.deepEqual(await h.repo.get(order._id), before);
    assert.equal(h.counts().restoreCalls, 0); assert.equal(h.stocks[A], 0);
  });
}

for (const state of ['consumed', 'released', 'reconciliation_required']) {
  test(`stale selected reservation now ${state} never contacts Stripe`, async () => {
    const h = harness({ [A]: 1 }); const result = await h.prepare(); h.advance();
    const selected = copy(await h.repo.get(result.order._id));
    h.repo.expired = async () => [selected];
    const current = await h.repo.get(result.order._id); current.inventoryReservation.state = state;
    await h.repo.save(current);
    h.stripe.cancel = async () => { throw Error('Must not contact Stripe'); };
    assert.deepEqual(await h.lifecycle.expire(), { checked: 1, failed: 0 });
    assert.deepEqual(await h.repo.get(current._id), current); assert.equal(h.counts().restoreCalls, 0);
  });
}

for (const status of ['succeeded', 'processing', 'unknown']) {
  test(`expiry retains reservation for Stripe status ${status}`, async () => {
    const h = harness({ [A]: 1 }); const result = await h.prepare(); h.advance();
    h.stripe.cancel = async () => ({ status, paymentIntentId: result.order.stripePaymentIntentId });
    assert.deepEqual(await h.lifecycle.expire(), { checked: 1, failed: 0 });
    const order = await h.repo.get(result.order._id);
    assert.equal(order.inventoryReservation.state, 'reserved');
    assert.equal(order.inventoryReservation.needsReconciliation, true);
    assert.equal(h.stocks[A], 0); assert.equal(h.counts().restoreCalls, 0);
  });
}

test('expiry Stripe network exception retains reservation and reports a partial failure', async () => {
  const h = harness({ [A]: 1 }); const result = await h.prepare(); h.advance();
  h.stripe.cancel = async () => { throw Error('Synthetic uncertain network outcome'); };
  assert.deepEqual(await h.lifecycle.expire(), { checked: 1, failed: 1 });
  const order = await h.repo.get(result.order._id);
  assert.equal(order.inventoryReservation.state, 'reserved');
  assert.equal(order.estadoPago, 'pendiente'); assert.equal(h.stocks[A], 0);
  assert.equal(h.counts().restoreCalls, 0);
});

test('expiry cannot release stock when signed payment wins during Stripe cancellation', async () => {
  const h = harness({ [A]: 1 }); const result = await h.prepare(); h.advance();
  const started = deferred(), resume = deferred();
  h.stripe.cancel = async () => {
    started.resolve(); await resume.promise;
    return {status:'canceled', paymentIntentId:result.order.stripePaymentIntentId};
  };
  const pending = h.lifecycle.expire(); await started.promise;
  await h.lifecycle.settlePaid(result.order._id);
  resume.resolve();
  assert.deepEqual(await pending, {checked:1, failed:0});
  const order = await h.repo.get(result.order._id);
  assert.equal(order.estadoPago, 'pagado');assert.equal(order.inventoryReservation.state, 'consumed');
  assert.equal(h.stocks[A], 0);assert.equal(h.counts().restoreCalls, 0);
});

test('uncertain Stripe result cannot overwrite a review added while cancellation was pending', async () => {
  const h = harness({ [A]: 1 }); const result = await h.prepare(); h.advance();
  const started = deferred(), resume = deferred();
  h.stripe.cancel = async () => {
    started.resolve(); await resume.promise;
    return {status:'processing', paymentIntentId:result.order.stripePaymentIntentId};
  };
  const pending = h.lifecycle.expire(); await started.promise;
  const order = await h.repo.get(result.order._id);
  order.inventoryReservation.needsReconciliation = true;
  order.inventoryReservation.reconciliationReason = 'retain_existing_review';
  await h.repo.save(order);
  resume.resolve();await pending;
  assert.deepEqual(await h.repo.get(result.order._id), order);
  assert.equal(h.stocks[A], 0);assert.equal(h.counts().restoreCalls, 0);
});

for (const state of ['completed', 'terminal']) {
  test(`release retains reserved stock for incompatible checkout state ${state}`, async () => {
    const h = harness({ [A]: 1 });const result = await h.prepare();
    const order = await h.repo.get(result.order._id);order.checkoutIntent.state = state;
    await h.repo.save(order);
    assert.equal(await h.lifecycle.release(order._id, 'expired', 'stripe_canceled', order.stripePaymentIntentId), false);
    assert.deepEqual(await h.repo.get(order._id), order);assert.equal(h.stocks[A], 0);
    assert.equal(h.counts().restoreCalls, 0);
  });
}
