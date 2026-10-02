"use strict";
const mongoose = require("mongoose");
const { statuses, conclusions, validateReview, hash } = require("../services/reconciliationContracts");
const snapshotSchema = new mongoose.Schema({
  missing: { type: Boolean, required: true },
  operationalPending: { type: Boolean, required: true },
  createdAt: Date, updatedAt: Date, managed: Boolean,
  paymentState: { type: String, enum: ["pendiente", "pagado", "fallido", "reembolsado", "reembolsado_parcial", "unknown"] },
  fulfillmentState: { type: String, enum: ["pendiente", "procesando", "enviado", "entregado", "cancelado", "unknown"] },
  reservationState: { type: String, enum: ["none", "reserved", "consumed", "released", "reconciliation_required", "unknown"] },
  needsReconciliation: Boolean, payoutBlocked: Boolean,
  total: Number, currency: { type: String, match: /^[a-z]{3}$/ },
  status: { type: String, enum: ["received", "processed", "skipped", "failed", "unknown"] },
  eventId: { type: String, match: /^evt_[A-Za-z0-9]{1,120}$/ },
}, { _id: false, strict: "throw" });
const schema = new mongoose.Schema({
  caseId: { type: mongoose.Schema.Types.ObjectId, ref: "ReconciliationCase", required: true, immutable: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true, immutable: true },
  requestHash: { type: String, match: /^[a-f0-9]{64}$/, required: true, immutable: true, select: false },
  operationHash: { type: String, match: /^[a-f0-9]{64}$/, required: true, immutable: true, select: false },
  resultVersion: { type: Number, min: 1, required: true, immutable: true },
  status: { type: String, enum: statuses, required: true, immutable: true },
  conclusion: { type: String, enum: conclusions, required: true, immutable: true },
  evidence: { type: [{ _id: false, kind: { type: String, enum: ["internal_ticket", "stripe_event", "stripe_object", "document_digest"], required: true }, reference: { type: String, maxlength: 128, required: true } }], required: true, immutable: true },
  sourceSnapshot: { type: snapshotSchema, required: true, immutable: true },
  createdAt: { type: Date, default: Date.now, immutable: true },
}, { versionKey: false, strict: "throw", autoCreate: false, autoIndex: false });
schema.pre("validate", function () {
  if (String(this._id) !== this.operationHash?.slice(0, 24)) throw new Error("Invalid administrative audit identity");
  validateReview({ expectedVersion: this.resultVersion - 1, sourceVersion: hash(this.sourceSnapshot), status: this.status, conclusion: this.conclusion, evidence: this.evidence.map(entry => ({ kind: entry.kind, reference: entry.reference })) }, "model-validation-key-0001");
});
const immutable = () => { throw new Error("Administrative audit is append-only"); };
schema.pre("save", function () { if (!this.isNew) immutable(); });
schema.pre(["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace", "deleteMany", "findOneAndDelete"], immutable);
schema.pre("deleteOne", { document: true, query: true }, immutable);
schema.index({ caseId: 1, resultVersion: -1 });
const Model = mongoose.model("ReconciliationAudit", schema);
Model.bulkWrite = async () => immutable();
module.exports = Model;
