// src/services/orderEventsService.js
// ======================================================
// orderEventsService.js — Event Engine (NO REDIS) PRO
// ======================================================
// ✅ Cola en memoria (simple y estable)
// ✅ Handlers por evento (order.paid, order.refunded, etc.)
// ✅ Aislamiento: si un handler falla, no rompe los demás
// ✅ Logs estructurados
// ✅ Listo para migrar a BullMQ/Redis luego
// ======================================================

const Orden = require("../models/Orden");

// ------------------------------
// Logger
// ------------------------------
function log(level, msg, ctx = {}) {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      msg,
      ...ctx,
    })
  );
}

// ------------------------------
// Cola simple en memoria
// ------------------------------
const queue = [];
let running = false;

function enqueue(job) {
  queue.push(job);
  flush().catch(() => {});
}

async function flush() {
  if (running) return;
  running = true;

  while (queue.length) {
    const job = queue.shift();
    try {
      await job();
    } catch (e) {
      log("error", "orderEvents job failed", { err: e?.message || String(e) });
    }
  }

  running = false;
}

// ------------------------------
// Registro de handlers
// ------------------------------
const handlers = {
  "order.paid": [],
  "order.refunded": [],
  "order.payment_failed": [],
  "order.fulfillment_changed": [],
};

function on(eventName, fn) {
  if (!handlers[eventName]) handlers[eventName] = [];
  handlers[eventName].push(fn);
}

// ------------------------------
// Emit (ejecuta handlers aislados)
// ------------------------------
function emit(eventName, payload) {
  const list = handlers[eventName] || [];

  enqueue(async () => {
    log("info", "event.emit", { eventName, payload });

    for (const fn of list) {
      try {
        await fn(payload);
      } catch (e) {
        log("warn", "event.handler_failed", {
          eventName,
          err: e?.message || String(e),
        });
      }
    }
  });
}

// ======================================================
// HANDLERS PRO (primera tanda)
// ======================================================

// 1) Cuando se paga una orden: ejemplo de acción pro
on("order.paid", async ({ ordenId, reason, eventId }) => {
  // Relee orden para trabajo offline (sin depender del webhook)
  const orden = await Orden.findById(ordenId).lean();
  if (!orden) return;

  log("info", "handler.order.paid", {
    ordenId,
    total: orden.total,
    moneda: orden.moneda,
    reason,
    eventId,
  });

  // Aquí luego conectamos:
  // - notificación admin
  // - analytics
  // - inventario
  // - proveedor
});

// ======================================================
// API del service
// ======================================================
function emitOrderPaid({ ordenId, reason = "", eventId = "" }) {
  emit("order.paid", { ordenId, reason, eventId });
}

module.exports = {
  on,
  emit,
  emitOrderPaid,
};