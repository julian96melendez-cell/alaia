"use strict";

const express = require("express");
const { validationResult } = require("express-validator");

const router = express.Router();

const { proteger, soloVendedor } = require("../middleware/auth");

const {
  getSellerDashboard,
} = require("../controllers/sellerController");

// ======================================================
// Helper validación estándar
// ======================================================
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

// ======================================================
// ROUTES SELLER
// ======================================================

// ======================================================
// GET /api/seller/dashboard
// Dashboard principal del vendedor
// ======================================================
router.get(
  "/dashboard",
  proteger,
  soloVendedor,
  getSellerDashboard
);

// ======================================================
// (PREPARADO PARA ESCALAR)
// ======================================================

// Ejemplo próximos endpoints:

// router.get(
//   "/productos",
//   proteger,
//   soloVendedor,
//   validateRequest,
//   getSellerProductos
// );

// router.get(
//   "/ordenes",
//   proteger,
//   soloVendedor,
//   validateRequest,
//   getSellerOrdenes
// );

// router.get(
//   "/payouts",
//   proteger,
//   soloVendedor,
//   validateRequest,
//   getSellerPayouts
// );

// ======================================================
module.exports = router;