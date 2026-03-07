// ======================================================
// WebhookEvent.js — Idempotencia y auditoría de webhooks
// ENTERPRISE FINAL (PRODUCCIÓN REAL)
// ======================================================
//
// ✔ Idempotencia por eventId (unique)
// ✔ Auditoría segura (sin datos sensibles)
// ✔ Compatible con Stripe Webhook Controller ENTERPRISE
// ✔ Preparado para debugging, métricas y soporte
//
// ======================================================

const mongoose = require('mongoose');

const WebhookEventSchema = new mongoose.Schema(
  {
    // Proveedor del webhook (futuro: paypal, mercadopago, etc.)
    provider: {
      type: String,
      enum: ['stripe'],
      default: 'stripe',
      index: true,
    },

    // ID único del evento (Stripe event.id)
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Tipo de evento Stripe (checkout.session.completed, etc.)
    eventType: {
      type: String,
      required: true,
      index: true,
    },

    // Orden relacionada (si existe)
    ordenId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Orden',
      default: null,
      index: true,
    },

    // Estado del procesamiento del webhook
    status: {
      type: String,
      enum: ['received', 'processed', 'skipped', 'failed'],
      default: 'received',
      index: true,
    },

    // Mensaje de error si falló
    errorMessage: {
      type: String,
      default: '',
    },

    // ==================================================
    // Resumen seguro del evento (NO datos sensibles)
    // Compatible con resumirEventoStripe()
    // ==================================================
    summary: {
      eventId: { type: String, default: '' },
      eventType: { type: String, default: '' },

      objectType: { type: String, default: '' },

      sessionId: { type: String, default: '' },
      paymentIntent: { type: String, default: '' },

      amountTotal: { type: Number, default: 0 },
      currency: { type: String, default: '' },

      ordenId: { type: String, default: '' },

      livemode: { type: Boolean, default: false },
    },

    // ==================================================
    // Datos adicionales no sensibles (opcional)
    // Útil para debugging sin guardar el body completo
    // ==================================================
    raw: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// ======================================================
// Indexes PRO (consultas rápidas)
// ======================================================
WebhookEventSchema.index({ createdAt: -1 });
WebhookEventSchema.index({ provider: 1, eventType: 1 });
WebhookEventSchema.index({ ordenId: 1, createdAt: -1 });

// ======================================================
module.exports = mongoose.model('WebhookEvent', WebhookEventSchema);