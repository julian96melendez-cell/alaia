"use strict";

const Orden = require("../models/Orden");
const { pagarVendedoresDeOrden } = require("../services/payoutService");

function log(level, msg, ctx = {}) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...ctx }));
}

function envInt(key, def) {
  const v = parseInt(String(process.env[key] || ""), 10);
  return Number.isFinite(v) ? v : def;
}

/**
 * Scheduler simple (sin Redis)
 * - Cada N minutos, busca órdenes elegibles:
 *   estadoPago=pagado
 *   estadoFulfillment=entregado
 *   payoutDisponibleAt <= ahora
 *   y que NO tengan ledger global payout done
 *
 * Blindaje:
 * - límite de batch para no saturar
 * - try/catch por orden (no rompe loop)
 */
exports.startPayoutScheduler = () => {
  const intervalMs = envInt("PAYOUT_SCHEDULER_INTERVAL_MS", 5 * 60 * 1000); // 5 min
  const batchSize = envInt("PAYOUT_SCHEDULER_BATCH", 25);

  log("info", "PayoutScheduler started", { intervalMs, batchSize });

  setInterval(async () => {
    const startedAt = Date.now();

    try {
      const now = new Date();

      // ledger global usado en payoutService
      // `payouts_done_order_<ordenId>`
      // buscamos con regex por performance básica (ok), o solo filtramos por payoutDisponibleAt
      const ordenes = await Orden.find({
        estadoPago: "pagado",
        estadoFulfillment: "entregado",
        refundedAt: null,
        payoutDisponibleAt: { $ne: null, $lte: now },
        "historial.estado": { $ne: "payouts_done_order_" }, // fallback (no perfecto)
      })
        .select("_id")
        .sort({ payoutDisponibleAt: 1 })
        .limit(batchSize)
        .lean();

      if (!ordenes.length) {
        log("info", "PayoutScheduler tick (no orders)", { tookMs: Date.now() - startedAt });
        return;
      }

      log("info", "PayoutScheduler tick", { count: ordenes.length });

      for (const o of ordenes) {
        try {
          await pagarVendedoresDeOrden({
            ordenId: String(o._id),
            reason: "scheduler_entregado_plus_7d",
            eventId: "scheduler",
          });
        } catch (e) {
          log("warn", "PayoutScheduler order failed (non-blocking)", {
            ordenId: String(o._id),
            err: e?.message || String(e),
          });
        }
      }

      log("info", "PayoutScheduler done", { tookMs: Date.now() - startedAt });
    } catch (err) {
      log("error", "PayoutScheduler tick error", { err: err?.message || String(err) });
    }
  }, intervalMs);
};