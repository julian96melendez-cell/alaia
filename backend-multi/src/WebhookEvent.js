const mongoose = require("mongoose");

const WebhookEventSchema = new mongoose.Schema(
  {
    // stripe | paypal | etc
    provider: {
      type: String,
      required: true,
      index: true,
      trim: true,
      lowercase: true,
    },

    // event.id del provider
    eventId: {
      type: String,
      required: true,
      trim: true,
    },

    // checkout.session.completed, etc
    eventType: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    // relación con orden
    ordenId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Orden",
      index: true,
      default: null,
    },

    // request trace id
    reqId: {
      type: String,
      default: "",
      index: true,
      trim: true,
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
      trim: true,
      maxlength: 1000,
    },

    // resumen del evento
    summary: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },

    processedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Unicidad real por provider + eventId
WebhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

// Índices operativos
WebhookEventSchema.index({ provider: 1, createdAt: -1 });
WebhookEventSchema.index({ ordenId: 1, createdAt: -1 });
WebhookEventSchema.index({ status: 1, createdAt: -1 });
WebhookEventSchema.index({ eventType: 1, createdAt: -1 });

module.exports = mongoose.model("WebhookEvent", WebhookEventSchema);