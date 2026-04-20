"use strict";

const mongoose = require("mongoose");

// ======================================================
// Helpers
// ======================================================
function safeStr(v, fallback = "") {
  if (v === null || v === undefined) return fallback;
  return String(v).trim();
}

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ======================================================
// Summary schema
// ======================================================
const WebhookEventSummarySchema = new mongoose.Schema(
  {
    eventId: { type: String, default: "", trim: true },
    eventType: { type: String, default: "", trim: true },

    objectType: { type: String, default: "", trim: true },
    objectId: { type: String, default: "", trim: true },

    sessionId: { type: String, default: "", trim: true },
    paymentIntent: { type: String, default: "", trim: true },

    amountTotal: { type: Number, default: 0 },
    amountReceived: { type: Number, default: 0 },
    currency: { type: String, default: "", trim: true },

    ordenId: { type: String, default: "", trim: true },

    livemode: { type: Boolean, default: false },
  },
  { _id: false }
);

// ======================================================
// Main schema
// ======================================================
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
      type: WebhookEventSummarySchema,
      default: () => ({}),
    },

    raw: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    minimize: false,
  }
);

// ======================================================
// Normalización
// ======================================================
WebhookEventSchema.pre("validate", function (next) {
  this.provider = safeStr(this.provider, "stripe").toLowerCase() || "stripe";
  this.eventId = safeStr(this.eventId);
  this.eventType = safeStr(this.eventType);
  this.status = safeStr(this.status, "received").toLowerCase() || "received";
  this.errorMessage = safeStr(this.errorMessage).slice(0, 2000);
  this.reqId = safeStr(this.reqId);

  if (!this.summary || typeof this.summary !== "object") {
    this.summary = {};
  }

  this.summary.eventId = safeStr(this.summary.eventId);
  this.summary.eventType = safeStr(this.summary.eventType);
  this.summary.objectType = safeStr(this.summary.objectType);
  this.summary.objectId = safeStr(this.summary.objectId);
  this.summary.sessionId = safeStr(this.summary.sessionId);
  this.summary.paymentIntent = safeStr(this.summary.paymentIntent);
  this.summary.amountTotal = safeNum(this.summary.amountTotal, 0);
  this.summary.amountReceived = safeNum(this.summary.amountReceived, 0);
  this.summary.currency = safeStr(this.summary.currency).toLowerCase();
  this.summary.ordenId = safeStr(this.summary.ordenId);
  this.summary.livemode = !!this.summary.livemode;

  next();
});

// ======================================================
// Índices
// ======================================================
WebhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

WebhookEventSchema.index({ createdAt: -1 });
WebhookEventSchema.index({ provider: 1, eventType: 1, createdAt: -1 });
WebhookEventSchema.index({ ordenId: 1, createdAt: -1 });
WebhookEventSchema.index({ status: 1, createdAt: -1 });
WebhookEventSchema.index({ reqId: 1, createdAt: -1 });
WebhookEventSchema.index({ processedAt: -1 });

// ======================================================
// Export
// ======================================================
module.exports = mongoose.model("WebhookEvent", WebhookEventSchema);