"use strict";

const Orden = require("../models/Orden");
const Usuario = require("../models/Usuario");

let stripe = null;
try {
  ({ stripe } = require("../payments/stripeService"));
} catch (_) {}

function mustStripe() {
  if (!stripe) {
    throw new Error("Stripe no disponible (stripeService)");
  }
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function toCents(n) {
  return Math.round(round2(n) * 100);
}

function safeStr(v, fallback = "") {
  return v === null || v === undefined ? fallback : String(v);
}

function normalizeCurrency(v) {
  const c = safeStr(v, "usd").trim().toLowerCase();
  return c || "usd";
}

function now() {
  return new Date();
}

function buildTransferGroup({ ordenId }) {
  return `order_${safeStr(ordenId)}`.slice(0, 120);
}

function eligibilityFilter() {
  return {
    payoutBlocked: { $ne: true },
    "inventoryReservation.needsReconciliation": { $ne: true },
    "inventoryReservation.state": { $ne: "reconciliation_required" },
    estadoPago: "pagado", estadoFulfillment: "entregado",
    payoutPolicy: "escrow_delivered_hold",
    payoutEligibleAt: { $ne: null, $lte: new Date() },
  };
}

function isEligibleOrderForPayout(order) {
  return !!order && order.payoutBlocked !== true &&
    order.inventoryReservation?.needsReconciliation !== true &&
    order.inventoryReservation?.state !== "reconciliation_required" &&
    !order.hasPayoutUncertainty() && order.isPayoutEligible();
}

function payoutError(code) {
  return Object.assign(new Error(code), { publicCode: code });
}

async function getSellerUser(vendedorId) {
  if (!vendedorId) return null;

  return Usuario.findById(vendedorId)
    .select(
      [
        "rol",
        "activo",
        "bloqueado",
        "sellerStatus",
        "stripeAccountId",
        "stripeOnboardingComplete",
        "stripeChargesEnabled",
        "stripePayoutsEnabled",
      ].join(" ")
    )
    .lean();
}

function canSellerReceivePayout(usuario) {
  if (!usuario) {
    return { ok: false, reason: "seller_not_found" };
  }

  if (usuario.rol !== "vendedor") {
    return { ok: false, reason: "seller_role_invalid" };
  }

  if (usuario.activo === false || usuario.bloqueado === true) {
    return { ok: false, reason: "seller_account_unavailable" };
  }

  if (
    usuario.sellerStatus !== undefined &&
    usuario.sellerStatus !== null &&
    usuario.sellerStatus !== "approved"
  ) {
    return { ok: false, reason: "seller_not_approved" };
  }

  if (!safeStr(usuario.stripeAccountId)) {
    return { ok: false, reason: "missing_stripe_account" };
  }

  if (usuario.stripeOnboardingComplete !== true) {
    return { ok: false, reason: "stripe_onboarding_incomplete" };
  }

  if (usuario.stripeChargesEnabled !== true) {
    return { ok: false, reason: "stripe_charges_disabled" };
  }

  if (usuario.stripePayoutsEnabled !== true) {
    return { ok: false, reason: "stripe_payouts_disabled" };
  }

  return { ok: true };
}

exports.pagarVendedoresDeOrden = async ({ ordenId, eventId = "", reason = "", mode = "webhook", runId = "" } = {}) => {
  mustStripe();
  if (!ordenId) return;
  const initial = await Orden.findById(ordenId);
  if (!isEligibleOrderForPayout(initial)) return;
  const sellers = [...new Set((initial.vendedorPayouts || []).map(p => String(p.vendedor)))];
  for (const vendedorId of sellers) {
    // Reload for each obligation; never keep an old document across Stripe calls.
    const order = await Orden.findById(ordenId);
    if (!isEligibleOrderForPayout(order)) return;
    const row = order.vendedorPayouts.find(p => String(p.vendedor) === vendedorId);
    if (!row || !["pendiente", "fallido"].includes(row.status)) continue;
    const amount = toCents(row.monto);
    if (!Number.isSafeInteger(amount) || amount <= 0) continue;
    const seller = await getSellerUser(vendedorId);
    if (!canSellerReceivePayout(seller).ok) continue; // no external attempt
    if (!Number.isSafeInteger(order.__v)) throw payoutError("PAYOUT_VERSION_UNVERIFIED");
    const key = `payout_obligation_${order._id}_${vendedorId}`;
    const currency = normalizeCurrency(order.moneda);
    const destination = safeStr(seller.stripeAccountId);
    // Existing nonfinancial history update guard is preserved. Exact snapshots
    // serialize competing claims without bypassing financial query middleware.
    let claim;
    try { claim = await Orden.updateOne({
      _id: order._id, __v: order.__v, ...eligibilityFilter(),
      historial: order.historial.map(h => h.toObject()),
      vendedorPayouts: order.vendedorPayouts.map(p => p.toObject()),
      "historial.estado": { $ne: key },
    }, { $inc: { __v: 1 }, $push: { historial: {
      estado: key, fecha: now(), source: "system",
      meta: { outcome: "uncertain", amount, currency, destination,
        eventId: safeStr(eventId), runId: safeStr(runId), mode: safeStr(mode), reason: safeStr(reason) },
    } } }, { writeConcern: { w: "majority" } });
    } catch (_) { throw payoutError("PAYOUT_CLAIM_UNCERTAIN"); }
    if (claim?.acknowledged !== true) throw payoutError("PAYOUT_CLAIM_UNCERTAIN");
    if (claim.modifiedCount === 0) return;
    if (claim.modifiedCount !== 1) throw payoutError("PAYOUT_CLAIM_UNCERTAIN");

    // Any interruption after the claim leaves a permanent nonretryable signal.
    let observedTransferId = "";
    try {
      const current = await Orden.findById(ordenId);
      if (!current) throw payoutError("PAYOUT_ORDER_UNAVAILABLE");
      current.$where = { ...eligibilityFilter(), "historial.estado": key };
      current.setVendedorPayoutStatus(vendedorId, "procesando", { source: "system" });
      await current.save({ w: "majority" });
      const ready = await Orden.findById(ordenId);
      const readyRow = ready?.vendedorPayouts.find(p => String(p.vendedor) === vendedorId);
      if (!ready || ready.payoutBlocked || ready.inventoryReservation?.needsReconciliation === true ||
          ready.inventoryReservation?.state === "reconciliation_required" || ready.estadoPago !== "pagado" ||
          ready.estadoFulfillment !== "entregado" || readyRow?.status !== "procesando" ||
          toCents(readyRow.monto) !== amount || normalizeCurrency(ready.moneda) !== currency ||
          toCents(current.vendedorPayouts.find(p => String(p.vendedor) === vendedorId)?.monto) !== amount) {
        throw payoutError("PAYOUT_PRETRANSFER_CHANGED");
      }
      const transfer = await stripe.transfers.create({
        amount, currency, destination, transfer_group: buildTransferGroup({ ordenId }),
        // Financial request identity and parameters do not depend on administrative runs.
        metadata: { ordenId: String(order._id), vendedor: vendedorId, obligation: key },
      }, { idempotencyKey: key, maxNetworkRetries: 0 });
      if (!transfer || typeof transfer.id !== "string" || !transfer.id.startsWith("tr_")) {
        throw payoutError("PAYOUT_RESPONSE_UNCERTAIN");
      }
      observedTransferId = transfer.id;
      current.setVendedorPayoutStatus(vendedorId, "pagado", {
        source: "system", stripeTransferId: transfer.id,
        stripeTransferGroup: buildTransferGroup({ ordenId }),
      });
      await current.save({ w: "majority" });
      const confirmation = await Orden.updateOne({
        _id: order._id, __v: current.__v, "historial.estado": key,
        vendedorPayouts: { $elemMatch: { vendedor: vendedorId, status: "pagado", stripeTransferId: transfer.id } },
      }, { $inc: { __v: 1 }, $push: { historial: {
        estado: `${key}_confirmed`, fecha: now(), source: "system",
        meta: { transferId: transfer.id },
      } } }, { writeConcern: { w: "majority" } });
      if (confirmation?.acknowledged !== true || confirmation.modifiedCount !== 1) {
        throw payoutError("PAYOUT_CONFIRMATION_UNCERTAIN");
      }
    } catch (_) {
      // Never turn an ambiguous remote/persistence result into a retryable failure.
      // If this save also fails, the earlier durable claim remains the blocking evidence.
      try {
        const uncertain = await Orden.findById(ordenId);
        if (!uncertain) throw payoutError("PAYOUT_ORDER_UNAVAILABLE");
        uncertain.blockPayouts("payout_outcome_uncertain", { obligation: key });
        if (uncertain.inventoryReservation && !uncertain.inventoryReservation.needsReconciliation) {
          uncertain.inventoryReservation.needsReconciliation = true;
          uncertain.inventoryReservation.reconciliationReason = "payout_outcome_uncertain";
        }
        const payout = uncertain.vendedorPayouts.find(p => String(p.vendedor) === vendedorId);
        if (payout) {
          payout.meta = { ...(payout.meta || {}), outcome: "uncertain", obligation: key };
          if (observedTransferId) payout.stripeTransferId = observedTransferId;
        }
        await uncertain.save({ w: "majority" });
      } catch (_) { throw payoutError("PAYOUT_UNCERTAIN_PERSISTENCE"); }
      throw payoutError("PAYOUT_OUTCOME_UNCERTAIN");
    }
  }
  const completed = await Orden.findById(ordenId);
  if (completed && !completed.hasPayoutUncertainty() && completed.vendedorPayouts.length &&
      completed.vendedorPayouts.every(p => p.status === "pagado")) {
    completed.$where = eligibilityFilter();
    completed.payoutReleasedAt = completed.payoutReleasedAt || now();
    try { await completed.save({ w: "majority" }); }
    catch (_) { throw payoutError("PAYOUT_RELEASE_PERSISTENCE"); }
  }
};
