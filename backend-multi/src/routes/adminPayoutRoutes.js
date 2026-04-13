// ==========================================================
// adminPayoutRoutes.js — Admin Payouts Routes (ENTERPRISE)
// ==========================================================
//
// Incluye:
// ✅ Validaciones robustas
// ✅ Middleware admin
// ✅ Manejo consistente de errores
// ✅ Seguridad y estructura profesional
// ==========================================================

"use strict";

const express = require("express");
const { param, query, body, validationResult } = require("express-validator");

const router = express.Router();

const { proteger, soloAdmin } = require("../middleware/auth");

const {
  adminListarPayouts,
  adminPayoutMetrics,
  adminObtenerPayoutsDeOrden,
  adminReintentarPayout,
} = require("../controllers/adminPayoutController");

// ==========================================================
// Helper validación
// ==========================================================
function validateRequest(req, res, next) {
  const errors = validationResult(req);

  if (errors.isEmpty()) return next();

  return res.status(400).json({
    ok: false,
    message: "Error de validación",
    errors: errors.array().map((e) => ({
      field: e.path,
      message: e.msg,
    })),
    reqId: req.reqId || null,
  });
}

// ==========================================================
// VALIDACIONES
// ==========================================================

// Query listado
const validarListado = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page inválido"),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit inválido"),

  query("status")
    .optional()
    .isIn([
      "pendiente",
      "procesando",
      "pagado",
      "fallido",
      "bloqueado",
      "all",
    ])
    .withMessage("status inválido"),

  query("sort")
    .optional()
    .isString()
    .withMessage("sort inválido"),

  query("q")
    .optional()
    .isString()
    .withMessage("q inválido"),

  query("onlyEligible")
    .optional()
    .isBoolean()
    .withMessage("onlyEligible inválido"),

  query("onlyReleased")
    .optional()
    .isBoolean()
    .withMessage("onlyReleased inválido"),
];

// Param ordenId
const validarOrdenId = [
  param("ordenId")
    .isMongoId()
    .withMessage("ordenId inválido"),
];

// Retry payout
const validarRetry = [
  ...validarOrdenId,

  body("vendedorId")
    .optional()
    .isMongoId()
    .withMessage("vendedorId inválido"),
];

// ==========================================================
// ROUTES
// ==========================================================

// =======================================
// GET /api/admin/payouts
// =======================================
router.get(
  "/",
  proteger,
  soloAdmin,
  validarListado,
  validateRequest,
  adminListarPayouts
);

// =======================================
// GET /api/admin/payouts/metrics
// =======================================
router.get(
  "/metrics",
  proteger,
  soloAdmin,
  adminPayoutMetrics
);

// =======================================
// GET /api/admin/payouts/:ordenId
// =======================================
router.get(
  "/:ordenId",
  proteger,
  soloAdmin,
  validarOrdenId,
  validateRequest,
  adminObtenerPayoutsDeOrden
);

// =======================================
// POST /api/admin/payouts/:ordenId/retry
// =======================================
router.post(
  "/:ordenId/retry",
  proteger,
  soloAdmin,
  validarRetry,
  validateRequest,
  adminReintentarPayout
);

// ==========================================================
module.exports = router;