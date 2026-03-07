const Orden = require("../models/Orden");
const { emitOrdenUpdate } = require("../controllers/ordenRealtimeController");

/**
 * =====================================================
 * NOTIFICADOR CENTRAL DE ORDENES (ENTERPRISE CORE)
 * =====================================================
 */

async function notifyOrderChange(orden) {
  try {
    if (!orden) return;

    const ordenId = String(orden._id);

    // Emitir realtime SSE
    emitOrdenUpdate(ordenId, {
      _id: orden._id,
      historial: orden.historial,
      estadoPago: orden.estadoPago,
      estadoFulfillment: orden.estadoFulfillment,
      createdAt: orden.createdAt,
    });

    // 🧠 Aquí luego conectaremos:
    // - Push notifications
    // - Email
    // - SMS
    // - Webhooks externos

    console.log("📡 Orden actualizada → emit realtime:", ordenId);
  } catch (err) {
    console.error("notifyOrderChange error", err);
  }
}

/**
 * Hook automático global
 * Se ejecuta después de cada save
 */
Orden.schema.post("save", function (doc) {
  notifyOrderChange(doc);
});

module.exports = {
  notifyOrderChange,
};