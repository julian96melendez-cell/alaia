"use strict";

const Orden = require("../models/Orden");
const Vendedor = require("../models/Vendedor");

let stripe = null;
try {
  ({ stripe } = require("../payments/stripeService"));
} catch (_) {
  try {
    ({ stripe } = require("../controllers/stripeService"));
  } catch (_) {}
}

function mustStripe() {
  if (!stripe) throw new Error("Stripe no disponible (stripeService)");
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

function buildOrderLedgerKey({ mode, runId }) {
  return `payouts_${mode}_${safeStr(runId || "default").slice(0, 80)}`.slice(0, 120);
}

function buildTransferGroup({ ordenId }) {
  return `order_${safeStr(ordenId)}`.slice(0, 120);
}

exports.pagarVendedoresDeOrden = async ({
  ordenId,
  eventId = "",
  reason = "",
  mode = "webhook",
  runId = "",
} = {}) => {
  mustStripe();

  if (!ordenId) return;

  const finalRunId =
    safeStr(runId || eventId || "").trim() ||
    (mode === "scheduler" ? "payout_release" : "event");

  const finalMode = mode === "scheduler" ? "scheduler" : "webhook";
  const orderLedgerKey = buildOrderLedgerKey({
    mode: finalMode,
    runId: finalRunId,
  });

  // ======================================================
  // 1) Reservar ledger global por orden + run
  // ======================================================
  const reserve = await Orden.updateOne(
    { _id: ordenId, "historial.estado": { $ne: orderLedgerKey } },
    {
      $push: {
        historial: {
          estado: orderLedgerKey,
          fecha: new Date(),
          source: "system",
          meta: {
            eventId: safeStr(eventId),
            reason: safeStr(reason),
            mode: finalMode,
            runId: finalRunId,
          },
        },
      },
    }
  );

  if (!reserve?.modifiedCount) {
    return;
  }

  // ======================================================
  // 2) Cargar orden completa
  // ======================================================
  const orden = await Orden.findById(ordenId);
  if (!orden) return;

  if (orden.estadoPago !== "pagado") return;
  if (orden.payoutBlocked === true) return;

  const moneda = normalizeCurrency(orden.moneda || "usd");
  const transferGroup = buildTransferGroup({ ordenId });

  const payouts = Array.isArray(orden.vendedorPayouts) ? orden.vendedorPayouts : [];
  if (!payouts.length) return;

  for (const payout of payouts) {
    if (!payout?.vendedor) continue;

    const vendedorId = String(payout.vendedor);
    const payoutStatus = safeStr(payout.status, "pendiente");

    if (!["pendiente", "fallido"].includes(payoutStatus)) {
      continue;
    }

    const monto = round2(payout.monto || 0);
    const amount = toCents(monto);
    if (amount <= 0) continue;

    const vendedor = await Vendedor.findOne({ usuario: vendedorId }).lean();
    if (!vendedor?.stripeAccountId) {
      orden.setVendedorPayoutStatus(vendedorId, "fallido", {
        source: "system",
        reason: "missing_stripe_account",
        mode: finalMode,
        runId: finalRunId,
      });
      await orden.save().catch(() => {});
      continue;
    }

    if (safeStr(vendedor.estado, "pendiente") !== "activo") {
      orden.setVendedorPayoutStatus(vendedorId, "bloqueado", {
        source: "system",
        reason: "vendor_not_active",
        mode: finalMode,
        runId: finalRunId,
      });
      await orden.save().catch(() => {});
      continue;
    }

    if (vendedor.puedeRetirar === false || vendedor.payoutsEnabled === false) {
      orden.setVendedorPayoutStatus(vendedorId, "bloqueado", {
        source: "system",
        reason: "vendor_payouts_disabled",
        mode: finalMode,
        runId: finalRunId,
      });
      await orden.save().catch(() => {});
      continue;
    }

    try {
      orden.setVendedorPayoutStatus(vendedorId, "procesando", {
        source: "system",
        mode: finalMode,
        runId: finalRunId,
      });
      await orden.save();

      const idemKey = `transfer_${ordenId}_${vendedorId}_${finalRunId}`.slice(0, 255);

      const transfer = await stripe.transfers.create(
        {
          amount,
          currency: moneda,
          destination: vendedor.stripeAccountId,
          transfer_group: transferGroup,
          metadata: {
            ordenId: safeStr(ordenId),
            vendedor: vendedorId,
            mode: finalMode,
            runId: finalRunId,
            reason: safeStr(reason),
          },
        },
        { idempotencyKey: idemKey }
      );

      orden.setVendedorPayoutStatus(vendedorId, "pagado", {
        source: "system",
        stripeTransferId: transfer?.id || "",
        stripeTransferGroup: transferGroup,
        mode: finalMode,
        runId: finalRunId,
      });

      orden.pushHistorial("payout_transfer_ok", {
        vendedor: vendedorId,
        stripeAccountId: safeStr(vendedor.stripeAccountId),
        transferId: transfer?.id || "",
        transferGroup,
        amount,
        currency: moneda,
        mode: finalMode,
        runId: finalRunId,
      });

      await orden.save();
    } catch (err) {
      orden.setVendedorPayoutStatus(vendedorId, "fallido", {
        source: "system",
        mode: finalMode,
        runId: finalRunId,
        error: safeStr(err?.message || err).slice(0, 800),
      });

      orden.pushHistorial("payout_transfer_error", {
        vendedor: vendedorId,
        amount,
        currency: moneda,
        mode: finalMode,
        runId: finalRunId,
        error: safeStr(err?.message || err).slice(0, 800),
      });

      await orden.save().catch(() => {});
    }
  }

  // Si todos los payouts quedaron pagados, marcar releasedAt
  if (
    Array.isArray(orden.vendedorPayouts) &&
    orden.vendedorPayouts.length > 0 &&
    orden.vendedorPayouts.every((p) => p.status === "pagado")
  ) {
    orden.payoutReleasedAt = orden.payoutReleasedAt || new Date();
    await orden.save().catch(() => {});
  }
};