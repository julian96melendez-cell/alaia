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

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeCurrency(v) {
  const c = safeStr(v, "usd").trim().toLowerCase();
  return c || "usd";
}

function now() {
  return new Date();
}

function buildOrderLedgerKey({ mode, runId }) {
  return `payouts_${mode}_${safeStr(runId || "default").slice(0, 80)}`.slice(0, 120);
}

function buildTransferGroup({ ordenId }) {
  return `order_${safeStr(ordenId)}`.slice(0, 120);
}

function isEligibleOrderForPayout(orden) {
  if (!orden) return false;
  if (typeof orden.isPayoutEligible === "function") {
    return orden.isPayoutEligible();
  }

  // Fallback defensivo
  if (orden.payoutBlocked === true) return false;
  if (orden.estadoPago !== "pagado") return false;
  if (orden.estadoFulfillment !== "entregado") return false;
  if (!orden.payoutEligibleAt) return false;

  return new Date(orden.payoutEligibleAt).getTime() <= Date.now();
}

function isRetryMode(mode) {
  return mode === "scheduler";
}

async function reserveGlobalLedger({ ordenId, orderLedgerKey, eventId, reason, mode, runId }) {
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
            mode,
            runId,
          },
        },
      },
    }
  );

  return !!reserve?.modifiedCount;
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

  const finalMode = isRetryMode(mode) ? "scheduler" : "webhook";

  const orderLedgerKey = buildOrderLedgerKey({
    mode: finalMode,
    runId: finalRunId,
  });

  // ======================================================
  // 1) Reservar ledger global por orden + run
  // ======================================================
  const reserved = await reserveGlobalLedger({
    ordenId,
    orderLedgerKey,
    eventId,
    reason,
    mode: finalMode,
    runId: finalRunId,
  });

  if (!reserved) {
    return;
  }

  // ======================================================
  // 2) Cargar orden completa
  // ======================================================
  const orden = await Orden.findById(ordenId);
  if (!orden) return;

  if (orden.payoutBlocked === true) return;

  // En webhook normal no intentamos pagar si la orden aún no es elegible.
  // En scheduler/retry manual sí exigimos elegibilidad real igualmente.
  if (!isEligibleOrderForPayout(orden)) {
    return;
  }

  const moneda = normalizeCurrency(orden.moneda || "usd");
  const transferGroup = buildTransferGroup({ ordenId });

  const payouts = Array.isArray(orden.vendedorPayouts) ? orden.vendedorPayouts : [];
  if (!payouts.length) return;

  for (const payout of payouts) {
    if (!payout?.vendedor) continue;

    const vendedorId = String(payout.vendedor);
    const payoutStatus = safeStr(payout.status, "pendiente");
    const monto = round2(safeNumber(payout.monto, 0));
    const amount = toCents(monto);

    if (!["pendiente", "fallido"].includes(payoutStatus)) {
      continue;
    }

    if (amount <= 0) {
      continue;
    }

    const vendedor = await getSellerUser(vendedorId);
    const sellerValidation = canSellerReceivePayout(vendedor);

    if (!sellerValidation.ok) {
      const blockReason = safeStr(sellerValidation.reason, "seller_not_eligible");

      // Si es un problema estructural del seller, bloqueamos.
      const mustBlock = [
        "seller_role_invalid",
        "seller_account_unavailable",
        "seller_not_approved",
        "missing_stripe_account",
        "stripe_onboarding_incomplete",
        "stripe_charges_disabled",
        "stripe_payouts_disabled",
      ].includes(blockReason);

      if (mustBlock) {
        orden.setVendedorPayoutStatus(vendedorId, "bloqueado", {
          source: "system",
          reason: blockReason,
          mode: finalMode,
          runId: finalRunId,
        });

        orden.pushHistorial("payout_vendor_blocked", {
          vendedor: vendedorId,
          reason: blockReason,
          mode: finalMode,
          runId: finalRunId,
        });

        await orden.save().catch(() => {});
      } else {
        orden.setVendedorPayoutStatus(vendedorId, "fallido", {
          source: "system",
          reason: blockReason,
          mode: finalMode,
          runId: finalRunId,
        });

        orden.pushHistorial("payout_vendor_failed_validation", {
          vendedor: vendedorId,
          reason: blockReason,
          mode: finalMode,
          runId: finalRunId,
        });

        await orden.save().catch(() => {});
      }

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
          destination: safeStr(vendedor.stripeAccountId),
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

  // ======================================================
  // 3) Si todos quedaron pagados => marcar payoutReleasedAt
  // ======================================================
  if (
    Array.isArray(orden.vendedorPayouts) &&
    orden.vendedorPayouts.length > 0 &&
    orden.vendedorPayouts.every((p) => p.status === "pagado")
  ) {
    orden.payoutReleasedAt = orden.payoutReleasedAt || new Date();

    orden.pushHistorial("payouts_released", {
      ordenId: String(orden._id),
      mode: finalMode,
      runId: finalRunId,
      at: now().toISOString(),
    });

    await orden.save().catch(() => {});
  }
};