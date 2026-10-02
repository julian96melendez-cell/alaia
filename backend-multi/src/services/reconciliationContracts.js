"use strict";
const crypto = require("node:crypto");
const statuses = ["open", "under_review", "awaiting_evidence", "closed"];
const conclusions = ["payment_confirmed", "payment_not_confirmed", "late_payment", "discrepancy", "awaiting_evidence", "no_operational_resolution"];
const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fail = (code, statusCode = 400) => Object.assign(new Error(code), { publicCode: code, statusCode });
function exact(object, allowed) {
  if (!object || typeof object !== "object" || Array.isArray(object) || Object.keys(object).some(key => !allowed.includes(key))) throw fail("REVIEW_INVALID_INPUT");
}
function parseKey(key) {
  if (typeof key !== "string" || !/^(order|event):[a-f0-9]{24}$/.test(key)) throw fail("REVIEW_INVALID_REFERENCE");
  const [kind, id] = key.split(":"); return { key, kind, id, caseId: hash(key).slice(0, 24) };
}
function pagination(query = {}, list = false) {
  exact(query, list ? ["page", "limit", "kind", "status"] : ["page", "limit"]);
  const integer = (value, fallback, max) => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value) || Number(value) > max) throw fail("REVIEW_INVALID_PAGINATION");
    return Number(value);
  };
  const page = integer(query.page, 1, 1000), limit = integer(query.limit, 25, 100);
  if ((page - 1) * limit > 10000) throw fail("REVIEW_INVALID_PAGINATION");
  if (query.kind !== undefined && !["order", "event"].includes(query.kind)) throw fail("REVIEW_INVALID_FILTER");
  if (query.status !== undefined && !statuses.includes(query.status)) throw fail("REVIEW_INVALID_FILTER");
  return { page, limit, kind: query.kind, status: query.status };
}
function validateReview(body, key) {
  exact(body, ["expectedVersion", "sourceVersion", "status", "conclusion", "evidence"]);
  if (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0 || body.expectedVersion > 1000000000) throw fail("REVIEW_INVALID_VERSION");
  if (typeof body.sourceVersion !== "string" || !/^[a-f0-9]{64}$/.test(body.sourceVersion)) throw fail("REVIEW_INVALID_VERSION");
  if (!statuses.includes(body.status) || !conclusions.includes(body.conclusion) || (body.status === "closed" && body.conclusion === "awaiting_evidence")) throw fail("REVIEW_INVALID_CONCLUSION");
  if (typeof key !== "string" || !/^[A-Za-z0-9_-]{20,128}$/.test(key)) throw fail("REVIEW_INVALID_IDEMPOTENCY_KEY");
  if (!Array.isArray(body.evidence) || body.evidence.length < 1 || body.evidence.length > 10) throw fail("REVIEW_INVALID_EVIDENCE");
  const patterns = { internal_ticket: /^[A-Z][A-Z0-9-]{2,63}$/, stripe_event: /^evt_[A-Za-z0-9]{1,120}$/, stripe_object: /^(pi|cs|ch|re|tr)_[A-Za-z0-9_]{1,120}$/, document_digest: /^[a-f0-9]{64}$/ };
  const evidence = body.evidence.map(entry => {
    exact(entry, ["kind", "reference"]);
    if (!Object.hasOwn(patterns, entry.kind) || typeof entry.reference !== "string" || !patterns[entry.kind].test(entry.reference) || /secret|sk_live|sk_test|whsec/i.test(entry.reference)) throw fail("REVIEW_INVALID_EVIDENCE");
    return { kind: entry.kind, reference: entry.reference };
  }).sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0);
  if (new Set(evidence.map(entry => JSON.stringify(entry))).size !== evidence.length) throw fail("REVIEW_INVALID_EVIDENCE");
  return { expectedVersion: body.expectedVersion, sourceVersion: body.sourceVersion, status: body.status, conclusion: body.conclusion, evidence };
}
const iso = date => { const value = new Date(date); return date && Number.isFinite(value.getTime()) ? value.toISOString() : null; };
const enumValue = (value, allowed) => allowed.includes(value) ? value : "unknown";
const idValue = value => value && /^[a-f0-9]{24}$/.test(String(value)) ? String(value) : null;
function sourceSnapshot(kind, source) {
  if (!source) return { missing: true, operationalPending: false };
  const common = { missing: false, updatedAt: iso(source.updatedAt), createdAt: iso(source.createdAt) };
  if (kind === "order") return { ...common,
    operationalPending: source.inventoryReservation?.needsReconciliation === true || source.inventoryReservation?.state === "reconciliation_required",
    managed: !!source.checkoutIntent?.keyHash,
    paymentState: enumValue(source.estadoPago, ["pendiente", "pagado", "fallido", "reembolsado", "reembolsado_parcial"]),
    fulfillmentState: enumValue(source.estadoFulfillment, ["pendiente", "procesando", "enviado", "entregado", "cancelado"]),
    reservationState: enumValue(source.inventoryReservation?.state, ["none", "reserved", "consumed", "released", "reconciliation_required"]),
    needsReconciliation: source.inventoryReservation?.needsReconciliation === true,
    payoutBlocked: source.payoutBlocked === true,
    total: typeof source.total === "number" && Number.isFinite(source.total) ? source.total : null,
    currency: typeof source.moneda === "string" && /^[a-z]{3}$/.test(source.moneda) ? source.moneda : null,
  };
  return { ...common, status: enumValue(source.status, ["received", "processed", "skipped", "failed"]),
    operationalPending: source.provider === "stripe" && (["failed", "skipped"].includes(source.status) || (source.status === "received" && new Date(source.updatedAt).getTime() <= Date.now() - 300000)),
    // No reported order ID, metadata, raw event, error or binding token is exposed.
    eventId: typeof source.eventId === "string" && /^evt_[A-Za-z0-9]{1,120}$/.test(source.eventId) ? source.eventId : null,
  };
}
function caseDTO(reference, record, source) {
  const snapshot = sourceSnapshot(reference.kind, source);
  return { caseKey: reference.key, sourceKind: reference.kind, sourceId: reference.id,
    administrativeStatus: record ? enumValue(record.status, statuses) : "open", version: Number.isSafeInteger(record?.version) ? record.version : 0,
    sourceVersion: hash(snapshot), source: snapshot, financialActionsAllowed: false,
  };
}
function safeObservedSnapshot(snapshot) {
  if (!snapshot || snapshot.missing === true) return { missing: true, operationalPending: false };
  const kind = Object.hasOwn(snapshot, "paymentState") ? "order" : "event";
  const safe = sourceSnapshot(kind, {
    createdAt: snapshot.createdAt, updatedAt: snapshot.updatedAt,
    checkoutIntent: { keyHash: snapshot.managed === true ? "managed" : "" },
    inventoryReservation: { state: snapshot.reservationState, needsReconciliation: snapshot.needsReconciliation === true },
    estadoPago: snapshot.paymentState, estadoFulfillment: snapshot.fulfillmentState,
    payoutBlocked: snapshot.payoutBlocked === true, total: snapshot.total, moneda: snapshot.currency,
    provider: "stripe", status: snapshot.status, eventId: snapshot.eventId,
  });
  safe.operationalPending = snapshot.operationalPending === true;
  return safe;
}
function auditDTO(audit) {
  const evidence = (audit.evidence || []).map(entry => {
    try {
      return validateReview({ expectedVersion: 0, sourceVersion: "a".repeat(64), status: "under_review", conclusion: "no_operational_resolution", evidence: [{ kind: entry.kind, reference: entry.reference }] }, "redaction-validation-0001").evidence[0];
    } catch { return { kind: "redacted", reference: "REDACTED" }; }
  });
  return { id: idValue(audit._id), actorId: idValue(audit.actorId), version: Number.isSafeInteger(audit.resultVersion) ? audit.resultVersion : null,
    status: enumValue(audit.status, statuses), conclusion: enumValue(audit.conclusion, conclusions), evidence,
    observedSource: safeObservedSnapshot(audit.sourceSnapshot), recordedAt: iso(audit.createdAt), financialActionsAllowed: false };
}
module.exports = { statuses, conclusions, hash, fail, parseKey, pagination, validateReview, sourceSnapshot, caseDTO, auditDTO };
