// ==========================================================
// ordenTimelineController.js — Timeline Público (AMAZON LEVEL)
// ==========================================================
//
// ✅ Timeline público tipo Amazon / MercadoLibre / Shopify
// ✅ Basado en orden.historial (fuente única de verdad)
// ✅ Compatible con historial viejo y nuevo
// ✅ Fallbacks inteligentes (nunca timeline vacío)
// ✅ Orden cronológico garantizado
// ✅ Mensajes humanos + flags para frontend
// ✅ NO requiere autenticación
//
// Ruta:
//   GET /api/ordenes/public/:id/timeline
// ==========================================================

const mongoose = require("mongoose");
const Orden = require("../models/Orden");

// ----------------------------------------------------------
// Utils base
// ----------------------------------------------------------
const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const send = (res, statusCode, payload) =>
  res.status(statusCode).json(payload);

const nowISO = () => new Date().toISOString();

// ----------------------------------------------------------
// Diccionario de estados → lenguaje humano (UX)
// ----------------------------------------------------------
function humanizeEstado(estado) {
  const map = {
    // Core
    creada: "Orden creada",

    // Pago
    pago_pendiente: "Pago pendiente",
    pago_pagado: "Pago confirmado",
    pago_fallido: "Pago fallido",
    pago_reembolsado: "Pago reembolsado",

    // Fulfillment
    fulfillment_pendiente: "Pedido recibido",
    fulfillment_procesando: "Preparando tu pedido",
    fulfillment_enviado: "Pedido enviado",
    fulfillment_entregado: "Pedido entregado",
    fulfillment_cancelado: "Pedido cancelado",

    // Admin
    admin_update: "Actualización del administrador",

    // Emails (ledger)
    email_fulfillment_pendiente: "Correo: pedido recibido",
    email_fulfillment_procesando: "Correo: pedido en preparación",
    email_fulfillment_enviado: "Correo: pedido enviado",
    email_fulfillment_entregado: "Correo: pedido entregado",
    email_payment_pagado: "Correo: pago confirmado",
  };

  return map[estado] || estado.replace(/_/g, " ");
}

// ----------------------------------------------------------
// Normaliza historial crudo → timeline limpio
// ----------------------------------------------------------
function normalizeHistorial(historial) {
  const h = Array.isArray(historial) ? historial : [];

  return h
    .map((x, index) => {
      const estado = String(x?.estado || "unknown");
      const fecha = x?.fecha ? new Date(x.fecha) : null;

      return {
        id: `${estado}-${index}`,
        type: estado,
        label: humanizeEstado(estado),
        at: fecha ? fecha.toISOString() : null,
        timestamp: fecha ? fecha.getTime() : null,
        meta: x?.meta || null,
      };
    })
    .filter((x) => x.at) // solo eventos con fecha válida
    .sort((a, b) => a.timestamp - b.timestamp);
}

// ----------------------------------------------------------
// Construye timeline mínimo si historial no existe
// ----------------------------------------------------------
function buildFallbackTimeline(orden) {
  const createdAt = orden.createdAt
    ? new Date(orden.createdAt).toISOString()
    : nowISO();

  return [
    {
      id: "creada",
      type: "creada",
      label: humanizeEstado("creada"),
      at: createdAt,
      meta: null,
    },
    {
      id: `pago_${orden.estadoPago || "pendiente"}`,
      type: `pago_${orden.estadoPago || "pendiente"}`,
      label: humanizeEstado(`pago_${orden.estadoPago || "pendiente"}`),
      at: createdAt,
      meta: null,
    },
    {
      id: `fulfillment_${orden.estadoFulfillment || "pendiente"}`,
      type: `fulfillment_${orden.estadoFulfillment || "pendiente"}`,
      label: humanizeEstado(
        `fulfillment_${orden.estadoFulfillment || "pendiente"}`
      ),
      at: createdAt,
      meta: null,
    },
  ];
}

// ----------------------------------------------------------
// Enriquecer timeline para frontend (Amazon-like)
// ----------------------------------------------------------
function enrichTimeline(timeline) {
  const lastIndex = timeline.length - 1;

  return timeline.map((step, index) => ({
    ...step,
    stepIndex: index,
    isCompleted: index < lastIndex,
    isCurrent: index === lastIndex,
  }));
}

// ----------------------------------------------------------
// Controller principal
// ----------------------------------------------------------
exports.obtenerTimelinePublico = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isObjectId(id)) {
      return send(res, 400, {
        ok: false,
        message: "ID inválido",
      });
    }

    const orden = await Orden.findById(id)
      .select("_id historial createdAt estadoPago estadoFulfillment")
      .lean();

    if (!orden) {
      return send(res, 404, {
        ok: false,
        message: "Orden no encontrada",
      });
    }

    // ----------------------------------------------
    // Construir timeline principal
    // ----------------------------------------------
    let timeline = normalizeHistorial(orden.historial);

    // Fallback absoluto (orden vieja o corrupta)
    if (!timeline.length) {
      timeline = buildFallbackTimeline(orden);
    }

    // Enriquecer para frontend
    const enriched = enrichTimeline(timeline);

    return send(res, 200, {
      ok: true,
      message: "Timeline público",
      data: {
        ordenId: orden._id,
        totalSteps: enriched.length,
        currentStep: enriched.find((x) => x.isCurrent)?.type || null,
        timeline: enriched,
      },
    });
  } catch (err) {
    console.error("❌ obtenerTimelinePublico error:", err);

    return send(res, 500, {
      ok: false,
      message: "Error interno",
    });
  }
};