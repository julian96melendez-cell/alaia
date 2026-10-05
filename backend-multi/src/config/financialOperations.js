"use strict";
// No test-mode bypass. Only the exact explicit value enables financial operations.
function financialOperationsEnabled(env = process.env) {
  return env.ALAIA_FINANCIAL_OPERATIONS_ENABLED === "true";
}
function assertFinancialOperationsEnabled() {
  if (!financialOperationsEnabled()) throw Object.assign(new Error("Financial operations unavailable"), { statusCode: 503, code: "FINANCIAL_OPERATIONS_DISABLED", publicCode: "FINANCIAL_OPERATIONS_DISABLED" });
}
function requireFinancialOperations(req, res, next) {
  if (financialOperationsEnabled()) return next();
  return res.status(503).json({ ok: false, code: "FINANCIAL_OPERATIONS_DISABLED" });
}
function financialWriteGuard(req, res, next) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  const path = req.path;
  const review = /^\/api\/ordenes\/admin\/reconciliation\/[^/]+\/reviews\/?$/i.test(path);
  const sensitive = /^\/api\/(?:stripe|payments|ordenes|admin\/payouts|vendedor)(?:\/|$)/i.test(path);
  return sensitive && !review ? requireFinancialOperations(req, res, next) : next();
}
module.exports = { financialOperationsEnabled, assertFinancialOperationsEnabled, requireFinancialOperations, financialWriteGuard };
