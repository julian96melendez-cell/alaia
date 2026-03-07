const mongoose = require("mongoose");

const NotificationLogSchema = new mongoose.Schema(
  {
    ordenId: { type: mongoose.Schema.Types.ObjectId, ref: "Orden", required: true, index: true },
    type: { type: String, required: true, index: true }, // paid|shipped|delivered|refunded|failed
    channel: { type: String, enum: ["email"], default: "email" },
    to: { type: String, default: "" },
    status: { type: String, enum: ["sent", "failed"], default: "sent", index: true },
    errorMessage: { type: String, default: "" },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, versionKey: false }
);

// ✅ Idempotencia total
NotificationLogSchema.index({ ordenId: 1, type: 1, channel: 1 }, { unique: true });

module.exports = mongoose.model("NotificationLog", NotificationLogSchema);