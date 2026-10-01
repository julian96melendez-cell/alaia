"use strict";
// A document capability cannot be supplied through JSON or a client/admin route.
const trustedPaidDocuments = new WeakSet();
async function withAuthorizedFinancialTransition(order, callback) {
  if (trustedPaidDocuments.has(order)) throw new Error("Financial authorization scope already active");
  trustedPaidDocuments.add(order);
  try { return await callback(); }
  finally { trustedPaidDocuments.delete(order); }
}
function consumeStripePaidAuthorization(order) { const allowed = trustedPaidDocuments.has(order); trustedPaidDocuments.delete(order); return allowed; }
function fulfillmentBlocked(order) {
  return order.inventoryReservation?.needsReconciliation === true || order.inventoryReservation?.state === "reconciliation_required" || order.payoutBlocked === true;
}
function assertFulfillmentAllowed(order, target) {
  if (["procesando", "enviado", "entregado"].includes(target) && fulfillmentBlocked(order)) {
    throw Object.assign(new Error("Fulfillment bloqueado: orden pendiente de conciliación financiera/inventario"), { statusCode: 409, publicCode: "FULFILLMENT_RECONCILIATION" });
  }
}
function assertStripeCorrelation(order, proof) {
  const conflict = () => { throw Object.assign(new Error("Evento Stripe no corresponde a la orden"), { statusCode: 409, publicCode: "STRIPE_CORRELATION_MISMATCH" }); };
  if (!proof || String(proof.orderId) !== String(order._id) || (!proof.paymentIntentId && !proof.sessionId)) conflict();
  if (proof.sessionId && order.stripeSessionId && proof.sessionId !== order.stripeSessionId) conflict();
  if (order.stripePaymentIntentId && proof.paymentIntentId !== order.stripePaymentIntentId) conflict();
  const token = order.checkoutIntent?.stripeCorrelation;
  if (!token || proof.correlation !== token || proof.uid !== order.firebaseUserId) conflict();
  if (!Number.isSafeInteger(proof.amount) || proof.amount !== Math.round(order.total * 100) || String(proof.currency).toLowerCase() !== String(order.moneda).toLowerCase()) conflict();
}
function hasExactLegacyBinding(order, proof) {
  if (!order || !proof) return false;
  if (order.stripePaymentIntentId && proof.paymentIntentId && order.stripePaymentIntentId !== proof.paymentIntentId) return false;
  if (proof.eventType?.startsWith("checkout.session.")) return !!order.stripeSessionId && order.stripeSessionId === proof.sessionId;
  return !!order.stripePaymentIntentId && order.stripePaymentIntentId === proof.paymentIntentId;
}
function assertFinancialEventBinding(order, proof) {
  if (order.checkoutIntent?.keyHash) {
    if (!order.checkoutIntent.stripeCorrelation) throw Object.assign(new Error("Intención sin correlación requiere revisión manual"), { publicCode: "FINANCIAL_REVIEW_REQUIRED" });
    return assertStripeCorrelation(order, proof);
  }
  if (!hasExactLegacyBinding(order, proof)) throw Object.assign(new Error("Evento histórico requiere vinculación Stripe exacta y revisión manual"), { publicCode: "FINANCIAL_REVIEW_REQUIRED" });
  if (!Number.isSafeInteger(proof.amount) || proof.amount !== Math.round(order.total * 100) || String(proof.currency).toLowerCase() !== String(order.moneda).toLowerCase()) throw Object.assign(new Error("Importe/moneda Stripe requiere revisión manual"), { publicCode: "FINANCIAL_REVIEW_REQUIRED" });
}
module.exports = { withAuthorizedFinancialTransition, hasExactLegacyBinding, assertFinancialEventBinding, consumeStripePaidAuthorization, assertFulfillmentAllowed, assertStripeCorrelation };
