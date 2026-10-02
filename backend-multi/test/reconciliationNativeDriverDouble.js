'use strict';
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const { parseKey } = require('../src/services/reconciliationContracts');
const copy = value => value == null ? value : structuredClone(value);
// In-memory query interpretation only: this is not MongoDB aggregation evidence.
function createDriverDouble({ state, business, cases, audits }) {
  const events = [], clients = [];
  const current = () => ({ business, cases, audits });
  async function step(stage) {
    events.push(stage);
    const action = state.nativePlan[stage];
    if (action instanceof Error) throw action;
    if (action?.promise) await action.promise;
    if (typeof action === 'function') await action();
  }
  class Client {
    constructor() { clients.push(this); events.push('construct'); }
    async connect() { await step('connect'); }
    async close() { await step('client:close'); }
    startSession() {
      const session = { client: this, busy: false, transaction: false,
        startTransaction() { this.transaction = true; this.view = { business: copy(business), cases: new Map([...cases].map(([key, row]) => [key, copy(row)])), audits: new Map([...audits].map(([key, row]) => [key, copy(row)])) }; events.push('transaction:start'); },
        inTransaction() { return this.transaction; },
        async commitTransaction() { assert.equal(this.busy, false); await step('commit'); this.transaction = false; },
        async abortTransaction() { assert.equal(this.busy, false); await step('abort'); this.transaction = false; },
        async endSession() { assert.equal(this.busy, false); await step('endSession'); }
      };
      events.push('session:start'); return session;
    }
    db(database) {
      assert.equal(database, 'express_fixture');
      return { databaseName: database, collection(name) {
        assert.ok(['orders', 'events', 'cases', 'audits'].includes(name));
        function cursor(kind, filter, options) {
          assert.ok(options.timeoutMS > 0 && options.timeoutMS <= options.maxTimeMS);
          const session = options.session; let limit;
          return {
            limit(value) { limit = value; return this; },
            async next() { assert.equal(limit, 1); return this.execute(); },
            async toArray() { return this.execute(); },
            async execute() {
              assert.equal(session.busy, false); session.busy = true;
              try {
                await step('query');
                const data = session.transaction ? session.view : current();
                if (kind === 'find') {
                  const rows = name === 'cases' ? [...data.cases.values()] : data.business[name];
                  return copy(rows.find(row => String(row._id) === String(filter._id)) || null);
                }
                const facet = filter.at(-1).$facet;
                const skip = facet.items[0].$skip, take = facet.items[1].$limit;
                let items;
                if (name === 'audits') {
                  items = [...data.audits.values()].filter(row => String(row.caseId) === String(filter[0].$match.caseId)).sort((a, b) => b.resultVersion - a.resultVersion);
                } else {
                  const keys = new Set([
                    ...data.business.orders.filter(row => row.inventoryReservation.needsReconciliation || row.inventoryReservation.state === 'reconciliation_required').map(row => `order:${row._id}`),
                    ...data.business.events.filter(row => row.provider === 'stripe' && ['failed', 'skipped'].includes(row.status)).map(row => `event:${row._id}`),
                    ...[...data.cases.values()].filter(row => row.status !== 'closed').map(row => row.caseKey)
                  ]);
                  const filters = filter.filter(stage => stage.$match).at(-1).$match;
                  items = [...keys].sort().map(key => {
                    const reference = parseKey(key), record = data.cases.get(reference.caseId);
                    const source = data.business[reference.kind === 'order' ? 'orders' : 'events'].find(row => String(row._id) === reference.id);
                    return { _id: key, sourceKind: reference.kind, administrativeStatus: record?.status || 'open', record: copy(record), source: copy(source) };
                  }).filter(row => (!filters.sourceKind || row.sourceKind === filters.sourceKind) && (!filters.administrativeStatus || row.administrativeStatus === filters.administrativeStatus));
                }
                return [{ items: copy(items.slice(skip, skip + take)), total: [{ count: items.length }] }];
              } finally { session.busy = false; events.push('query:settled'); }
            },
            async close() { assert.equal(session.busy, false); await step('cursor:close'); }
          };
        }
        return { find: (filter, options) => cursor('find', filter, options), aggregate: (filter, options) => cursor('aggregate', filter, options) };
      } };
    }
  }
  return { driver: { MongoClient: Client, ObjectId }, events, clients };
}
module.exports = { createDriverDouble };
