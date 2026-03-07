const mongoose = require("mongoose");

const WebhookEventSchema = new mongoose.Schema(
  {
    // stripe | paypal | etc
    provider: {
      type: String,
      required: true,
      index: true,
    },

    // event.id de Stripe
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // checkout.session.completed, etc
    eventType: {
      type: String,
      required: true,
      index: true,
    },

    // relación con orden
    ordenId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Orden",
      index: true,
      default: null,
    },

    // received | processed | failed | skipped
    status: {
      type: String,
      enum: ["received", "processed", "failed", "skipped"],
      default: "received",
      index: true,
    },

    // errores si falló
    errorMessage: {
      type: String,
      default: "",
    },

    // resumen del evento
    summary: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    processedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Índices pro
WebhookEventSchema.index({ provider: 1, createdAt: -1 });
WebhookEventSchema.index({ ordenId: 1, createdAt: -1 });

module.exports = mongoose.model("WebhookEvent", WebhookEventSchema);