// ======================================================
// ordenRealtimeController.js — SSE Stream (ULTRA FINAL)
// ======================================================

const mongoose = require("mongoose");
const Orden = require("../models/Orden");

const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// ordenId -> Set(res)
const STREAMS = new Map();

// ======================================================
// UTILS
// ======================================================
function send(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function addClient(ordenId, res) {
  if (!STREAMS.has(ordenId)) {
    STREAMS.set(ordenId, new Set());
  }
  STREAMS.get(ordenId).add(res);
}

function removeClient(ordenId, res) {
  const set = STREAMS.get(ordenId);
  if (!set) return;

  set.delete(res);
  if (set.size === 0) {
    STREAMS.delete(ordenId);
  }
}

// ======================================================
// SSE CONNECT
// ======================================================
exports.conectarOrdenStream = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isObjectId(id)) {
      return res.status(400).json({
        ok: false,
        message: "ID inválido",
      });
    }

    // 🔥 HEADERS PRODUCTION SAFE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // nginx fix

    res.flushHeaders?.();

    addClient(id, res);

    console.log("🟢 SSE conectado:", id);

    // ==================================================
    // SNAPSHOT
    // ==================================================
    const orden = await Orden.findById(id)
      .select("_id historial estadoPago estadoFulfillment createdAt")
      .lean();

    if (!orden) {
      send(res, { type: "error", message: "Orden no encontrada" });
      removeClient(id, res);
      return res.end();
    }

    send(res, { type: "snapshot", data: orden });

    // ==================================================
    // HEARTBEAT
    // ==================================================
    const heartbeat = setInterval(() => {
      try {
        send(res, { type: "ping", at: new Date().toISOString() });
      } catch {}
    }, 25000);

    // ==================================================
    // CLOSE
    // ==================================================
    req.on("close", () => {
      console.log("🔴 SSE cerrado:", id);
      clearInterval(heartbeat);
      removeClient(id, res);
    });
  } catch (err) {
    console.error("❌ SSE error:", err);
    try {
      res.end();
    } catch {}
  }
};

// ======================================================
// EMIT REALTIME
// ======================================================
exports.emitOrdenUpdate = (orden) => {
  try {
    if (!orden) return;

    const ordenId = String(orden._id || orden.id);
    const clients = STREAMS.get(ordenId);

    if (!clients || clients.size === 0) return;

    const payload = {
      _id: orden._id,
      historial: orden.historial,
      estadoPago: orden.estadoPago,
      estadoFulfillment: orden.estadoFulfillment,
      createdAt: orden.createdAt,
    };

    const message = JSON.stringify({
      type: "update",
      data: payload,
    });

    for (const res of clients) {
      try {
        res.write(`data: ${message}\n\n`);
      } catch {}
    }

    console.log("📡 SSE emit:", ordenId);
  } catch (err) {
    console.log("emit error:", err.message);
  }
};