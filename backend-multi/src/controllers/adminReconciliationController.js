"use strict";
const { getReconciliationReviewService } = require("../services/reconciliationReviewService");
const { fail } = require("../services/reconciliationContracts");
const { createReconciliationReadRuntime } = require("../services/reconciliationReadRuntime");
const publicErrors = new Set(["REVIEW_INVALID_INPUT", "REVIEW_INVALID_REFERENCE", "REVIEW_INVALID_PAGINATION", "REVIEW_INVALID_FILTER", "REVIEW_INVALID_VERSION", "REVIEW_INVALID_CONCLUSION", "REVIEW_INVALID_IDEMPOTENCY_KEY", "REVIEW_INVALID_EVIDENCE", "REVIEW_FORBIDDEN", "REVIEW_NOT_FOUND", "REVIEW_IDEMPOTENCY_CONFLICT", "REVIEW_REFERENCE_CONFLICT", "REVIEW_SOURCE_NOT_PENDING", "REVIEW_STALE_VERSION"]);
const { getAllowedOrigins } = require("../config/cors");
function requireReviewOrigin(req, res, next) {
  // CORS alone permits origin-less requests. Review writes explicitly do not.
  const origin = req.headers.origin;
  if (typeof origin !== "string" || !getAllowedOrigins().has(origin)) return res.status(403).json({ ok: false, code: "REVIEW_ORIGIN_FORBIDDEN" });
  if (typeof req.headers["content-type"] !== "string" || !/^application\/json(?:\s*;.*)?$/i.test(req.headers["content-type"])) return res.status(415).json({ ok: false, code: "REVIEW_JSON_REQUIRED" });
  return next();
}
function createAdminReconciliationController(serviceProvider = getReconciliationReviewService, reads = createReconciliationReadRuntime()) {
  const handle = (fn, read = false) => async (req, res) => {
    // Defense in depth; actor never comes from the request body.
    if (!req.usuario) return res.status(401).json({ ok: false, code: "REVIEW_UNAUTHENTICATED" });
    if (req.usuario.rol !== "admin") return res.status(403).json({ ok: false, code: "REVIEW_FORBIDDEN" });
    if (read && (req.aborted || res.destroyed || res.closed || res.writableEnded)) return;
    res.setHeader("Cache-Control", "no-store");
    try {
      const data = read ? await reads.run(req, res, budget => fn(serviceProvider(), req, budget)) : await fn(serviceProvider(), req);
      if (!(read && (req.aborted || res.closed)) && !res.destroyed && !res.writableEnded && !res.headersSent) return res.json({ ok: true, data });
    }
    catch (error) {
      if ((read && (req.aborted || res.closed)) || res.destroyed || res.writableEnded || res.headersSent) return;
      if (read && (error.publicCode === "REVIEW_READ_TIMEOUT" || error.code === 50 || error.codeName === "MaxTimeMSExpired")) {
        return res.status(504).json({ ok: false, code: "REVIEW_READ_TIMEOUT", financialActionsAllowed: false });
      }
      if (read && error.publicCode === "REVIEW_READ_BUSY") {
        res.setHeader("Retry-After", "1");
        return res.status(503).json({ ok: false, code: "REVIEW_READ_BUSY", financialActionsAllowed: false });
      }
      const known = publicErrors.has(error.publicCode) && [400, 403, 404, 409].includes(error.statusCode);
      return res.status(known ? error.statusCode : 503).json({ ok: false, code: known ? error.publicCode : "REVIEW_UNAVAILABLE", financialActionsAllowed: false });
    }
  };
  return {
    list: handle((service, req, budget) => service.list(req.query, budget), true),
    detail: handle((service, req, budget) => service.detail(req.params.caseKey, req.query, budget), true),
    review: handle((service, req) => {
      if (Object.keys(req.query || {}).length) throw fail("REVIEW_INVALID_INPUT");
      return service.review(req.params.caseKey, req.body, req.headers["idempotency-key"], String(req.usuario._id || req.usuario.id));
    }),
  };
}
module.exports = { createAdminReconciliationController, requireReviewOrigin };
