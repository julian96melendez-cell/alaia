"use strict";
const { parseKey, caseDTO, fail } = require("./reconciliationContracts");
const { getReconciliationReadLimits } = require("../config/reconciliationReads");
const pendingOrders = { $or: [{ "inventoryReservation.needsReconciliation": true }, { "inventoryReservation.state": "reconciliation_required" }] };
function pendingEvents(now = new Date()) {
  return { provider: "stripe", $or: [{ status: { $in: ["failed", "skipped"] } }, { status: "received", updatedAt: { $lte: new Date(now.getTime() - 300000) } }] };
}
function listPipeline(options, collections, now) {
  const source = kind => ({ sourceKind: { $literal: kind }, sourceId: "$_id", caseKey: { $concat: [`${kind}:`, { $toString: "$_id" }] }, createdAt: 1, operationalPending: { $literal: true }, _id: 0 });
  const filters = {};
  if (options.kind) filters.sourceKind = options.kind;
  if (options.status) filters.administrativeStatus = options.status;
  return [
    { $match: pendingOrders }, { $project: source("order") },
    { $unionWith: { coll: collections.events, pipeline: [{ $match: pendingEvents(now) }, { $project: source("event") }] } },
    { $unionWith: { coll: collections.cases, pipeline: [{ $match: { status: { $ne: "closed" } } }, { $project: { _id: 0, caseKey: 1, sourceKind: 1, sourceId: 1, createdAt: 1, operationalPending: { $literal: false } } }] } },
    { $group: { _id: "$caseKey", sourceKind: { $first: "$sourceKind" }, sourceId: { $first: "$sourceId" }, createdAt: { $min: "$createdAt" } } },
    { $lookup: { from: collections.cases, localField: "_id", foreignField: "caseKey", as: "caseRecords" } },
    { $set: { record: { $arrayElemAt: ["$caseRecords", 0] }, administrativeStatus: { $ifNull: [{ $arrayElemAt: ["$caseRecords.status", 0] }, "open"] } } },
    { $lookup: { from: collections.orders, localField: "sourceId", foreignField: "_id", pipeline: [{ $project: { createdAt: 1, updatedAt: 1, "inventoryReservation.state": 1, "inventoryReservation.needsReconciliation": 1, "checkoutIntent.keyHash": 1, estadoPago: 1, estadoFulfillment: 1, payoutBlocked: 1, total: 1, moneda: 1 } }], as: "orderSources" } },
    { $lookup: { from: collections.events, localField: "sourceId", foreignField: "_id", pipeline: [{ $project: { createdAt: 1, updatedAt: 1, provider: 1, status: 1, eventId: 1 } }], as: "eventSources" } },
    { $set: { source: { $arrayElemAt: [{ $cond: [{ $eq: ["$sourceKind", "order"] }, "$orderSources", "$eventSources"] }, 0] } } },
    { $project: { _id: 1, record: 1, source: 1, sourceKind: 1, administrativeStatus: 1, createdAt: 1 } },
    { $match: filters }, { $sort: { createdAt: 1, _id: 1 } },
    { $facet: { items: [{ $skip: (options.page - 1) * options.limit }, { $limit: options.limit }], total: [{ $count: "count" }] } },
  ];
}
function auditPipeline(id, options) {
  return [{ $match: { caseId: id } }, { $project: { _id: 1, actorId: 1, resultVersion: 1, status: 1, conclusion: 1, evidence: 1, sourceSnapshot: 1, createdAt: 1 } }, { $sort: { resultVersion: -1, _id: -1 } },
    { $facet: { items: [{ $skip: (options.page - 1) * options.limit }, { $limit: options.limit }], total: [{ $count: "count" }] } }];
}
function runtime() {
  return { mongoose: require("mongoose"), Orden: require("../models/Orden"), WebhookEvent: require("../models/WebhookEvent"), Case: require("../models/ReconciliationCase"), Audit: require("../models/ReconciliationAudit") };
}
function createMongoRepository(dependencies) {
  const { mongoose, Orden, WebhookEvent, Case, Audit } = dependencies || runtime();
  const limits = getReconciliationReadLimits();
  const maxTimeMS = budget => budget ? budget.maxTimeMS() : limits.mongoMaxTimeMS;
  const repo = {
    transaction: async (fn, budget) => {
      const session = await mongoose.startSession();
      try {
        const options = { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" };
        if (budget) options.maxCommitTimeMS = maxTimeMS(budget);
        let result;
        await session.withTransaction(async () => {
          budget?.maxTimeMS();
          result = await fn(session);
          // Late completion must reject inside withTransaction so the driver
          // awaits abort before endSession. Never abort beside an active query.
          budget?.maxTimeMS();
        }, options);
        return result;
      }
      finally { await session.endSession(); }
    },
    getCase: (id, session, budget) => {
      const query = Case.findById(id).session(session || null);
      if (budget) query.maxTimeMS(maxTimeMS(budget));
      return query.lean();
    },
    getAudit: (id, session) => Audit.findById(id).select("+requestHash +operationHash").session(session || null).lean(),
    getSource: (reference, session, budget) => {
      const model = reference.kind === "order" ? Orden : WebhookEvent;
      const projection = reference.kind === "order"
        ? "createdAt updatedAt inventoryReservation.state inventoryReservation.needsReconciliation checkoutIntent.keyHash estadoPago estadoFulfillment payoutBlocked total moneda"
        : "createdAt updatedAt provider status eventId";
      const query = model.findById(reference.id).select(projection).session(session || null);
      if (budget) query.maxTimeMS(maxTimeMS(budget));
      return query.lean();
    },
    writeCase: async (record, expectedVersion, session) => {
      if (expectedVersion === 0) { await Case.create([record], { session }); return; }
      const result = await Case.updateOne({ _id: record._id, version: expectedVersion }, { $set: { status: record.status, lastAuditId: record.lastAuditId }, $inc: { version: 1 } }, { session, runValidators: true });
      if (result.modifiedCount !== 1) throw fail("REVIEW_STALE_VERSION", 409);
    },
    createAudit: async (record, session) => {
      const [audit] = await Audit.create([record], { session }); return audit.toObject();
    },
    listAudits: async (id, options, session, budget) => {
      const [result] = await Audit.aggregate(auditPipeline(new mongoose.Types.ObjectId(id), options)).option({ maxTimeMS: maxTimeMS(budget) }).session(session || null);
      return { items: result?.items || [], total: result?.total?.[0]?.count || 0 };
    },
    list: async (options, budget) => {
      // $unionWith is deliberately outside transactions. All response data is
      // produced by this command; this queue is observational, not a snapshot.
      const [result] = await Orden.aggregate(listPipeline(options, { orders: Orden.collection.name, events: WebhookEvent.collection.name, cases: Case.collection.name }, new Date())).option({ maxTimeMS: maxTimeMS(budget) });
      const items = (result?.items || []).map(row => caseDTO(parseKey(row._id), row.record, row.source));
      return { items, total: result?.total?.[0]?.count || 0, readConsistency: "single_aggregation" };
    },
  };
  repo.readSnapshot = (fn, budget) => repo.transaction(fn, budget);
  return repo;
}
module.exports = { createMongoRepository, listPipeline, auditPipeline, pendingEvents, pendingOrders };
