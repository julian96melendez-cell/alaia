"use strict";

/**
 * payoutHoldWorker.js
 * -------------------
 * Ejecuta payouts a vendedores SOLO si la orden ya es elegible
 * según la lógica oficial del modelo Orden:
 *
 * - payoutPolicy === "escrow_delivered_hold"
 * - estadoPago === "pagado"
 * - estadoFulfillment === "entregado"
 * - payoutEligibleAt <= ahora
 * - payoutBlocked === false
 * - vendedorPayouts.status en ["pendiente", "fallido"]
 *
 * ✅ Idempotente
 * ✅ Multi-instancia safe
 * ✅ Alineado con Orden.findPayoutEligible()
 * ✅ Fail-safe
 * ✅ No bloquea el proceso
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
};

const INTERVAL_MS = envInt("PAYOUT_SCHEDULER_INTERVAL_MS", 60 * 60 * 1000);
const BATCH_SIZE = envInt("PAYOUT_SCHEDULER_BATCH_SIZE", 50);

function buildLedgerKey() {
  return "payout_scheduler_claim".slice(0, 120);
}

async function tick() {
  if (!FLAGS.ENABLED) return;

  const nowIso = new Date().toISOString();
  const ledgerKey = buildLedgerKey();

  try {
    const candidates = await Orden.findPayoutEligible({ limit: BATCH_SIZE, skip: 0 })
      .select("_id payoutEligibleAt estadoPago estadoFulfillment payoutBlocked vendedorPayouts")
      .lean();

    if (!candidates.length) {
      log("info", "payoutWorker: no candidates", { at: nowIso });
      return;
    }

    log("info", "payoutWorker: candidates found", {
      count: candidates.length,
      at: nowIso,
    });

    for (const o of candidates) {
      const ordenId = String(o._id);

      const reserved = await Orden.updateOne(
        {
          _id: ordenId,
          payoutPolicy: "escrow_delivered_hold",
          payoutBlocked: false,
          estadoPago: "pagado",
          estadoFulfillment: "entregado",
          payoutEligibleAt: { $ne: null, $lte: new Date() },
          "vendedorPayouts.status": { $in: ["pendiente", "fallido"] },
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
                runId: "payout_release",
                at: nowIso,
              },
            },
          },
        }
      );

      if (!reserved?.modifiedCount) {
        continue;
      }

      try {
        await pagarVendedoresDeOrden({
          ordenId,
          mode: "scheduler",
          runId: "payout_release",
          reason: "payoutEligibleAt_reached",
        });

        log("info", "payoutWorker: payout executed", {
          ordenId,
        });
      } catch (err) {
        log("warn", "payoutWorker: payout failed", {
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
    log("error", "payoutWorker: fatal tick error", {
      err: err?.message || String(err),
    });
  }
}

let started = false;
let timer = null;

function start() {
  if (started) return;
  started = true;

  tick().catch(() => {});

  timer = setInterval(() => {
    tick().catch(() => {});
  }, INTERVAL_MS);

  if (typeof timer.unref === "function") timer.unref();

  log("info", "payoutWorker started", {
    enabled: FLAGS.ENABLED,
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