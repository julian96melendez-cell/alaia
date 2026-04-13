"use strict";

const payoutHoldWorker = require("./payoutWorker");

// Si también quieres arrancar otros:
// const emailWorker = require("./email.worker");
// const paymentWorker = require("./paymentWorker");

let started = false;

function startWorkers() {
  if (started) return;
  started = true;

  try {
    if (payoutHoldWorker && typeof payoutHoldWorker.start === "function") {
      payoutHoldWorker.start();
    }

    // Si luego quieres:
    // if (emailWorker?.start) emailWorker.start();
    // if (paymentWorker?.start) paymentWorker.start();

    console.log("🧠 Workers started");
  } catch (err) {
    console.error("❌ Error starting workers:", err?.message || err);
    throw err;
  }
}

function stopWorkers() {
  try {
    if (payoutHoldWorker && typeof payoutHoldWorker.stop === "function") {
      payoutHoldWorker.stop();
    }

    // Si luego quieres:
    // if (emailWorker?.stop) emailWorker.stop();
    // if (paymentWorker?.stop) paymentWorker.stop();

    console.log("🛑 Workers stopped");
  } catch (err) {
    console.error("❌ Error stopping workers:", err?.message || err);
  }
}

module.exports = {
  startWorkers,
  stopWorkers,
};