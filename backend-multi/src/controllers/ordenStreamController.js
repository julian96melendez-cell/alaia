// ======================================================
// ordenStreamController.js — Tracking Real-Time (SSE)
// ======================================================

const Orden = require("../models/Orden");

const clients = new Map(); // ordenId => Set(res)

function send(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

exports.streamOrden = async (req, res) => {
  const { id: ordenId } = req.params;

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  if (!clients.has(ordenId)) {
    clients.set(ordenId, new Set());
  }

  clients.get(ordenId).add(res);

  // Enviar snapshot inicial
  try {
    const orden = await Orden.findById(ordenId)
      .select("historial estadoPago estadoFulfillment")
      .lean();

    if (orden) {
      send(res, {
        type: "snapshot",
        data: orden,
      });
    }
  } catch {}

  req.on("close", () => {
    clients.get(ordenId)?.delete(res);
    if (clients.get(ordenId)?.size === 0) {
      clients.delete(ordenId);
    }
  });
};

// 🔥 Emitir evento desde cualquier parte del backend
exports.emitOrdenUpdate = (ordenId, payload) => {
  const subs = clients.get(String(ordenId));
  if (!subs) return;

  for (const res of subs) {
    send(res, {
      type: "update",
      data: payload,
    });
  }
};