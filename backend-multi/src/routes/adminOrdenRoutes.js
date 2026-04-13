// ===========================================================
// adminOrdenRoutes.js — Admin Ordenes (ENTERPRISE HARDENED)
// ===========================================================

"use strict";

const express = require("express");
const { param, body, query, validationResult } = require("express-validator");

const router = express.Router();

const { proteger, soloAdmin } = require("../middleware/auth");

const {
  adminListarOrdenes,
  adminObtenerOrden,
  adminActualizarFulfillment,
  adminActualizarPago,
  adminMetrics,
} = require("../controllers/adminOrdenController");

// ===========================================================
// Helpers
// ===========================================================
function validateRequest(req, res, next) {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return next();
  }

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

// ===========================================================
// VALIDACIONES
// ===========================================================
const validarId = [
  param("id").isMongoId().withMessage("ID inválido"),
];

const validarListado = [
  query("page").optional().isInt({ min: 1 }).withMessage("page inválido"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit inválido"),
  query("estadoPago").optional().isString(),
  query("estadoFulfillment").optional().isString(),
  query("sort").optional().isString(),
  query("q").optional().isString(),
  query("minTotal").optional().isFloat({ min: 0 }).withMessage("minTotal inválido"),
  query("maxTotal").optional().isFloat({ min: 0 }).withMessage("maxTotal inválido"),
  query("from").optional().isISO8601().withMessage("from inválido"),
  query("to").optional().isISO8601().withMessage("to inválido"),
];

const validarFulfillment = [
  ...validarId,
  body("estadoFulfillment")
    .notEmpty()
    .withMessage("estadoFulfillment es obligatorio")
    .isIn(["pendiente", "procesando", "enviado", "entregado", "cancelado"])
    .withMessage("estadoFulfillment inválido"),
];

const validarPago = [
  ...validarId,
  body("estadoPago")
    .notEmpty()
    .withMessage("estadoPago es obligatorio")
    .isIn([
      "pendiente",
      "pagado",
      "fallido",
      "reembolsado",
      "reembolsado_parcial",
    ])
    .withMessage("estadoPago inválido"),
];

// ===========================================================
// ROUTES
// ===========================================================

// GET /api/ordenes/admin/metrics
router.get(
  "/metrics",
  proteger,
  soloAdmin,
  adminMetrics
);

// GET /api/ordenes/admin/ordenes
router.get(
  "/ordenes",
  proteger,
  soloAdmin,
  validarListado,
  validateRequest,
  adminListarOrdenes
);

// GET /api/ordenes/admin/ordenes/:id
router.get(
  "/ordenes/:id",
  proteger,
  soloAdmin,
  validarId,
  validateRequest,
  adminObtenerOrden
);

// PUT /api/ordenes/admin/ordenes/:id/fulfillment
router.put(
  "/ordenes/:id/fulfillment",
  proteger,
  soloAdmin,
  validarFulfillment,
  validateRequest,
  adminActualizarFulfillment
);

// PUT /api/ordenes/admin/ordenes/:id/pago
router.put(
  "/ordenes/:id/pago",
  proteger,
  soloAdmin,
  validarPago,
  validateRequest,
  adminActualizarPago
);

// ===========================================================
module.exports = router;