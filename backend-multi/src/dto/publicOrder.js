"use strict";

// Explicit allowlist: never serialize a Mongo order, item or history metadata directly.
const PUBLIC_ORDER_PROJECTION = [
  "_id", "orderNumber", "total", "moneda",
  "estadoPago", "estadoFulfillment", "createdAt", "updatedAt", "paidAt", "failedAt", "refundedAt",
  "items.cantidad",
  "historial.estado", "historial.fecha",
].join(" ");

const EVENTS = {
  creada: "Orden creada",
  pago_pendiente: "Pago pendiente", pago_pagado: "Pago confirmado",
  pago_fallido: "Pago fallido", pago_reembolsado: "Pago reembolsado",
  pago_reembolsado_parcial: "Reembolso parcial",
  payment_confirmed: "Pago confirmado", payment_failed: "Pago fallido",
  fulfillment_pendiente: "Pedido recibido", fulfillment_procesando: "Preparando tu pedido",
  fulfillment_enviado: "Pedido enviado", fulfillment_entregado: "Pedido entregado",
  fulfillment_cancelado: "Pedido cancelado",
};

function date(value) {
  const parsed = value ? new Date(value) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function publicHistory(history) {
  return (Array.isArray(history) ? history : [])
    .filter((item) => Object.hasOwn(EVENTS, item?.estado) && date(item.fecha))
    .map((item) => ({ estado: item.estado, fecha: date(item.fecha) }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

function publicOrderStatus(order) {
  const fulfillment = {
    procesando: "en_preparacion", enviado: "en_camino", entregado: "entregada", cancelado: "cancelada",
  };
  return fulfillment[order.estadoFulfillment] || (order.estadoPago === "pagado" ? "confirmada" : "pendiente_pago");
}

function toPublicOrder(order) {
  const itemsCount = (Array.isArray(order.items) ? order.items : [])
    .reduce((sum, item) => sum + Number(item.cantidad || 0), 0);
  return {
    _id: String(order._id), orderId: String(order._id), orderNumber: order.orderNumber,
    itemsCount,
    total: order.total, moneda: order.moneda,
    estadoPago: order.estadoPago, estadoFulfillment: order.estadoFulfillment,
    status: publicOrderStatus(order), paymentStatus: order.estadoPago,
    historial: publicHistory(order.historial),
    createdAt: date(order.createdAt), updatedAt: date(order.updatedAt),
    paidAt: date(order.paidAt), failedAt: date(order.failedAt), refundedAt: date(order.refundedAt),
  };
}

function toPublicTimeline(order) {
  let history = publicHistory(order.historial);
  if (!history.length) {
    history = ["creada", `pago_${order.estadoPago}`, `fulfillment_${order.estadoFulfillment}`]
      .filter((estado) => Object.hasOwn(EVENTS, estado))
      .map((estado) => ({ estado, fecha: date(order.createdAt) }));
  }
  const timeline = history.map((item, index) => ({
    id: `${item.estado}-${index}`, type: item.estado, label: EVENTS[item.estado], at: item.fecha,
    timestamp: item.fecha ? new Date(item.fecha).getTime() : null,
    stepIndex: index, isCompleted: index < history.length - 1, isCurrent: index === history.length - 1,
  }));
  return { ordenId: String(order._id), totalSteps: timeline.length, currentStep: timeline.at(-1)?.type || null, timeline };
}

module.exports = { PUBLIC_ORDER_PROJECTION, toPublicOrder, toPublicTimeline };
