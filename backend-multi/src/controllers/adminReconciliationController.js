"use strict";
const { getReconciliationReviewService } = require("../services/reconciliationReviewService");
const { fail } = require("../services/reconciliationContracts");
const publicErrors = new Set(["REVIEW_INVALID_INPUT", "REVIEW_INVALID_REFERENCE", "REVIEW_INVALID_PAGINATION", "REVIEW_INVALID_FILTER", "REVIEW_INVALID_VERSION", "REVIEW_INVALID_CONCLUSION", "REVIEW_INVALID_IDEMPOTENCY_KEY", "REVIEW_INVALID_EVIDENCE", "REVIEW_FORBIDDEN", "REVIEW_NOT_FOUND", "REVIEW_IDEMPOTENCY_CONFLICT", "REVIEW_REFERENCE_CONFLICT", "REVIEW_SOURCE_NOT_PENDING", "REVIEW_STALE_VERSION"]);
const { getAllowedOrigins } = require("../config/cors");
function requireReviewOrigin(req, res, next) {
  // CORS alone permits origin-less requests. Review writes explicitly do not.
  const origin = req.headers.origin;
  if (typeof origin !== "string" || !getAllowedOrigins().has(origin)) return res.status(403).json({ ok: false, code: "REVIEW_ORIGIN_FORBIDDEN" });
  if (typeof req.headers["content-type"] !== "string" || !/^application\/json(?:\s*;.*)?$/i.test(req.headers["content-type"])) return res.status(415).json({ ok: false, code: "REVIEW_JSON_REQUIRED" });
  return next();
}
function createAdminReconciliationController(serviceProvider = getReconciliationReviewService) {
  const handle = fn => async (req, res) => {
    // Defense in depth; actor never comes from the request body.
    if (!req.usuario) return res.status(401).json({ ok: false, code: "REVIEW_UNAUTHENTICATED" });
    if (req.usuario.rol !== "admin") return res.status(403).json({ ok: false, code: "REVIEW_FORBIDDEN" });
    res.setHeader("Cache-Control", "no-store");
    try { return res.json({ ok: true, data: await fn(serviceProvider(), req) }); }
    catch (error) {
      const known = publicErrors.has(error.publicCode) && [400, 403, 404, 409].includes(error.statusCode);
      return res.status(known ? error.statusCode : 503).json({ ok: false, code: known ? error.publicCode : "REVIEW_UNAVAILABLE", financialActionsAllowed: false });
    }
  };
  return {
    list: handle((service, req) => service.list(req.query)),
    detail: handle((service, req) => service.detail(req.params.caseKey, req.query)),
    review: handle((service, req) => {
      if (Object.keys(req.query || {}).length) throw fail("REVIEW_INVALID_INPUT");
      return service.review(req.params.caseKey, req.body, req.headers["idempotency-key"], String(req.usuario._id || req.usuario.id));
    }),
  };
}
module.exports = { createAdminReconciliationController, requireReviewOrigin };
