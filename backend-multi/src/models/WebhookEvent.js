// ======================================================
// WebhookEvent.js — Idempotencia y auditoría de webhooks
// ENTERPRISE FINAL (PRODUCCIÓN REAL)
// ======================================================

const mongoose = require("mongoose");

const WebhookEventSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: ["stripe"],
      default: "stripe",
      required: true,
      index: true,
    },

    eventId: {
      type: String,
      required: true,
      trim: true,
    },

    eventType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    ordenId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Orden",
      default: null,
      index: true,
    },

    status: {
      type: String,
      enum: ["received", "processed", "skipped", "failed"],
      default: "received",
      required: true,
      index: true,
    },

    errorMessage: {
      type: String,
      default: "",
      maxlength: 2000,
    },

    reqId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    processedAt: {
      type: Date,
      default: null,
      index: true,
    },

    summary: {
      eventId: { type: String, default: "" },
      eventType: { type: String, default: "" },

      objectType: { type: String, default: "" },

      sessionId: { type: String, default: "" },
      paymentIntent: { type: String, default: "" },

      amountTotal: { type: Number, default: 0 },
      currency: { type: String, default: "" },

      ordenId: { type: String, default: "" },

      livemode: { type: Boolean, default: false },
    },

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

// Unicidad real por proveedor + eventId
WebhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

// Consultas rápidas
WebhookEventSchema.index({ createdAt: -1 });
WebhookEventSchema.index({ provider: 1, eventType: 1 });
WebhookEventSchema.index({ ordenId: 1, createdAt: -1 });
WebhookEventSchema.index({ status: 1, createdAt: -1 });
WebhookEventSchema.index({ reqId: 1, createdAt: -1 });
WebhookEventSchema.index({ processedAt: -1 });

module.exports = mongoose.model("WebhookEvent", WebhookEventSchema);