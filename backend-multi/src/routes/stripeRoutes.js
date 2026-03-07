// ======================================================
// stripeRoutes.js — PRODUCCIÓN ENTERPRISE (ULTRA SAFE)
// ======================================================
// ✅ RAW body para Stripe
// ✅ Límite de tamaño
// ✅ Validación header stripe-signature
// ✅ No pasa por express.json()
// ======================================================

"use strict";

const express = require("express");
const router = express.Router();

// Controller principal
const { procesarWebhookStripe } = require("../payments/stripeWebhookController");

// ------------------------------------------------------
// Middleware: Validar stripe-signature
// ------------------------------------------------------
function validarStripeSignatureHeader(req, res, next) {
  const signature = req.headers["stripe-signature"];

  if (!signature) {
    return res.status(400).json({
      ok: false,
      message: "Missing stripe-signature header",
    });
  }

  next();
}

// ------------------------------------------------------
// Webhook Stripe (RAW body obligatorio)
// ------------------------------------------------------
router.post(
  "/webhook",
  express.raw({
    type: "application/json",
    limit: "1mb", // evita payload abuse
  }),
  validarStripeSignatureHeader,
  procesarWebhookStripe
);

module.exports = router;