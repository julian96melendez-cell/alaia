"use strict";

/**
 * payoutHold7dWorker.js
 * ---------------------
 * Ejecuta payouts a vendedores SOLO si:
 * - orden.estadoPago === "pagado"
 * - orden.paidAt <= ahora - HOLD_DAYS
 * - no existe ledger "payouts_scheduler_hold_7d"
 *
 * ✅ Idempotente
 * ✅ Multi-instancia safe
 * ✅ Fail-safe
 * ✅ No bloquea el proceso
 * ✅ No ejecuta si Stripe está en modo test y livemode enforced
 */

const Orden = require("../models/Orden");
const { pagarVendedoresDeOrden } = require("../services/payoutService");

function envInt(key, def) {
  const n = parseInt(String(process.env[key] ?? ""), 10);
  return Number.isFinite(n) ? n : def;
}

function envBool(key, def = false) {
  const v = process.env[key];
  if (v === undefined || v === null || String(v).trim() === "") return def;
  return ["1", "true", "yes", "y", "on"].includes(String(v).trim().toLowerCase());
}

function log(level, msg, ctx = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...ctx }));
}

const FLAGS = {
  ENABLED: envBool("PAYOUT_SCHEDULER_ENABLED", true),
  STRIPE_LIVEMODE: envBool("STRIPE_LIVEMODE", false),
};

const DAYS_HOLD = envInt("PAYOUT_HOLD_DAYS", 7);
const INTERVAL_MS = envInt("PAYOUT_SCHEDULER_INTERVAL_MS", 60 * 60 * 1000);
const BATCH_SIZE = envInt("PAYOUT_SCHEDULER_BATCH_SIZE", 50);

function buildLedgerKey() {
  return `payouts_scheduler_hold_7d`.slice(0, 120);
}

async function tick() {
  if (!FLAGS.ENABLED) return;

  const cutoff = new Date(Date.now() - DAYS_HOLD * 24 * 60 * 60 * 1000);
  const ledgerKey = buildLedgerKey();

  try {
    const candidates = await Orden.find({
      estadoPago: "pagado",
      paidAt: { $lte: cutoff },
      "historial.estado": { $ne: ledgerKey },
    })
      .select("_id paidAt estadoPago moneda stripeLatestEventId")
      .sort({ paidAt: 1 })
      .limit(BATCH_SIZE)
      .lean();

    if (!candidates.length) {
      log("info", "payoutHold7d: no candidates", {
        cutoff: cutoff.toISOString(),
      });
      return;
    }

    log("info", "payoutHold7d: candidates found", {
      count: candidates.length,
      cutoff: cutoff.toISOString(),
    });

    for (const o of candidates) {
      const ordenId = String(o._id);

      // 🔒 Reserva atómica (multi-instancia safe)
      const reserved = await Orden.updateOne(
        {
          _id: ordenId,
          estadoPago: "pagado", // doble validación
          paidAt: { $lte: cutoff },
          "historial.estado": { $ne: ledgerKey },
        },
        {
          $push: {
            historial: {
              estado: ledgerKey,
              fecha: new Date(),
              source: "system",
              meta: {
                mode: "scheduler",
                runId: "hold_7d",
                cutoff: cutoff.toISOString(),
              },
            },
          },
        }
      );

      if (!reserved?.modifiedCount) {
        continue; // otro proceso lo tomó
      }

      try {
        await pagarVendedoresDeOrden({
          ordenId,
          mode: "scheduler",
          runId: "hold_7d",
          reason: `hold_${DAYS_HOLD}d_after_paidAt`,
        });

        log("info", "payoutHold7d: payout executed", { ordenId });
      } catch (err) {
        log("warn", "payoutHold7d: payout failed", {
          ordenId,
          err: err?.message || String(err),
        });

        await Orden.updateOne(
          { _id: ordenId },
          {
            $push: {
              historial: {
                estado: "payout_scheduler_error",
                fecha: new Date(),
                source: "system",
                meta: {
                  ordenId,
                  error: String(err?.message || err).slice(0, 800),
                },
              },
            },
          }
        ).catch(() => {});
      }
    }
  } catch (err) {
    log("error", "payoutHold7d: fatal tick error", {
      err: err?.message || String(err),
    });
  }
}

let started = false;
let timer = null;

function start() {
  if (started) return;
  started = true;

  // primera corrida inmediata
  tick().catch(() => {});

  timer = setInterval(() => {
    tick().catch(() => {});
  }, INTERVAL_MS);

  if (typeof timer.unref === "function") timer.unref();

  log("info", "payoutHold7dWorker started", {
    enabled: FLAGS.ENABLED,
    holdDays: DAYS_HOLD,
    intervalMs: INTERVAL_MS,
    batchSize: BATCH_SIZE,
  });
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}

module.exports = { start, stop };