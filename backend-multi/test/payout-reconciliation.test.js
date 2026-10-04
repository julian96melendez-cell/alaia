'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Orden = require('../src/models/Orden');
const ID = 'aaaaaaaaaaaaaaaaaaaaaaaa', SELLER = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const copy = v => JSON.parse(JSON.stringify(v));
const methods = Orden.schema.methods;
function harness(options = {}) {
  let state = { _id: ID, __v: 0, payoutPolicy: 'escrow_delivered_hold', payoutBlocked: false,
    estadoPago: 'pagado', estadoFulfillment: 'entregado', payoutEligibleAt: '2020-01-01',
    inventoryReservation: { state: 'consumed', needsReconciliation: false }, moneda: 'usd',
    items: [{ sellerType: 'seller', vendedor: SELLER, sellerId: SELLER }], historial: [],
    vendedorPayouts: [{ vendedor: SELLER, monto: 10, status: 'pendiente', stripeTransferId: '', processingAt: null, meta: null }] };
  Object.assign(state, options.order || {});
  const calls = []; let saves = 0, claims = 0;
  function allowed(filter) {
    return state.estadoPago === filter.estadoPago && state.estadoFulfillment === filter.estadoFulfillment &&
      !state.payoutBlocked && !state.inventoryReservation.needsReconciliation &&
      state.inventoryReservation.state !== 'reconciliation_required';
  }
  function document() {
    const doc = copy(state);
    for (const array of [doc.historial, doc.vendedorPayouts]) for (const row of array) {
      Object.defineProperty(row, 'toObject', { value: () => copy(row) });
    }
    doc.hasPayoutUncertainty = methods.hasPayoutUncertainty;
    doc.isPayoutEligible = function () { return methods.isPayoutEligible.call(this); };
    doc.setVendedorPayoutStatus = function (seller, status, details = {}) {
      const row = this.vendedorPayouts.find(p => p.vendedor === seller);
      row.status = status;
      if (status === 'procesando') row.processingAt = new Date().toISOString();
      if (details.stripeTransferId) row.stripeTransferId = details.stripeTransferId;
    };
    doc.blockPayouts = function (reason) { this.payoutBlocked = true; this.payoutBlockedReason = reason;
      this.vendedorPayouts.forEach(p => { if (p.status !== 'pagado') p.status = 'bloqueado'; }); };
    doc.save = async function (opts) {
      saves++; assert.equal(opts.w, 'majority');
      if (options.onSave) await options.onSave({ saves, state, doc: this });
      if (options.failSave && options.failSave(saves)) throw new Error('synthetic persistence error');
      if (this.$where && !allowed(this.$where)) throw new Error('conditional save rejected');
      // Preserve unrelated fields; mock only the payout mutations made by this service.
      state.__v++; this.__v = state.__v;
      state.vendedorPayouts = copy(this.vendedorPayouts);
      state.payoutBlocked = this.payoutBlocked;
      state.payoutBlockedReason = this.payoutBlockedReason;
      // These fields may only add a reconciliation block, never consume/release stock.
      if (this.inventoryReservation.needsReconciliation) {
        state.inventoryReservation.needsReconciliation = true;
        state.inventoryReservation.reconciliationReason = this.inventoryReservation.reconciliationReason;
      }
      if (this.payoutReleasedAt) state.payoutReleasedAt = this.payoutReleasedAt;
      return this;
    };
    return doc;
  }
  const model = {
    findById: async () => document(),
    updateOne: async (filter, update, opts) => {
      assert.equal(opts.writeConcern.w, 'majority');
      const entry = update.$push.historial;
      if (!entry.estado.endsWith('_confirmed')) {
        claims++;
        if (filter.__v !== state.__v || !allowed(filter) || JSON.stringify(filter.historial) !== JSON.stringify(state.historial) ||
            JSON.stringify(filter.vendedorPayouts) !== JSON.stringify(state.vendedorPayouts) ||
            state.historial.some(h => h.estado === entry.estado)) return { acknowledged: true, modifiedCount: 0 };
        state.historial.push(copy(entry)); state.__v++;
        if (options.claimFailure) throw new Error('claim acknowledgement lost');
      } else {
        if (options.confirmFailure) throw new Error('confirmation failed');
        const row = state.vendedorPayouts[0];
        assert.equal(row.status, 'pagado'); assert.equal(row.stripeTransferId, entry.meta.transferId);
        assert.equal(filter.__v, state.__v);
        state.historial.push(copy(entry)); state.__v++;
      }
      return { acknowledged: true, modifiedCount: 1 };
    },
  };
  const seller = { rol: 'vendedor', activo: true, sellerStatus: 'approved', stripeAccountId: 'acct_synthetic',
    stripeOnboardingComplete: true, stripeChargesEnabled: true, stripePayoutsEnabled: true, ...(options.seller || {}) };
  const filename = path.join(__dirname, '../src/services/payoutService.js');
  const module = { exports: {} };
  const dependencies = {
    '../models/Orden': model,
    '../models/Usuario': { findById: () => ({ select: () => ({ lean: async () => seller }) }) },
    '../payments/stripeService': { stripe: { transfers: { create: async (body, opts) => {
      calls.push(copy({ body, opts }));
      if (options.transfer) return options.transfer({ state, calls });
      return { id: 'tr_synthetic' };
    } } } },
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports,
    require: name => { assert.ok(Object.hasOwn(dependencies, name), `forbidden dependency: ${name}`); return dependencies[name]; }, Date, Set }, { filename });
  return { run: runId => module.exports.pagarVendedoresDeOrden({ ordenId: ID, mode: 'scheduler', runId }),
    state: () => state, calls, counts: () => ({ saves, claims }), model };
}
test('successful obligation emits one transfer across different administrative run IDs', async () => {
  const h = harness(); await h.run('one'); await h.run('two');
  assert.equal(h.calls.length, 1); assert.equal(h.state().vendedorPayouts[0].status, 'pagado');
  assert.ok(h.calls[0].opts.idempotencyKey.endsWith(`${ID}_${SELLER}`));
  assert.equal(h.calls[0].opts.maxNetworkRetries, 0);
  assert.equal(h.calls[0].body.metadata.runId, undefined);
});
test('separate synthetic runs generate the same obligation identity and financial request', async () => {
  const a = harness(), b = harness(); await a.run('one'); await b.run('other');
  assert.deepEqual(a.calls, b.calls);
});
test('successful transfer followed by failed persistence remains uncertain; no second transfer', async () => {
  const h = harness({ failSave: n => n === 2 });
  await assert.rejects(h.run('one'), e => e.publicCode === 'PAYOUT_OUTCOME_UNCERTAIN');
  await h.run('two'); assert.equal(h.calls.length, 1);
  assert.equal(h.state().payoutBlocked, true); assert.equal(h.state().vendedorPayouts[0].meta.outcome, 'uncertain');
});
test('lost Stripe response is not a retryable failure', async () => {
  const h = harness({ transfer: async () => { throw new Error('synthetic lost response'); } });
  await assert.rejects(h.run('one')); await h.run('two');
  assert.equal(h.calls.length, 1); assert.equal(h.state().vendedorPayouts[0].status, 'bloqueado');
});
test('durable claim blocks retries even if every subsequent save fails', async () => {
  const h = harness({ failSave: () => true }); await assert.rejects(h.run('one'), e => e.publicCode === 'PAYOUT_UNCERTAIN_PERSISTENCE');
  await h.run('two'); assert.equal(h.calls.length, 0); assert.equal(h.state().historial.length, 1);
});
test('lost claim acknowledgement never calls Stripe and persisted claim prevents retry', async () => {
  const h = harness({ claimFailure: true }); await assert.rejects(h.run('one')); await h.run('two');
  assert.equal(h.calls.length, 0);
});
test('confirmation persistence failure blocks an already successful transfer', async () => {
  const h = harness({ confirmFailure: true }); await assert.rejects(h.run('one')); await h.run('two');
  assert.equal(h.calls.length, 1); assert.equal(h.state().payoutBlocked, true);
});
test('two concurrent executions claim only once and emit no second transfer', async () => {
  let release, started;
  const startedPromise = new Promise(r => { started = r; });
  const gate = new Promise(r => { release = r; });
  const h = harness({ transfer: async () => { started(); await gate; throw new Error('synthetic uncertain'); } });
  const first = h.run('one'); await startedPromise; await h.run('two'); release();
  await assert.rejects(first); await h.run('three'); assert.equal(h.calls.length, 1);
});
test('simultaneous initial snapshots cannot both win the durable claim', async () => {
  const h = harness(); const outcomes = await Promise.allSettled([h.run('one'), h.run('two')]);
  assert.ok(outcomes.every(o => o.status === 'fulfilled')); assert.equal(h.calls.length, 1);
});
for (const change of [
  { payoutBlocked: true },
  { inventoryReservation: { state: 'consumed', needsReconciliation: true } },
  { inventoryReservation: { state: 'reconciliation_required', needsReconciliation: false } },
  { estadoPago: 'reembolsado' },
]) test(`reconciliation/payment guard blocks transfer: ${JSON.stringify(change)}`, async () => {
  const h = harness({ order: change }); await h.run('one'); assert.equal(h.calls.length, 0); assert.equal(h.counts().claims, 0);
});
test('reconciliation introduced between claim and save prevents contacting Stripe', async () => {
  const h = harness({ onSave: ({ saves, state }) => { if (saves === 1) state.inventoryReservation.needsReconciliation = true; } });
  await assert.rejects(h.run('one')); await h.run('two'); assert.equal(h.calls.length, 0);
});
test('malformed Stripe success is uncertain, not automatically retried', async () => {
  const h = harness({ transfer: async () => ({}) }); await assert.rejects(h.run('one')); await h.run('two'); assert.equal(h.calls.length, 1);
});
test('historical failed row with an earlier attempt is blocked', async () => {
  const h = harness(); h.state().vendedorPayouts[0].status = 'fallido'; h.state().vendedorPayouts[0].processingAt = '2020-01-01';
  await h.run('one'); assert.equal(h.calls.length, 0);
});
test('real disconnected model recognizes durable unresolved claim and confirmation', () => {
  const h = harness(); const doc = Orden.hydrate(h.state());
  doc.historial.push({ estado: `payout_obligation_${ID}_${SELLER}`, fecha: new Date() });
  assert.equal(doc.hasPayoutUncertainty(), true); assert.equal(doc.isPayoutEligible(), false);
  doc.historial.push({ estado: `payout_obligation_${ID}_${SELLER}_confirmed`, fecha: new Date() });
  assert.equal(doc.hasPayoutUncertainty(), false);
});
for (const scenario of [
  { name: 'uncertain row', apply: state => { state.vendedorPayouts[0].meta = { outcome: 'uncertain' }; } },
  { name: 'payoutBlocked', apply: state => { state.payoutBlocked = true; } },
  { name: 'needsReconciliation', apply: state => { state.inventoryReservation.needsReconciliation = true; } },
  { name: 'reconciliation_required', apply: state => { state.inventoryReservation.state = 'reconciliation_required'; } },
]) test(`administrative controller blocks ${scenario.name} before save or payout service`, async () => {
  const h = harness(); scenario.apply(h.state());
  const filename = path.join(__dirname, '../src/controllers/adminPayoutController.js'), module = { exports: {} };
  let payouts = 0;
  const deps = { mongoose: { Types: { ObjectId: { isValid: () => true } } }, '../models/Orden': h.model,
    '../services/payoutService': { pagarVendedoresDeOrden: async () => { payouts++; } } };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports,
    require: n => { assert.ok(Object.hasOwn(deps, n)); return deps[n]; }, console: { error() {}, log() {} }, Date, process: { env: {} } });
  const res = { statusCode: 0, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } };
  await module.exports.adminReintentarPayout({ params: { ordenId: ID }, body: {}, usuario: { rol: 'admin' }, headers: {} }, res);
  assert.equal(res.statusCode, 400); assert.equal(payouts, 0); assert.equal(h.counts().saves, 0);
});

test('real Mongoose query guard allows only the nonfinancial durable claim with majority acknowledgement', async () => {
  const original = Orden.collection.updateOne; let captured;
  Orden.collection.updateOne = async (filter, update, options) => {
    captured = { filter, update, options }; return { acknowledged: true, modifiedCount: 1 };
  };
  try {
    await Orden.updateOne({ _id: ID, estadoPago: 'pagado', 'historial.estado': { $ne: `payout_obligation_${ID}_${SELLER}` } },
      { $inc: { __v: 1 }, $push: { historial: { estado: `payout_obligation_${ID}_${SELLER}`, fecha: new Date(), meta: { outcome: 'uncertain' } } } },
      { writeConcern: { w: 'majority' } });
    assert.equal(captured.options.writeConcern.w, 'majority');
    assert.ok(Object.keys(captured.update).every(k => ['$inc', '$push', '$set', '$setOnInsert'].includes(k)));
    assert.ok(Object.keys(captured.update.$set || {}).every(k => k === 'updatedAt'));
    assert.ok(Object.keys(captured.update.$setOnInsert || {}).every(k => k === 'createdAt'));
    assert.ok(!captured.options.upsert);
    assert.deepEqual(Object.keys(captured.update.$push), ['historial']);
    assert.equal(captured.update.$inc.__v, 1);
  } finally { Orden.collection.updateOne = original; }
});
test('real Mongoose saves preserve financial eligibility predicates on both processing and paid writes', async () => {
  const h = harness(), original = Orden.collection.updateOne, writes = [];
  const item = { producto: 'cccccccccccccccccccccccc', nombre: 'synthetic', cantidad: 1, precioUnitario: 12,
    costoProveedorUnitario: 0, proveedor: 'synthetic', tipoProducto: Orden.schema.path('items').schema.path('tipoProducto').enumValues[0], subtotal: 12, ganancia: 12,
    sellerType: 'seller', vendedor: SELLER, ingresoVendedor: 10 };
  const doc = Orden.hydrate(Orden.hydrate({ ...h.state(), items: [item], subtotal: 12, total: 12,
    historial: [{ estado: `payout_obligation_${ID}_${SELLER}`, fecha: new Date() }] }).toObject());
  Orden.collection.updateOne = async (filter, update, options) => {
    writes.push({ filter, update, options }); return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  };
  try {
    doc.$where = { estadoPago: 'pagado', estadoFulfillment: 'entregado', payoutBlocked: { $ne: true },
      'inventoryReservation.needsReconciliation': { $ne: true }, 'inventoryReservation.state': { $ne: 'reconciliation_required' },
      'historial.estado': `payout_obligation_${ID}_${SELLER}` };
    doc.setVendedorPayoutStatus(SELLER, 'procesando'); await doc.save({ w: 'majority' });
    doc.setVendedorPayoutStatus(SELLER, 'pagado', { stripeTransferId: 'tr_synthetic' }); await doc.save({ w: 'majority' });
    assert.equal(writes.length, 2);
    for (const write of writes) {
      assert.equal(write.filter.estadoPago, 'pagado');
      assert.equal(write.filter['inventoryReservation.needsReconciliation'].$ne, true);
      assert.equal(write.filter['historial.estado'], `payout_obligation_${ID}_${SELLER}`);
      assert.equal(write.options.w, 'majority');
      for (const key of Object.keys(write.update.$set || {})) {
        assert.ok(!key.startsWith('inventoryReservation') && key !== 'estadoPago' && key !== 'estadoFulfillment');
      }
    }
    assert.equal(doc.vendedorPayouts[0].stripeTransferId, 'tr_synthetic');
  } finally { Orden.collection.updateOne = original; }
});
test('a real conditional save reporting no matching order is rejected instead of acknowledged', async () => {
  const original = Orden.collection.updateOne;
  Orden.collection.updateOne = async () => ({ acknowledged: true, matchedCount: 0, modifiedCount: 0 });
  try {
    const doc = Orden.hydrate(harness().state()); doc.$where = { payoutBlocked: { $ne: true } };
    doc.setVendedorPayoutStatus(SELLER, 'procesando');
    await assert.rejects(doc.save({ validateBeforeSave: false, w: 'majority' }), e => ['DocumentNotFoundError', 'VersionError'].includes(e.name));
  } finally { Orden.collection.updateOne = original; }
});
test('uncertain transfer does not change payment, reservation, fulfillment or commercial fixtures', async () => {
  const h = harness({ transfer: async () => { throw new Error('synthetic uncertainty'); } });
  const snapshot = copy({ estadoPago: h.state().estadoPago, reservationState: h.state().inventoryReservation.state,
    estadoFulfillment: h.state().estadoFulfillment, items: h.state().items });
  await assert.rejects(h.run('one')); await h.run('two');
  assert.deepEqual({ estadoPago: h.state().estadoPago, reservationState: h.state().inventoryReservation.state,
    estadoFulfillment: h.state().estadoFulfillment, items: h.state().items }, snapshot);
});

test('uncertain errors expose only fixed codes, never original Stripe/persistence messages', async () => {
  const h = harness({ transfer: async () => { throw new Error('SYNTHETIC_PRIVATE_DRIVER_SENTINEL'); } });
  await assert.rejects(h.run('one'), error => {
    assert.equal(error.message, 'PAYOUT_OUTCOME_UNCERTAIN');
    assert.equal(error.publicCode, 'PAYOUT_OUTCOME_UNCERTAIN'); return true;
  });
  assert.ok(!JSON.stringify(h.state()).includes('SYNTHETIC_PRIVATE_DRIVER_SENTINEL'));
});
test('known transfer ID is retained for review after its paid save fails', async () => {
  const h = harness({ failSave: n => n === 2 }); await assert.rejects(h.run('one'));
  assert.equal(h.state().vendedorPayouts[0].stripeTransferId, 'tr_synthetic');
  await h.run('two'); assert.equal(h.calls.length, 1);
});
test('financial parameters changing during preparation do not reach Stripe', async () => {
  const h = harness({ onSave: ({ saves, doc }) => { if (saves === 1) doc.vendedorPayouts[0].monto = 999; } });
  await assert.rejects(h.run('one')); await h.run('two'); assert.equal(h.calls.length, 0);
});
test('an invalid seller account never reaches a durable financial claim or Stripe', async () => {
  const h = harness({ seller: { stripePayoutsEnabled: false } });
  await h.run('one'); assert.equal(h.calls.length, 0); assert.equal(h.counts().claims, 0);
});

test('reconciliation appearing while Stripe accepts transfer blocks the paid save and any new transfer', async () => {
  const h = harness({ transfer: async ({ state }) => {
    state.inventoryReservation.needsReconciliation = true; return { id: 'tr_synthetic' };
  } });
  await assert.rejects(h.run('one')); await h.run('two');
  assert.equal(h.calls.length, 1); assert.equal(h.state().payoutBlocked, true);
  assert.equal(h.state().vendedorPayouts[0].stripeTransferId, 'tr_synthetic');
});
test('existing Mongoose optimistic concurrency rejects a document loaded before the durable claim', async () => {
  assert.equal(Orden.schema.options.optimisticConcurrency, true);
  const stale = Orden.hydrate(harness().state()), original = Orden.collection.updateOne;
  // A real claim increments __v from 0 to 1; no MongoDB connection is made.
  Orden.collection.updateOne = async filter => {
    assert.equal(filter.__v, 0);
    return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
  };
  try {
    stale.setVendedorPayoutStatus(SELLER, 'fallido');
    await assert.rejects(stale.save({ validateBeforeSave: false }), e => e.name === 'VersionError');
  } finally { Orden.collection.updateOne = original; }
});
test('legacy order without a verifiable version cannot claim or transfer', async () => {
  const h = harness({ order: { __v: undefined } });
  await assert.rejects(h.run('one'), e => e.publicCode === 'PAYOUT_VERSION_UNVERIFIED');
  assert.equal(h.counts().claims, 0); assert.equal(h.calls.length, 0);
});

test('scheduler candidate query excludes reconciliation flags without executing a query', () => {
  const filter = Orden.findPayoutEligible().getFilter();
  assert.equal(filter['inventoryReservation.needsReconciliation'].$ne, true);
  assert.equal(filter['inventoryReservation.state'].$ne, 'reconciliation_required');
  assert.equal(filter.payoutBlocked, false);
});
