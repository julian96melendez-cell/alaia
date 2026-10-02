'use strict';
const { getNativeReaderConfig } = require('../config/reconciliationNativeReader');
const { createReadBudget, createReconciliationReadRuntime } = require('./reconciliationReadRuntime');
const { listPipeline, auditPipeline } = require('./reconciliationRepository');
const { createReconciliationReviewService } = require('./reconciliationReviewService');
const { createAdminReconciliationController } = require('../controllers/adminReconciliationController');
const { parseKey, caseDTO, fail } = require('./reconciliationContracts');

const publicCodes = new Set(['REVIEW_READ_TIMEOUT', 'REVIEW_INVALID_REFERENCE', 'REVIEW_REFERENCE_CONFLICT', 'REVIEW_NOT_FOUND']);
function safeError(error) {
  if (error?.name === 'MongoOperationTimeoutError' || error?.code === 50 || error?.codeName === 'MaxTimeMSExpired') return fail('REVIEW_READ_TIMEOUT', 504);
  if (publicCodes.has(error?.publicCode)) return fail(error.publicCode, error.statusCode);
  return fail('REVIEW_UNAVAILABLE', 503);
}

// Construction is opt-in; the lifecycle coordinator connects explicitly.
// Enabling the flag permits construction, never connection or route replacement.
function createNativeReconciliationReader({ env = process.env, driver } = {}) {
  const config = getNativeReaderConfig(env);
  if (!config.enabled) return null;
  if (!driver) {
    if (require('mongodb/package.json').version !== '7.0.0') throw new Error('Unsupported native reconciliation driver');
    driver = require('mongodb');
  }
  const { MongoClient, ObjectId } = driver;
  const reads = createReconciliationReadRuntime(config), ownedSessions = new WeakSet(), pending = new Set();
  let client, db, collections, phase = 'idle', connectPromise, closePromise, clientClosePromise, closing = false, openSessions = 0;
  const closeClient = () => {
    if (!client) return Promise.resolve();
    if (!clientClosePromise) clientClosePromise = Promise.resolve().then(() => client.close());
    return clientClosePromise;
  };
  const ready = () => { if (phase !== 'ready') throw fail('REVIEW_UNAVAILABLE', 503); };
  const sessionCheck = session => {
    if (!ownedSessions.has(session) || session.client !== client) throw fail('REVIEW_UNAVAILABLE', 503);
  };
  const commandOptions = (budget, session) => {
    ready(); sessionCheck(session);
    const cap = Math.min(config.mongoMaxTimeMS, budget.maxTimeMS());
    // CSOT may replace maxTimeMS, so its own deadline must not exceed this cap.
    return { session, maxTimeMS: cap, timeoutMS: cap, readPreference: 'primary' };
  };
  async function cursorRead(kind, name, filterOrPipeline, budget, session, projection) {
    const options = commandOptions(budget, session);
    if (projection) options.projection = projection;
    if (kind === 'find') options.singleBatch = true;
    const collection = db.collection(name);
    const cursor = kind === 'find'
      ? collection.find(filterOrPipeline, options).limit(1)
      : collection.aggregate(filterOrPipeline, options);
    try {
      const result = kind === 'find' ? await cursor.next() : await cursor.toArray();
      budget.maxTimeMS();
      return result;
    } finally {
      // No AbortSignal: avoid the driver's detached cursor-close abort listener.
      // Never race close against the query or detach cleanup from its promise.
      try { await cursor.close({ timeoutMS: config.cleanupTimeoutMS }); }
      catch (error) { phase = 'failed'; throw safeError(error); }
    }
  }
  async function sessionRead(fn, budget, snapshot) {
    ready(); budget.maxTimeMS();
    const session = client.startSession({ causalConsistency: false, defaultTimeoutMS: config.cleanupTimeoutMS });
    if (session.client !== client) throw fail('REVIEW_UNAVAILABLE', 503);
    ownedSessions.add(session); openSessions++;
    try {
      if (snapshot) session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary', maxCommitTimeMS: Math.min(config.mongoMaxTimeMS, budget.maxTimeMS()) });
      const result = await fn(session);
      budget.maxTimeMS();
      if (snapshot) await session.commitTransaction({ timeoutMS: Math.min(config.mongoMaxTimeMS, budget.maxTimeMS()) });
      budget.maxTimeMS();
      return result;
    } catch (error) { throw safeError(error); }
    finally {
      try {
        if (session.inTransaction()) await session.abortTransaction({ timeoutMS: config.cleanupTimeoutMS });
      } catch (error) { phase = 'failed'; throw safeError(error); }
      finally {
        try { await session.endSession({ timeoutMS: config.cleanupTimeoutMS }); }
        catch (error) { phase = 'failed'; throw safeError(error); }
        finally { ownedSessions.delete(session); openSessions--; }
      }
    }
  }
  const repo = Object.freeze({
    readSnapshot: (fn, budget) => sessionRead(fn, budget, true),
    getCase: (id, session, budget) => cursorRead('find', collections.cases, { _id: new ObjectId(id) }, budget, session),
    getSource: (reference, session, budget) => {
      const fields = reference.kind === 'order'
        ? 'createdAt updatedAt inventoryReservation.state inventoryReservation.needsReconciliation checkoutIntent.keyHash estadoPago estadoFulfillment payoutBlocked total moneda'
        : 'createdAt updatedAt provider status eventId';
      const projection = Object.fromEntries(fields.split(' ').map(field => [field, 1]));
      return cursorRead('find', reference.kind === 'order' ? collections.orders : collections.events, { _id: new ObjectId(reference.id) }, budget, session, projection);
    },
    listAudits: async (id, options, session, budget) => {
      const [result] = await cursorRead('aggregate', collections.audits, auditPipeline(new ObjectId(id), options), budget, session);
      return { items: result?.items || [], total: result?.total?.[0]?.count || 0 };
    },
    list: (options, budget) => sessionRead(async session => {
      const [result] = await cursorRead('aggregate', collections.orders, listPipeline(options, collections, new Date()), budget, session);
      return { items: (result?.items || []).map(row => caseDTO(parseKey(row._id), row.record, row.source)), total: result?.total?.[0]?.count || 0, readConsistency: 'single_aggregation' };
    }, budget, false),
  });
  const service = createReconciliationReviewService(repo);
  const track = fn => {
    const work = Promise.resolve().then(fn);
    pending.add(work);
    return work.finally(() => pending.delete(work));
  };
  const facade = Object.freeze({
    list: (query, budget = createReadBudget(config)) => track(() => service.list(query, budget)),
    detail: (key, query, budget = createReadBudget(config)) => track(() => service.detail(key, query, budget)),
  });
  const controller = createAdminReconciliationController(() => facade, reads);
  return Object.freeze({
    handlers: Object.freeze({ list: controller.list, detail: controller.detail }),
    stats: () => ({ ...reads.stats(), phase, pendingReads: pending.size, openSessions }),
    async connect({ uri, database, collectionNames } = {}) {
      if (phase !== 'idle' || typeof uri !== 'string' || !/^mongodb(?:\+srv)?:\/\//.test(uri) || typeof database !== 'string' || !/^[A-Za-z0-9_-]{1,63}$/.test(database)) throw fail('REVIEW_UNAVAILABLE', 503);
      const keys = ['orders', 'events', 'cases', 'audits'];
      if (!collectionNames || Object.keys(collectionNames).length !== keys.length || keys.some(key => typeof collectionNames[key] !== 'string' || !/^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/.test(collectionNames[key]) || collectionNames[key].startsWith('system.')) || new Set(Object.values(collectionNames)).size !== keys.length) throw fail('REVIEW_UNAVAILABLE', 503);
      phase = 'connecting';
      connectPromise = (async () => {
        try {
          client = new MongoClient(uri, {
            dbName: database, appName: 'alaia-reconciliation-native-prototype',
            maxPoolSize: config.maxPoolSize, minPoolSize: 0, maxConnecting: 2,
            serverSelectionTimeoutMS: config.serverSelectionTimeoutMS, connectTimeoutMS: config.connectTimeoutMS,
            waitQueueTimeoutMS: config.waitQueueTimeoutMS, socketTimeoutMS: config.socketTimeoutMS,
            timeoutMS: config.mongoMaxTimeMS, retryReads: false, retryWrites: false, readPreference: 'primary',
            monitorCommands: false, mongodbLogComponentSeverities: { default: 'off' },
          });
          await client.connect();
          if (closing) throw fail('REVIEW_UNAVAILABLE', 503);
          db = client.db(database);
          if (db.databaseName !== database) throw fail('REVIEW_UNAVAILABLE', 503);
          collections = Object.freeze({ ...collectionNames }); phase = 'ready';
        } catch (error) {
          phase = 'failed';
          try { await closeClient(); } catch { /* Fail closed; never log credentials or detach cleanup. */ }
          throw safeError(error);
        }
      })();
      await connectPromise;
    },
    close() {
      if (closePromise) return closePromise;
      closing = true; phase = 'closing';
      closePromise = (async () => {
        try {
          if (connectPromise) await connectPromise.catch(() => {});
          await Promise.allSettled([...pending]); // Drain independent requests, never queries in one session.
          await closeClient();
          phase = 'closed';
        } catch (error) { phase = 'failed'; throw safeError(error); }
      })();
      return closePromise;
    },
  });
}
module.exports = { createNativeReconciliationReader };
