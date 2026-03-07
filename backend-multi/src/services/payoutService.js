"use strict";

const Orden = require("../models/Orden");
const Vendedor = require("../models/Vendedor");

// Usa tu stripeService actual (ajusta el path si está en otro sitio)
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

// Ledger helpers
function buildOrderLedgerKey({ mode, runId }) {
  // mode: "webhook" | "scheduler"
  // runId: identificador estable del “tipo de corrida”
  return `payouts_${mode}_${safeStr(runId || "default").slice(0, 80)}`.slice(0, 120);
}

function buildItemLedgerKey({ vendedorId, ordenId, itemKey }) {
  // itemKey debe ser determinista aunque item no tenga _id
  return `payout_item_${safeStr(vendedorId)}_${safeStr(ordenId)}_${safeStr(itemKey)}`.slice(0, 160);
}

function normalizeCurrency(v) {
  const c = safeStr(v, "usd").trim().toLowerCase();
  return c || "usd";
}

/**
 * =========================================================
 * 🔥 PAYOUT SERVICE — BLINDADO + 7 DÍAS READY
 * =========================================================
 *
 * ✅ Idempotente por orden (ledger atómico)
 * ✅ Idempotente por item (ledger atómico)
 * ✅ Stripe idempotencyKey estable (sin depender de item._id)
 * ✅ No usa Producto.populate (usa snapshot de Orden.items)
 * ✅ Validación de vendedor (estado/KYC/flags)
 * ✅ Fail-safe: errores por item no rompen el proceso
 *
 * =========================================================
 *
 * Params:
 * - ordenId: required
 * - mode: "webhook" | "scheduler" (default "webhook")
 * - runId: string estable para idempotencia global por orden
 *          Ej: eventId (webhook) o "hold_7d" (scheduler)
 * - reason: texto libre
 */
exports.pagarVendedoresDeOrden = async ({
  ordenId,
  eventId = "",
  reason = "",
  mode = "webhook",
  runId = "",
} = {}) => {
  mustStripe();

  if (!ordenId) return;

  // Para compatibilidad: si viene eventId y no runId, úsalo como runId
  const finalRunId = safeStr(runId || eventId || "").trim() || (mode === "scheduler" ? "hold_7d" : "event");
  const finalMode = mode === "scheduler" ? "scheduler" : "webhook";

  // 1) Validar orden
  const ordenLean = await Orden.findById(ordenId).lean();
  if (!ordenLean) return;

  // Solo si pagada
  if (ordenLean.estadoPago !== "pagado") return;

  // 2) Ledger global de orden (atómico) para NO repetir
  const orderLedgerKey = buildOrderLedgerKey({ mode: finalMode, runId: finalRunId });

  const reserve = await Orden.updateOne(
    { _id: ordenId, "historial.estado": { $ne: orderLedgerKey } },
    {
      $push: {
        historial: {
          estado: orderLedgerKey,
          fecha: new Date(),
          source: "system",
          meta: { eventId: safeStr(eventId), reason: safeStr(reason), mode: finalMode, runId: finalRunId },
        },
      },
    }
  );

  if (!reserve?.modifiedCount) {
    // ya se ejecutó este payout para esa orden+runId
    return;
  }

  // 3) Releer orden (con items)
  const ordenFull = await Orden.findById(ordenId).lean();
  if (!ordenFull) return;

  const moneda = normalizeCurrency(ordenFull.moneda || "usd");
  const items = Array.isArray(ordenFull.items) ? ordenFull.items : [];

  // 4) Iterar items (SIN populate Producto)
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    if (!item) continue;

    // SOLO productos de vendedores externos
    // (en tu Orden.js: item.sellerType existe)
    if (safeStr(item.sellerType, "platform") !== "seller") continue;

    const vendedorId = item.vendedor ? safeStr(item.vendedor) : "";
    if (!vendedorId) continue;

    // Validar vendedor en DB
    const vendedor = await Vendedor.findOne({ usuario: vendedorId }).lean();
    if (!vendedor?.stripeAccountId) continue;

    // ✅ Blindaje extra (seguridad máxima)
    // - Debe estar activo
    // - Debe permitir retirar
    // - Stripe payouts enabled
    if (safeStr(vendedor.estado, "pendiente") !== "activo") continue;
    if (vendedor.puedeRetirar === false) continue;
    if (vendedor.payoutsEnabled === false) continue;

    const ingreso = round2(item.ingresoVendedor || 0);
    const amount = toCents(ingreso);
    if (amount <= 0) continue;

    // ItemKey determinista (NO depende de item._id)
    // Usa: index + productoId + cantidad + subtotal (muy estable)
    const productoId = item.producto ? safeStr(item.producto) : "no_producto";
    const itemKey = `${idx}_${productoId}_${safeStr(item.cantidad)}_${safeStr(item.subtotal)}`;

    // 5) Ledger por item (atómico) para evitar duplicado por item
    const itemLedgerKey = buildItemLedgerKey({
      vendedorId,
      ordenId,
      itemKey,
    });

    const reserveItem = await Orden.updateOne(
      { _id: ordenId, "historial.estado": { $ne: itemLedgerKey } },
      {
        $push: {
          historial: {
            estado: itemLedgerKey,
            fecha: new Date(),
            source: "system",
            meta: {
              vendedor: vendedorId,
              producto: productoId,
              amount,
              currency: moneda,
              eventId: safeStr(eventId),
              reason: safeStr(reason),
              mode: finalMode,
              runId: finalRunId,
              idx,
            },
          },
        },
      }
    );

    if (!reserveItem?.modifiedCount) {
      // ya se pagó ese item
      continue;
    }

    try {
      // 6) Stripe Transfer (Connect)
      // IdempotencyKey estable por orden + vendedor + itemKey
      const idemKey = `transfer_${ordenId}_${vendedorId}_${itemKey}`.slice(0, 255);

      const transfer = await stripe.transfers.create(
        {
          amount,
          currency: moneda,
          destination: vendedor.stripeAccountId,
          metadata: {
            ordenId: safeStr(ordenId),
            vendedor: vendedorId,
            productoId: productoId,
            itemNombre: safeStr(item.nombre || ""),
            itemIndex: String(idx),
            mode: finalMode,
            runId: finalRunId,
          },
        },
        { idempotencyKey: idemKey }
      );

      // Historial OK
      await Orden.updateOne(
        { _id: ordenId },
        {
          $push: {
            historial: {
              estado: "payout_transfer_ok",
              fecha: new Date(),
              source: "system",
              meta: {
                vendedor: vendedorId,
                stripeAccountId: safeStr(vendedor.stripeAccountId),
                transferId: transfer?.id || "",
                amount,
                currency: moneda,
                idx,
                itemKey,
                mode: finalMode,
                runId: finalRunId,
              },
            },
          },
        }
      );
    } catch (err) {
      // Fail-safe: no rompe el loop
      await Orden.updateOne(
        { _id: ordenId },
        {
          $push: {
            historial: {
              estado: "payout_transfer_error",
              fecha: new Date(),
              source: "system",
              meta: {
                vendedor: vendedorId,
                amount,
                currency: moneda,
                idx,
                itemKey,
                mode: finalMode,
                runId: finalRunId,
                error: safeStr(err?.message || err).slice(0, 800),
              },
            },
          },
        }
      );
    }
  }
};