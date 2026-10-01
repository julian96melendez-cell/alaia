"use strict";
// Query updates bypass document transition hooks. No financial query bypass exists.
const protectedRoots = new Set([
  "estadoPago", "payoutBlocked", "payoutBlockedReason", "checkoutIntent", "inventoryReservation", "paidAt", "failedAt", "refundedAt",
  "stripePaymentIntentId", "stripeSessionId", "stripeCustomerId", "stripeAmountTotal", "stripeAmountReceived", "stripeRefundAmount",
  "firebaseUserId", "usuario", "source", "paymentProvider", "metodoPago", "totalCostoProveedor", "gananciaTotal", "comisionTotal", "ingresoVendedorTotal", "totalComisiones", "totalNetoVendedores", "vendedorPayouts", "proveedores", "payoutPolicy", "payoutHoldDays", "payoutEligibleAt", "payoutReleasedAt", "total", "subtotal", "tax", "shipping", "discount", "moneda", "items",
]);
const blocked = () => Object.assign(new Error("Los cambios financieros requieren el coordinador financiero; query update bloqueado"), { statusCode: 409, publicCode: "FINANCIAL_QUERY_FORBIDDEN" });
const protectedPath = path => protectedRoots.has(String(path).split(".")[0]);
function assertSafeQueryUpdate(update, options = {}) {
  if (Array.isArray(update) || options.overwrite || options.upsert) throw blocked();
  if (!update || typeof update !== "object") return;
  for (const [operator, value] of Object.entries(update)) {
    if (!operator.startsWith("$")) { if (protectedPath(operator)) throw blocked(); continue; }
    if (!value || typeof value !== "object") throw blocked();
    for (const [path, destination] of Object.entries(value)) {
      if (protectedPath(path) || (operator === "$rename" && protectedPath(destination))) throw blocked();
    }
  }
}
function assertSafeBulk(operations) {
  for (const op of operations) {
    if (op.insertOne || op.replaceOne) throw blocked(); // bypasses lifecycle creation/document hooks
    for (const kind of ["updateOne", "updateMany"]) if (op[kind]) assertSafeQueryUpdate(op[kind].update, op[kind]);
  }
}
function installFinancialQueryGuard(schema) {
  schema.pre(["updateOne", "updateMany", "findOneAndUpdate"], function () { assertSafeQueryUpdate(this.getUpdate(), this.getOptions()); });
  schema.pre(["replaceOne", "findOneAndReplace"], function () { throw blocked(); });
}
module.exports = { assertSafeQueryUpdate, assertSafeBulk, installFinancialQueryGuard };
