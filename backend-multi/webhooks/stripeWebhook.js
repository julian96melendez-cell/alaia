// ======================================================
// stripeWebhook.js — Stripe Webhook ENTERPRISE (HARDENED)
// ======================================================

const express = require("express");
const router = express.Router();

const Orden = require("../models/Orden");
const StripeWebhookEvent = require("../models/StripeWebhookEvent"); // crear modelo
const {
  construirEventoDesdeWebhook,
  extraerOrdenId,
  resumirEventoStripe,
} = require("../payments/stripeService");

router.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];

    let event;

    try {
      event = construirEventoDesdeWebhook(signature, req.body);
    } catch (err) {
      console.error("❌ Webhook signature inválida:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const resumen = resumirEventoStripe(event);
    console.log("📩 Stripe Webhook recibido:", resumen);

    try {
      // ==================================
      // Idempotencia real por event.id
      // ==================================
      const existingEvent = await StripeWebhookEvent.findOne({
        stripeEventId: event.id,
      });

      if (existingEvent) {
        console.log("ℹ️ Evento Stripe ya procesado:", event.id);
        return res.json({ received: true, duplicate: true });
      }

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          const ordenId = extraerOrdenId(session);

          if (!ordenId) {
            console.warn("⚠️ checkout.session.completed sin ordenId");
            break;
          }

          const orden = await Orden.findById(ordenId);

          if (!orden) {
            console.warn("⚠️ Orden no encontrada para webhook:", ordenId);
            break;
          }

          if (orden.estadoPago === "pagado") {
            console.log("ℹ️ Orden ya pagada, se ignora:", ordenId);
            break;
          }

          orden.estadoPago = "pagado";
          orden.estadoFulfillment = "procesando";
          orden.stripeSessionId = session.id;
          orden.stripePaymentIntentId = session.payment_intent || null;
          orden.moneda = session.currency || orden.moneda || null;
          orden.totalPagado = session.amount_total
            ? session.amount_total / 100
            : orden.totalPagado || null;

          if (Array.isArray(orden.historial)) {
            orden.historial.push({
              estado: "pago_pagado",
              fecha: new Date(),
              meta: {
                stripeEventId: event.id,
                stripeSessionId: session.id,
                paymentIntentId: session.payment_intent || null,
              },
            });
          }

          await orden.save();
          break;
        }

        case "checkout.session.expired":
        case "payment_intent.payment_failed": {
          const obj = event.data.object;
          const ordenId = extraerOrdenId(obj);

          if (!ordenId) {
            console.warn("⚠️ Evento de fallo sin ordenId:", event.type);
            break;
          }

          const orden = await Orden.findById(ordenId);

          if (!orden) {
            console.warn("⚠️ Orden no encontrada para webhook:", ordenId);
            break;
          }

          if (orden.estadoPago === "pagado") {
            console.log(
              "ℹ️ Orden ya pagada; no se marca fallida:",
              ordenId
            );
            break;
          }

          orden.estadoPago = "fallido";

          if (Array.isArray(orden.historial)) {
            orden.historial.push({
              estado: "pago_fallido",
              fecha: new Date(),
              meta: {
                stripeEventId: event.id,
                stripeObjectId: obj.id || null,
                eventType: event.type,
              },
            });
          }

          await orden.save();
          break;
        }

        default:
          console.log("ℹ️ Evento Stripe ignorado:", event.type);
          break;
      }

      await StripeWebhookEvent.create({
        stripeEventId: event.id,
        eventType: event.type,
        processedAt: new Date(),
      });

      return res.json({ received: true });
    } catch (err) {
      console.error("❌ Error procesando webhook:", err);
      return res.status(500).json({ error: "Webhook handler failed" });
    }
  }
);

module.exports = router;