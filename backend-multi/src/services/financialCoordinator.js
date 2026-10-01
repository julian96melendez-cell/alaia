"use strict";
const { assertFinancialEventBinding, withAuthorizedFinancialTransition } = require("./orderInvariants");
const fieldsAllowed = new Set(["estadoPago", "paidAt", "failedAt", "refundedAt", "stripePaymentIntentId", "stripeSessionId", "stripeCustomerId", "stripeAmountTotal", "stripeAmountReceived", "stripeRefundAmount", "paymentProvider", "metodoPago", "stripeLatestEventId", "paymentStatusDetail"]);
function createFinancialCoordinator(repo) {
  return async function applyFinancialEvent(id, fields, proof) {
    return repo.transaction(async session => {
      const order = await repo.get(id, session);
      if (!order) throw new Error("Orden financiera no disponible");
      assertFinancialEventBinding(order, proof);
      const from = order.estadoPago, to = fields.estadoPago;
      if (to === "fallido" && from !== "pendiente") return null;
      if (to === "pagado" && ["pagado", "reembolsado", "reembolsado_parcial"].includes(from)) return null;
      if (["reembolsado", "reembolsado_parcial"].includes(to)) {
        if (from === "reembolsado") return null;
        if (!["pagado", "reembolsado_parcial"].includes(from)) throw Object.assign(new Error("Reembolso sin pago registrado requiere revisión manual"), { publicCode: "FINANCIAL_REVIEW_REQUIRED" });
      }
      if (!["pagado", "fallido", "reembolsado", "reembolsado_parcial"].includes(to)) throw new Error("Evento financiero no soportado");
      // Managed success must consume/reconcile inventory via settlePaid, never this fallback.
      if (to === "pagado" && order.checkoutIntent?.keyHash) throw new Error("Pago gestionado requiere settlePaid");
      for (const [field, value] of Object.entries(fields)) if (fieldsAllowed.has(field)) order[field] = value;
      order.$where = { estadoPago: from, ...(order.checkoutIntent?.keyHash ? { "inventoryReservation.state": order.inventoryReservation.state } : {}) };
      await withAuthorizedFinancialTransition(order, () => repo.save(order, session));
      return order;
    });
  };
}
async function applyFinancialEvent(id, fields, proof) {
  const mongoose = require("mongoose"), Orden = require("../models/Orden");
  return createFinancialCoordinator({
    transaction: async fn => { const session = await mongoose.startSession(); try { let result; await session.withTransaction(async () => { result = await fn(session); }); return result; } finally { await session.endSession(); } },
    get: (id, session) => Orden.findById(id).select("+checkoutIntent.stripeCorrelation").session(session),
    save: (order, session) => order.save({ session }),
  })(id, fields, proof);
}
module.exports = { createFinancialCoordinator, applyFinancialEvent };
