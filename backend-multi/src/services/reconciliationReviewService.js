"use strict";
const { hash, fail, parseKey, pagination, validateReview, sourceSnapshot, caseDTO, auditDTO } = require("./reconciliationContracts");
const { createReadBudget } = require("./reconciliationReadRuntime");
const { getReconciliationReadLimits } = require("../config/reconciliationReads");
function createReconciliationReviewService(repo) {
  const replay = (audit, requestHash, operationHash) => {
    if (audit.operationHash !== operationHash) throw fail("REVIEW_REFERENCE_CONFLICT", 409);
    if (audit.requestHash !== requestHash) throw fail("REVIEW_IDEMPOTENCY_CONFLICT", 409);
    return { review: auditDTO(audit), replayed: true, financialActionsAllowed: false };
  };
  return {
    async list(query, budget = createReadBudget(getReconciliationReadLimits())) {
      const options = pagination(query, true);
      const result = await repo.list(options, budget);
      budget?.maxTimeMS();
      return { ...result, page: options.page, limit: options.limit, financialActionsAllowed: false };
    },
    async detail(key, query, budget = createReadBudget(getReconciliationReadLimits())) {
      const reference = parseKey(key), options = pagination(query);
      return repo.readSnapshot(async session => {
        budget?.maxTimeMS();
        const record = await repo.getCase(reference.caseId, session, budget);
        budget?.maxTimeMS();
        const source = await repo.getSource(reference, session, budget);
        if (record && (record.caseKey !== key || record.sourceKind !== reference.kind || String(record.sourceId) !== reference.id)) throw fail("REVIEW_REFERENCE_CONFLICT", 409);
        const dto = caseDTO(reference, record, source);
        if (!record && !dto.source.operationalPending) throw fail("REVIEW_NOT_FOUND", 404);
        budget?.maxTimeMS();
        const audits = await repo.listAudits(reference.caseId, options, session, budget);
        budget?.maxTimeMS();
        return { ...dto, audits: audits.items.map(auditDTO), auditTotal: audits.total, page: options.page, limit: options.limit, readConsistency: "snapshot" };
      }, budget);
    },
    async review(key, body, idempotencyKey, actorId) {
      const reference = parseKey(key), input = validateReview(body, idempotencyKey);
      if (typeof actorId !== "string" || !/^[a-f0-9]{24}$/.test(actorId)) throw fail("REVIEW_FORBIDDEN", 403);
      const operationHash = hash([reference.key, actorId, idempotencyKey]), auditId = operationHash.slice(0, 24), requestHash = hash(input);
      const existing = await repo.getAudit(auditId);
      if (existing) return replay(existing, requestHash, operationHash);
      try {
        return await repo.transaction(async session => {
          const duplicate = await repo.getAudit(auditId, session);
          if (duplicate) return replay(duplicate, requestHash, operationHash);
          const record = await repo.getCase(reference.caseId, session);
          const source = await repo.getSource(reference, session);
          if (record && (record.caseKey !== key || record.sourceKind !== reference.kind || String(record.sourceId) !== reference.id)) throw fail("REVIEW_REFERENCE_CONFLICT", 409);
          const snapshot = sourceSnapshot(reference.kind, source);
          if (!record && !snapshot.operationalPending) throw fail("REVIEW_SOURCE_NOT_PENDING", 409);
          if ((record?.version || 0) !== input.expectedVersion || hash(snapshot) !== input.sourceVersion) throw fail("REVIEW_STALE_VERSION", 409);
          const version = input.expectedVersion + 1;
          await repo.writeCase({ _id: reference.caseId, caseKey: key, sourceKind: reference.kind, sourceId: reference.id, status: input.status, version, lastAuditId: auditId }, input.expectedVersion, session);
          const audit = await repo.createAudit({ _id: auditId, caseId: reference.caseId, actorId, requestHash, operationHash, resultVersion: version, status: input.status, conclusion: input.conclusion, evidence: input.evidence, sourceSnapshot: snapshot }, session);
          return { review: auditDTO(audit), replayed: false, financialActionsAllowed: false };
        });
      } catch (error) {
        if (error.code !== 11000) throw error;
        const duplicate = await repo.getAudit(auditId);
        if (duplicate) return replay(duplicate, requestHash, operationHash);
        throw fail("REVIEW_STALE_VERSION", 409);
      }
    },
  };
}
let service;
function getReconciliationReviewService() {
  if (!service) service = createReconciliationReviewService(require("./reconciliationRepository").createMongoRepository());
  return service;
}
module.exports = { createReconciliationReviewService, getReconciliationReviewService };
