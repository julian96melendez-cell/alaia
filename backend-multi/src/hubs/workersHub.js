"use strict";

/**
 * workersHub.js
 * -------------
 * Punto único donde arrancas todos tus workers (scheduler, jobs, etc.)
 */

function safeStart(name, fn) {
  try {
    if (typeof fn === "function") fn();
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "worker_started", name }));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "worker_failed_to_start", name, err: e?.message || String(e) }));
  }
}

module.exports = function startWorkers() {
  // ✅ Payout hold 7d
  const payoutHold7dWorker = require("../workers/payoutWorker");
  safeStart("payoutHold7dWorker", payoutHold7dWorker.start);
};