// =======================================================
// paymentsWebhookRoutes.js — Stripe Webhook (ENTERPRISE PROD)
// =======================================================
//
// Se monta en server.js como:
// app.use('/api/pagos/stripe', paymentsWebhookRoutes)
//
// Endpoint final:
// POST /api/pagos/stripe/webhook
//
// =======================================================

const express = require("express");
const router = express.Router();

const { procesarWebhookStripe } = require("../payments/stripeWebhookController");

// =======================================================
// STRIPE WEBHOOK
// =======================================================
// ⚠️ Stripe exige RAW BODY para verificar firma
// ⚠️ NO usar express.json aquí
// =======================================================
router.post(
  "/webhook",
  express.raw({ type: "application/json", limit: "2mb" }),
  (req, res, next) => {
    try {
      const signature = req.headers["stripe-signature"];

      if (!signature) {
        console.error("❌ [StripeWebhook] Missing stripe-signature header");
        return res.status(400).send("Missing stripe-signature header");
      }

      next();
    } catch (err) {
      console.error("❌ [StripeWebhook] Middleware error:", err.message);
      return res.status(500).json({
        ok: false,
        message: "Stripe webhook middleware error",
      });
    }
  },
  procesarWebhookStripe
);

module.exports = router;