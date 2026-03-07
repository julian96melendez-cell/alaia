// ======================================================
// stripeWebhook.js — Stripe Webhook ENTERPRISE (FINAL)
// ======================================================
//
// ✔ Verifica firma de Stripe
// ✔ Procesa pagos exitosos / fallidos
// ✔ Actualiza Orden correctamente
// ✔ Seguro, idempotente y robusto
//
// ======================================================

const express = require("express");
const router = express.Router();

const Orden = require("../models/Orden");
const {
  construirEventoDesdeWebhook,
  extraerOrdenId,
  resumirEventoStripe,
} = require("../payments/stripeService");

// ⚠️ Stripe requiere RAW body para validar firma
router.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];

    let event;

    // =========================
    // 1️⃣ Verificar firma Stripe
    // =========================
    try {
      event = construirEventoDesdeWebhook(signature, req.body);
    } catch (err) {
      console.error("❌ Webhook signature inválida:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Log seguro (opcional)
    const resumen = resumirEventoStripe(event);
    console.log("📩 Stripe Webhook recibido:", resumen);

    // =========================
    // 2️⃣ Procesar eventos
    // =========================
    try {
      switch (event.type) {
        // ----------------------------------
        // ✅ PAGO COMPLETADO
        // ----------------------------------
        case "checkout.session.completed": {
          const session = event.data.object;
          const ordenId = extraerOrdenId(session);

          if (!ordenId) break;

          const orden = await Orden.findById(ordenId);
          if (!orden) break;

          // Evitar doble procesamiento
          if (orden.estadoPago === "pagado") break;

          orden.estadoPago = "pagado";
          orden.estadoFulfillment = "procesando";
          orden.stripeSessionId = session.id;

          if (Array.isArray(orden.historial)) {
            orden.historial.push({
              estado: "pago_pagado",
              fecha: new Date(),
            });
          }

          await orden.save();
          break;
        }

        // ----------------------------------
        // ❌ PAGO FALLIDO
        // ----------------------------------
        case "checkout.session.expired":
        case "payment_intent.payment_failed": {
          const obj = event.data.object;
          const ordenId = extraerOrdenId(obj);

          if (!ordenId) break;

          const orden = await Orden.findById(ordenId);
          if (!orden) break;

          if (orden.estadoPago === "pagado") break;

          orden.estadoPago = "fallido";

          if (Array.isArray(orden.historial)) {
            orden.historial.push({
              estado: "pago_fallido",
              fecha: new Date(),
            });
          }

          await orden.save();
          break;
        }

        // ----------------------------------
        // Otros eventos (ignorados)
        // ----------------------------------
        default:
          break;
      }

      // Stripe requiere respuesta 200
      res.json({ received: true });
    } catch (err) {
      console.error("❌ Error procesando webhook:", err);
      res.status(500).json({ error: "Webhook handler failed" });
    }
  }
);

module.exports = router;