"use strict";
const crypto = require("crypto");
const { assertStripeCorrelation, withAuthorizedFinancialTransition } = require("./orderInvariants");
const { normalizeCheckoutItems } = require("./checkoutPricing");
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const error = (message, statusCode = 409, code = "INTENT_CONFLICT") => Object.assign(new Error(message), { statusCode, publicCode: code });
const addressFields = ["fullName", "phone", "street", "city", "state", "zip"];
function identity(uid, key) {
  if (!uid) throw error("Sesión requerida", 401, "SESSION");
  if (typeof key !== "string" || !/^[a-zA-Z0-9_-]{20,128}$/.test(key)) throw error("Idempotency-Key inválida", 400, "INTENT_KEY");
  const keyHash = hash(JSON.stringify([uid, key]));
  return { keyHash, id: keyHash.slice(0, 24) };
}
function normalizePayload(input) {
  const items = normalizeCheckoutItems(input.items).sort((a, b) => a.producto.localeCompare(b.producto));
  if (typeof (input.couponCode ?? "") !== "string") throw error("Cupón inválido", 400);
  const shippingAddress = {};
  for (const field of addressFields) {
    const value = typeof input.shippingAddress?.[field] === "string" ? input.shippingAddress[field].trim() : "";
    if (!value || value.length > 200) throw error("Dirección de entrega incompleta o inválida", 400);
    shippingAddress[field] = value;
  }
  return { items, couponCode: (input.couponCode || "").trim().toUpperCase(), shippingAddress };
}
function createCheckoutLifecycle(repo, stripe, options = {}) {
  const now = options.now || (() => new Date());
  const minutes = Number(options.minutes ?? 15);
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 60) throw new Error("CHECKOUT_RESERVATION_MINUTES debe estar entre 1 y 60");
  function checkOwner(order, uid, keyHash) {
    if (order.firebaseUserId !== uid || order.checkoutIntent?.keyHash !== keyHash) throw error("Intención no disponible", 404);
  }
  async function resolve(uid, key) {
    const { id, keyHash } = identity(uid, key);
    const order = await repo.get(id);
    if (!order) throw error("Intención no encontrada", 404);
    checkOwner(order, uid, keyHash);
    return order;
  }
  function canRelease(order) {
    return order?.inventoryReservation?.state === "reserved" &&
      order.inventoryReservation.needsReconciliation !== true &&
      ["pendiente", "fallido"].includes(order.estadoPago) &&
      !["completed", "terminal"].includes(order.checkoutIntent?.state);
  }
  async function release(id, reason, proof, paymentIntentId) {
    return repo.transaction(async session => {
      const order = await repo.get(id, session);
      if (!canRelease(order)) return false;
      if (proof === "never_attempted" && order.checkoutIntent.stripeAttemptStartedAt) return false;
      if (proof === "definitive_preparation_failure" && order.stripePaymentIntentId) return false;
      if (proof === "stripe_canceled" && (order.stripePaymentIntentId || order.stripeSessionId) !== paymentIntentId) throw error("Reserva pendiente de conciliación", 503);
      if (!["never_attempted", "stripe_canceled", "definitive_preparation_failure"].includes(proof)) throw error("Liberación sin prueba definitiva", 503);
      const expected = { "inventoryReservation.state": "reserved", "inventoryReservation.needsReconciliation": { $ne: true }, estadoPago: order.estadoPago };
      for (const line of order.inventoryReservation.lines) await repo.restore(line.producto, line.cantidad, session);
      order.inventoryReservation.state = "released";
      order.inventoryReservation.releasedAt = now();
      order.inventoryReservation.releaseReason = reason;
      order.checkoutIntent.state = "terminal";
      order.estadoPago = "fallido";
      await repo.saveExpected(order, session, expected);
      return true;
    });
  }
  async function reconcile(id, reason) {
    await repo.transaction(async session => {
      const order = await repo.get(id, session);
      if (!canRelease(order)) return;
      order.inventoryReservation.needsReconciliation = true;
      order.inventoryReservation.reconciliationReason = reason;
      await repo.saveExpected(order, session, { "inventoryReservation.state": "reserved", estadoPago: order.estadoPago });
    });
  }
  async function settlePaid(id, fields = {}, proof) {
    const before = await repo.get(id);
    if (!before?.checkoutIntent?.keyHash) return { managed: false };
    return repo.transaction(async session => {
      const order = await repo.get(id, session);
      if (!order?.checkoutIntent?.keyHash) return { managed: false };
      assertStripeCorrelation(order, proof);
      const expected = { "inventoryReservation.state": order.inventoryReservation.state, estadoPago: order.estadoPago };
      if (fields.stripePaymentIntentId !== proof.paymentIntentId) throw error("PaymentIntent incompatible", 409);
      if (fields.stripePaymentIntentId && order.stripePaymentIntentId && fields.stripePaymentIntentId !== order.stripePaymentIntentId) throw error("PaymentIntent no corresponde a la orden", 503);
      if (["reembolsado", "reembolsado_parcial"].includes(order.estadoPago)) return { managed: true, changed: false };
      if (order.estadoPago === "pagado" && ["consumed", "reconciliation_required"].includes(order.inventoryReservation.state)) return { managed: true, changed: false };
      if (!["reserved", "released"].includes(order.inventoryReservation.state)) throw error("Estado de reserva requiere conciliación", 409);
      if (order.inventoryReservation.state === "released") {
        order.inventoryReservation.state = "reconciliation_required";
        order.inventoryReservation.needsReconciliation = true;
        order.inventoryReservation.reconciliationReason = "paid_after_inventory_release";
        order.payoutBlocked = true;
        order.payoutBlockedReason = "inventory_reconciliation_required";
      } else if (order.inventoryReservation.state === "reserved") {
        order.inventoryReservation.state = "consumed";
        order.inventoryReservation.consumedAt = now();
        order.inventoryReservation.needsReconciliation = false;
        order.inventoryReservation.reconciliationReason = "";
      }
      Object.assign(order, fields, { estadoPago: "pagado" });
      order.checkoutIntent.state = "completed";
      await withAuthorizedFinancialTransition(order, () => repo.saveExpected(order, session, expected));
      return { managed: true, changed: true, order };
    });
  }
  async function cancelOrder(order, reason) {
    // Batch selection/owner resolution can be stale. Re-read immediately before
    // any external cancellation; release checks again within its transaction.
    if (!order?._id) return order;
    order = await repo.get(String(order._id));
    if (!canRelease(order)) return order;
    if (!order.stripePaymentIntentId && !order.stripeSessionId) {
      if (!order.checkoutIntent.stripeAttemptStartedAt) await release(String(order._id), reason, "never_attempted");
      else await reconcile(String(order._id), "unknown_payment_intent_after_attempt");
      return repo.get(String(order._id));
    }
    // Stripe confirms final cancellation outside Mongo transactions. A pending/paid
    // intent is never released merely because a local clock says it expired.
    const result = await stripe.cancel(order.stripeSessionId || order.stripePaymentIntentId);
    if (result.paymentIntentId && order.stripePaymentIntentId && result.paymentIntentId !== order.stripePaymentIntentId) throw error("Stripe requiere conciliación", 503);
    if (result.status === "canceled") await release(String(order._id), reason, "stripe_canceled", order.stripePaymentIntentId || order.stripeSessionId);
    else await reconcile(String(order._id), "stripe_payment_not_cancelable_" + result.status);
    return repo.get(String(order._id));
  }
  async function prepare({ uid, email = "", key, input, buildOrder }) {
    const { id, keyHash } = identity(uid, key);
    const normalized = normalizePayload(input);
    const fingerprint = hash(JSON.stringify(normalized));
    let order;
    try {
      order = await repo.transaction(async session => {
        const existing = await repo.get(id, session);
        if (existing) {
          checkOwner(existing, uid, keyHash);
          if (existing.checkoutIntent.fingerprint !== fingerprint) throw error("La intención contiene otros productos, cupón o dirección", 409, "INTENT_PAYLOAD_CONFLICT");
          return existing;
        }
        const payload = await buildOrder({ ...normalized, firebaseUserId: uid, userEmail: email, session });
        const lines = [];
        for (const item of normalized.items) if (await repo.reserve(item.producto, item.cantidad, session)) lines.push(item);
        return repo.create({ ...payload, _id: id, checkoutIntent: { keyHash, fingerprint, stripeCorrelation: crypto.randomBytes(32).toString("hex"), state: "preparing" }, inventoryReservation: { state: "reserved", reservedAt: now(), expiresAt: new Date(now().getTime() + minutes * 60000), lines } }, session);
      });
    } catch (err) {
      if (err.code !== 11000) throw err;
      order = await repo.get(id); // Unique _id arbitrates insert races, including stock-unmanaged products.
      if (!order) throw error("Intención en preparación; reintenta con la misma clave", 503);
      checkOwner(order, uid, keyHash);
      if (order.checkoutIntent.fingerprint !== fingerprint) throw error("Payload incompatible con la intención", 409, "INTENT_PAYLOAD_CONFLICT");
    }
    if (order.inventoryReservation.state !== "reserved" || order.estadoPago === "pagado") throw error("La intención terminó; consulta su estado", 409, "INTENT_TERMINAL");
    if (new Date(order.inventoryReservation.expiresAt) <= now()) {
      await cancelOrder(order, "expired");
      throw error("La reserva expiró; consulta o cancela definitivamente esta intención", 409, "INTENT_EXPIRED");
    }
    let result;
    if (order.stripePaymentIntentId || order.stripeSessionId) {
      result = await stripe.retrieve(order.stripeSessionId || order.stripePaymentIntentId);
    } else {
      // Persist attempted external work before starting it. Lost responses must not
      // result in inventory release while an unknown Stripe intent can still pay.
      await repo.transaction(async session => {
        const current = await repo.get(id, session);
        if (current.inventoryReservation.state !== "reserved" || new Date(current.inventoryReservation.expiresAt) <= now()) throw error("Reserva no disponible", 409);
        current.checkoutIntent.stripeAttemptStartedAt ||= now();
        await repo.save(current, session);
      });
      try {
        result = await stripe.create(order, `alaia_checkout_${keyHash}`);
      } catch (err) {
        if (err.type === "StripeInvalidRequestError" && err.code !== "idempotency_key_in_use") {
          await release(id, "stripe_preparation_rejected", "definitive_preparation_failure");
        } else await reconcile(id, "stripe_preparation_outcome_unknown");
        throw error("Preparación pendiente; reintenta con la misma intención", 503, "INTENT_PENDING");
      }
      await repo.transaction(async session => {
        const current = await repo.get(id, session);
        if (current.stripePaymentIntentId && current.stripePaymentIntentId !== result.paymentIntentId) throw error("Stripe requiere conciliación", 503);
        if (result.paymentIntentId) current.stripePaymentIntentId = result.paymentIntentId;
        if (result.sessionId) current.stripeSessionId = result.sessionId;
        current.stripeAmountTotal = result.amount;
        if (current.inventoryReservation.state === "reserved") {
          current.checkoutIntent.state = "ready";
          current.inventoryReservation.needsReconciliation = false;
          current.inventoryReservation.reconciliationReason = "";
        }
        await repo.save(current, session);
      });
    }
    order = await repo.get(id);
    if (order.estadoPago === "pagado" || order.inventoryReservation.state === "consumed") throw error("Pago recibido; consulta su estado", 409, "PAYMENT_VERIFYING");
    if (result.status === "canceled") {
      await release(id, "stripe_canceled", "stripe_canceled", order.stripePaymentIntentId || order.stripeSessionId);
      throw error("La intención terminó", 409, "INTENT_TERMINAL");
    }
    if (["succeeded", "processing"].includes(result.status)) throw error("Pago recibido; consulta su estado", 409, "PAYMENT_VERIFYING");
    if (order.inventoryReservation.state !== "reserved" || new Date(order.inventoryReservation.expiresAt) <= now()) throw error("Reserva vencida; consulta su estado", 409, "INTENT_EXPIRED");
    return { order, clientSecret: result.clientSecret, checkoutUrl: result.checkoutUrl };
  }
  async function expire(limit = 100) {
    const expired = await repo.expired(now(), limit);
    let checked = 0; let failed = 0;
    for (const order of expired) {
      try { await cancelOrder(order, "expired"); } catch { failed++; }
      checked++;
    }
    return { checked, failed };
  }
  async function cancel(uid, key) { return cancelOrder(await resolve(uid, key), "buyer_cancelled_intention"); }
  async function cancelledWebhook(id, paymentIntentId, proof) {
    const order = await repo.get(id);
    if (!order?.checkoutIntent?.keyHash) return { managed: false };
    assertStripeCorrelation(order, proof);
    if (paymentIntentId !== proof.paymentIntentId) throw error("PaymentIntent incompatible", 409);
    if (order.stripePaymentIntentId && (order.stripePaymentIntentId || order.stripeSessionId) !== paymentIntentId) throw error("PaymentIntent incompatible", 503);
    if (!order.stripePaymentIntentId) await repo.transaction(async session => {
      const current = await repo.get(id, session);
      if (current.stripePaymentIntentId && current.stripePaymentIntentId !== paymentIntentId) throw error("PaymentIntent incompatible", 503);
      current.stripePaymentIntentId = paymentIntentId;
      await repo.save(current, session);
    });
    await release(id, "stripe_signed_cancellation", "stripe_canceled", paymentIntentId);
    return { managed: true };
  }
  async function expiredWebhook(id, sessionId, proof) {
    await repo.transaction(async session => {
      const order = await repo.get(id, session);
      assertStripeCorrelation(order, proof);
      if (sessionId !== proof.sessionId) throw error("Session Stripe incompatible", 409);
      if (!order.stripeSessionId) { order.stripeSessionId = sessionId; await repo.save(order, session); }
    });
    return cancelOrder(await repo.get(id), "stripe_session_expired");
  }
  return { prepare, resolve, release, settlePaid, cancel, expire, cancelledWebhook, expiredWebhook };
}
const singletons = {};
function getLifecycle(mode = "mobile") {
  if (singletons[mode]) return singletons[mode];
  const mongoose = require("mongoose");
  const Orden = require("../models/Orden");
  const Producto = require("../models/Producto");
  const { reserveProductStock } = require("./inventoryReservation");
  const { crearPaymentIntentMobile, crearSesionPago, stripe } = require("../payments/stripeService");
  const repo = {
    transaction: async fn => { const session = await mongoose.startSession(); try { let result; await session.withTransaction(async () => { result = await fn(session); }); return result; } finally { await session.endSession(); } },
    get: (id, session) => Orden.findById(id).select("+checkoutIntent.stripeCorrelation").session(session || null),
    create: async (payload, session) => { const order = new Orden(payload); order.$session(session); await order.save({ session }); return order; },
    save: (order, session) => order.save({ session }),
    saveExpected: (order, session, expected) => { order.$where = expected; return order.save({ session }); },
    reserve: (id, qty, session) => reserveProductStock(Producto, id, qty, session),
    restore: async (id, qty, session) => { const result = await Producto.updateOne({ _id: id }, { $inc: { stock: qty } }, { session }); if (result.matchedCount !== 1) throw error("Producto reservado desapareció; conciliación requerida", 503); },
    expired: (date, limit) => Orden.find({ "inventoryReservation.state": "reserved", "inventoryReservation.expiresAt": { $lte: date }, "inventoryReservation.needsReconciliation": { $ne: true } }).limit(limit),
  };
  const metadata = order => ({ ordenId: String(order._id), firebaseUserId: order.firebaseUserId, checkoutCorrelation: order.checkoutIntent.stripeCorrelation, source: order.source });
  const sessionResult = value => ({ sessionId: value.id, paymentIntentId: typeof value.payment_intent === "string" ? value.payment_intent : value.payment_intent?.id, checkoutUrl: value.url, amount: value.amount_total, status: value.payment_status === "paid" ? "succeeded" : value.status === "expired" ? "canceled" : value.status === "complete" ? "processing" : "requires_payment_method" });
  const adapter = {
    create: (order, key) => crearPaymentIntentMobile({ amount: Math.round(order.total * 100), currency: order.moneda, clienteEmail: order.clienteEmail, metadata: metadata(order), idempotencyKey: key }),
    retrieve: async id => { const intent = await stripe.paymentIntents.retrieve(id); return { paymentIntentId: intent.id, clientSecret: intent.client_secret, status: intent.status, amount: intent.amount }; },
    cancel: async id => { if (id.startsWith("cs_")) {
      let session = await stripe.checkout.sessions.retrieve(id);
      if (session.status === "open") session = await stripe.checkout.sessions.expire(id);
      const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
      if (piId) {
        const intent = await stripe.paymentIntents.retrieve(piId);
        if (["canceled", "succeeded", "processing"].includes(intent.status)) return { status: intent.status, paymentIntentId: piId };
        // Only an expired session can no longer offer another payment attempt.
        if (session.status === "expired") { const canceled = await stripe.paymentIntents.cancel(piId, {}, { idempotencyKey: `alaia_cancel_${piId}` }); return { status: canceled.status, paymentIntentId: piId }; }
        return { status: "processing", paymentIntentId: piId };
      }
      return sessionResult(session);
    } const intent = await stripe.paymentIntents.retrieve(id); if (intent.status === "canceled" || intent.status === "succeeded" || intent.status === "processing") return intent; return stripe.paymentIntents.cancel(id, {}, { idempotencyKey: `alaia_cancel_${id}` }); },
  };
  if (mode === "web") {
    adapter.create = async (order, key) => sessionResult(await crearSesionPago({ lineItems: [{ price_data: { currency: order.moneda, product_data: { name: "Pedido Alaia" }, unit_amount: Math.round(order.total * 100) }, quantity: 1 }], clienteEmail: order.clienteEmail, metadata: metadata(order), idempotencyKey: key }));
    adapter.retrieve = async id => id.startsWith("cs_") ? sessionResult(await stripe.checkout.sessions.retrieve(id)) : { status: (await stripe.paymentIntents.retrieve(id)).status };
  }
  singletons[mode] = createCheckoutLifecycle(repo, adapter, { minutes: process.env.CHECKOUT_RESERVATION_MINUTES || 15 });
  return singletons[mode];
}
module.exports = { createCheckoutLifecycle, normalizePayload, identity, getLifecycle, prepareCheckout: args => getLifecycle().prepare(args) };
