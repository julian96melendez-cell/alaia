"use strict";
const mongoose = require("mongoose");
const { statuses, parseKey } = require("../services/reconciliationContracts");
const schema = new mongoose.Schema({
  caseKey: { type: String, required: true, immutable: true },
  sourceKind: { type: String, enum: ["order", "event"], required: true, immutable: true },
  sourceId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  status: { type: String, enum: statuses, default: "open", required: true },
  version: { type: Number, required: true, min: 1 },
  lastAuditId: { type: mongoose.Schema.Types.ObjectId, ref: "ReconciliationAudit", required: true },
}, { timestamps: true, versionKey: false, strict: "throw", autoCreate: false, autoIndex: false });
schema.pre("validate", function () {
  const reference = parseKey(this.caseKey);
  if (String(this._id) !== reference.caseId || this.sourceKind !== reference.kind || String(this.sourceId) !== reference.id || !Number.isSafeInteger(this.version)) throw new Error("Invalid administrative case identity/version");
});
// Correctness relies on deterministic _id's built-in uniqueness, not new indexes.
schema.index({ caseKey: 1 });
schema.index({ status: 1, createdAt: 1 });
module.exports = mongoose.model("ReconciliationCase", schema);
