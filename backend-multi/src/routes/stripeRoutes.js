"use strict";

const express = require("express");
const router = express.Router();

const {
  procesarWebhookStripe,
} = require("../payments/stripeWebhookController");

// ======================================================
// VALIDACIÓN REQUEST WEBHOOK
// ======================================================
function validarStripeWebhookRequest(req, res, next) {
  const signature = req.headers["stripe-signature"];
  const contentType = (req.headers["content-type"] || "").toLowerCase();

  if (!signature || typeof signature !== "string" || !signature.trim()) {
    console.warn("⚠️ Webhook rechazado: missing stripe-signature", {
      reqId: req.reqId,
      ip: req.ip,
    });

    return res.status(400).json({
      ok: false,
      message: "Missing stripe-signature header",
      reqId: req.reqId,
    });
  }

  if (!contentType.startsWith("application/json")) {
    console.warn("⚠️ Webhook rechazado: invalid content-type", {
      reqId: req.reqId,
      contentType,
    });

    return res.status(415).json({
      ok: false,
      message: "Unsupported content-type",
      reqId: req.reqId,
    });
  }

  if (!Buffer.isBuffer(req.body)) {
    console.error("❌ Webhook mal configurado (NO RAW BODY)", {
      reqId: req.reqId,
      bodyType: typeof req.body,
    });

    return res.status(400).json({
      ok: false,
      message: "Invalid raw body for Stripe webhook",
      reqId: req.reqId,
    });
  }

  if (req.body.length > 1024 * 1024) {
    console.warn("⚠️ Webhook demasiado grande", {
      reqId: req.reqId,
      size: req.body.length,
    });

    return res.status(413).json({
      ok: false,
      message: "Payload too large",
      reqId: req.reqId,
    });
  }

  next();
}

// ======================================================
// WEBHOOK ROUTE
// ======================================================
// IMPORTANTE:
// - server.js ya usa express.raw()
// - NO usar express.json aquí
// ======================================================
router.post("/webhook", validarStripeWebhookRequest, async (req, res) => {
  const start = Date.now();

  try {
    await procesarWebhookStripe(req, res);

    console.log("✅ Stripe webhook processed", {
      reqId: req.reqId,
      durationMs: Date.now() - start,
    });
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