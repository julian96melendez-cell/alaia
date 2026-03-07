const { enqueueEmail } = require("../queues/email.queue");

function buildIdempotencyKey(parts = []) {
  return parts.map((x) => String(x || "")).join(":").slice(0, 120);
}

// ✅ Evento: pago confirmado
async function emitOrderPaid({ ordenId, to }) {
  return enqueueEmail("order.paid", {
    ordenId,
    to,
    idempotencyKey: buildIdempotencyKey(["order.paid", ordenId]),
  });
}

// ✅ Evento: fulfillment cambia
async function emitOrderFulfillmentChanged({ ordenId, to, nuevoEstado }) {
  return enqueueEmail("order.fulfillment.changed", {
    ordenId,
    to,
    nuevoEstado,
    idempotencyKey: buildIdempotencyKey([
      "order.fulfillment.changed",
      ordenId,
      nuevoEstado,
    ]),
  });
}

module.exports = {
  emitOrderPaid,
  emitOrderFulfillmentChanged,
};