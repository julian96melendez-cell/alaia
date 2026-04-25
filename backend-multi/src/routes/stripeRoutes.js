"use strict";
console.log("✅ stripeRoutes cargado con /checkout");
const express = require("express");
const router = express.Router();

const { proteger } = require("../middleware/auth");

const {
  procesarWebhookStripe,
} = require("../payments/stripeWebhookController");

const {
  crearOrdenYCheckoutStripe,
} = require("../controllers/ordenController");

function validarStripeWebhookRequest(req, res, next) {
  const signature = req.headers["stripe-signature"];
  const contentType = (req.headers["content-type"] || "").toLowerCase();

  if (!signature || typeof signature !== "string" || !signature.trim()) {
    return res.status(400).json({
      ok: false,
      message: "Missing stripe-signature header",
      reqId: req.reqId,
    });
  }

  if (!contentType.startsWith("application/json")) {
    return res.status(415).json({
      ok: false,
      message: "Unsupported content-type",
      reqId: req.reqId,
    });
  }

  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).json({
      ok: false,
      message: "Invalid raw body for Stripe webhook",
      reqId: req.reqId,
    });
  }

  next();
}

// Checkout desde frontend:
// POST /api/stripe/checkout
router.post("/checkout", crearOrdenYCheckoutStripe);

// Webhook Stripe:
// POST /api/stripe/webhook
router.post("/webhook", validarStripeWebhookRequest, async (req, res) => {
  try {
    await procesarWebhookStripe(req, res);
  } catch (err) {
    console.error("❌ Error en webhook Stripe", {
      reqId: req.reqId,
      message: err?.message,
    });

    return res.status(200).json({
      ok: false,
      message: "Webhook error handled safely",
      reqId: req.reqId,
    });
  }
});

module.exports = router;