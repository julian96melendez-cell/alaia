"use strict";

console.log("✅ stripeRoutes cargado con /checkout, /payment-sheet y /webhook");

const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");

const router = express.Router();

const Orden = require("../models/Orden");
const { prepareCheckout, getLifecycle } = require("../services/checkoutLifecycle");
const { toPublicOrder } = require("../dto/publicOrder");
const Producto = require("../models/Producto");
const { proteger } = require("../middleware/auth");
const { verificarFirebase } = require("../middleware/firebaseAuth");
const { calculateCheckoutPricing, normalizeCheckoutItems } = require("../services/checkoutPricing");

const {
  procesarWebhookStripe,
} = require("../payments/stripeWebhookController");

const {
  crearOrdenYCheckoutStripe,
} = require("../controllers/ordenController");

const {
  crearPaymentIntentMobile,
} = require("../payments/stripeService");

// ======================================================
// Config
// ======================================================
const MAX_AMOUNT_CENTS = Number(process.env.STRIPE_MAX_AMOUNT_CENTS || 500000);
const DEFAULT_CURRENCY = "usd";

const ALLOWED_CURRENCIES = new Set([
  "usd",
  "eur",
  "mxn",
  "cop",
  "ars",
  "clp",
  "pen",
  "brl",
]);

// ======================================================
// Helpers
// ======================================================
function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function round2(value) {
  return Math.round(safeNumber(value, 0) * 100) / 100;
}

function normalizeCurrency(value) {
  const currency = safeString(value, DEFAULT_CURRENCY).toLowerCase();

  if (!ALLOWED_CURRENCIES.has(currency)) {
    throw Object.assign(new Error("Moneda no soportada."), {
      statusCode: 400,
    });
  }

  return currency;
}

function toStripeAmount(value) {
  const amount = safeNumber(value, 0);

  if (amount <= 0) {
    throw Object.assign(new Error("Monto inválido."), { statusCode: 400 });
  }

  const cents = Math.round(amount * 100);

  if (!Number.isInteger(cents) || cents <= 0) {
    throw Object.assign(new Error("Monto inválido para Stripe."), {
      statusCode: 400,
    });
  }

  if (MAX_AMOUNT_CENTS > 0 && cents > MAX_AMOUNT_CENTS) {
    throw Object.assign(new Error("Monto excede el máximo permitido."), {
      statusCode: 400,
    });
  }

  return cents;
}

function getClientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.toString?.().split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    ""
  );
}

function cleanMetadataValue(value) {
  return safeString(value).slice(0, 500);
}

function sanitizeMetadata(metadata = {}) {
  const output = {};

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return output;
  }

  for (const [key, value] of Object.entries(metadata)) {
    const cleanKey = safeString(key).slice(0, 40);
    if (!cleanKey) continue;

    if (cleanKey === "_id") continue;

    output[cleanKey] = cleanMetadataValue(value);
  }

  return output;
}

function createMobilePaymentRef() {
  return `MOBILE-${Date.now()}-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;
}

function getRequestId(req) {
  return (
    req.reqId ||
    req.headers["x-request-id"] ||
    req.headers["x-correlation-id"] ||
    crypto.randomUUID()
  );
}

function now() {
  return new Date();
}

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

function sendError(res, req, err) {
  const status =
    Number.isInteger(err?.statusCode) &&
    err.statusCode >= 400 &&
    err.statusCode < 600
      ? err.statusCode
      : 500;

  console.error("❌ STRIPE ROUTE ERROR:", {
    reqId: getRequestId(req),
    status,
    code: err?.code,
    type: err?.type,
  });

  return res.status(status).json({
    ok: false,
    message: status < 500 && !/^Stripe/.test(String(err?.type || "")) ? err.message : "No se pudo procesar la solicitud de Stripe.",
    code: err.publicCode || (/^Stripe/.test(String(err?.type || "")) ? "STRIPE_ERROR" : "CHECKOUT_ERROR"),
    reqId: getRequestId(req),
  });
}

async function buildMongoOrderFromMobilePayload({
  items,
  couponCode = "",
  shippingAddress = {},
  firebaseUserId = "",
  userEmail = "",
  firestoreOrderId = "",
  mobileOrderRef = "",
  metadata = {},
  session = null,
  web = false,
}) {
  const normalizedItems = normalizeCheckoutItems(items);

  const productos = await Producto.find({
    _id: { $in: normalizedItems.map((item) => item.producto) },
    activo: true,
    visible: { $ne: false },
  }, null, session ? { session } : undefined).lean();

  const productosMap = new Map(productos.map((p) => [String(p._id), p]));

  const orderItems = [];
  let totalCostoProveedor = 0;
  let moneda = DEFAULT_CURRENCY;

  for (const item of normalizedItems) {
    const producto = productosMap.get(String(item.producto));

    if (!producto) {
      throw Object.assign(
        new Error(`Producto no disponible: ${item.producto}`),
        { statusCode: 404 }
      );
    }

    if (producto.tipo === "afiliado") {
      throw Object.assign(
        new Error(`El producto "${producto.nombre}" es afiliado y no se puede pagar directo.`),
        { statusCode: 400 }
      );
    }

    const precioUnitario = round2(producto.precioFinal ?? producto.precio ?? 0);
    const costoProveedorUnitario = round2(producto.costoProveedor || 0);
    const cantidad = item.cantidad;

    if (precioUnitario <= 0) {
      throw Object.assign(
        new Error(`Producto "${producto.nombre}" no tiene precio válido.`),
        { statusCode: 400 }
      );
    }

    const productCurrency = normalizeCurrency(producto.moneda || DEFAULT_CURRENCY);
    if (productCurrency !== DEFAULT_CURRENCY) {
      throw Object.assign(new Error("El checkout móvil solo admite productos en USD"), { statusCode: 400 });
    }
    if (producto.gestionStock !== false && (!Number.isFinite(Number(producto.stock)) || Number(producto.stock) < cantidad)) {
      throw Object.assign(new Error("Stock insuficiente"), { statusCode: 409 });
    }
    moneda = productCurrency;

    const itemSubtotal = round2(precioUnitario * cantidad);
    const itemCosto = round2(costoProveedorUnitario * cantidad);

    totalCostoProveedor = round2(totalCostoProveedor + itemCosto);

    const sellerType =
      producto.sellerType === "seller" && producto.vendedor ? "seller" : "platform";

    orderItems.push({
      producto: producto._id,
      nombre: producto.nombre || "Producto",
      cantidad,
      precioUnitario,
      costoProveedorUnitario,
      proveedor: producto.proveedor || "local",
      tipoProducto: producto.tipo || "marketplace",
      sellerType,
      vendedor: sellerType === "seller" ? producto.vendedor : null,
      subtotal: itemSubtotal,
      category: producto.categoria,
      ganancia: round2(itemSubtotal - itemCosto),
      comisionPorcentaje:
        typeof producto.comisionPct === "number" ? producto.comisionPct : undefined,
    });
  }

  const pricing = calculateCheckoutPricing(orderItems, couponCode);
  // Preserve the hardened amount ceiling and reject local Stripe constraints
  // before reserving inventory or attempting any external preparation.
  const amountCents = toStripeAmount(pricing.total);
  if (amountCents < 50) throw Object.assign(new Error("Monto mínimo de pago no alcanzado"), { statusCode: 400 });
  const addressFields = { nombre: "fullName", telefono: "phone", direccion: "street", ciudad: "city", provincia: "state", codigoPostal: "zip" };
  const direccionEntrega = { email: safeString(userEmail).toLowerCase() };
  for (const [field, input] of Object.entries(addressFields)) {
    const value = typeof shippingAddress?.[input] === "string" ? shippingAddress[input].trim() : "";
    if (!value || value.length > 200) throw Object.assign(new Error("Dirección de entrega incompleta o inválida"), { statusCode: 400 });
    direccionEntrega[field] = value;
  }

  const orden = {
    firebaseUserId: safeString(firebaseUserId),
    firestoreOrderId: safeString(firestoreOrderId),
    mobileOrderRef: safeString(mobileOrderRef),
    source: web ? "web_checkout" : "mobile_payment_sheet",

    clienteEmail: safeString(userEmail).toLowerCase(),
    direccionEntrega,

    items: orderItems,

    ...pricing,

    totalCostoProveedor,
    gananciaTotal: round2(pricing.total - totalCostoProveedor),

    moneda,
    metodoPago: "stripe",
    paymentProvider: "stripe",
    estadoPago: "pendiente",
    estadoFulfillment: "pendiente",

    paymentStatusDetail: "mobile_payment_intent_pending",

    historial: [
      {
        estado: "creada",
        fecha: now(),
        source: web ? "web_checkout" : "mobile_payment_sheet",
        meta: {
          firebaseUserId: safeString(firebaseUserId),
          firestoreOrderId: safeString(firestoreOrderId),
          mobileOrderRef: safeString(mobileOrderRef),
          metadata: sanitizeMetadata(metadata),
        },
      },
    ],
  };

  return orden;
}

// ======================================================
// Middleware webhook
// ======================================================
function validarStripeWebhookRequest(req, res, next) {
  const signature = req.headers["stripe-signature"];
  const contentType = (req.headers["content-type"] || "").toLowerCase();

  if (!signature || typeof signature !== "string" || !signature.trim()) {
    return res.status(400).json({
      ok: false,
      message: "Missing stripe-signature header",
      reqId: getRequestId(req),
    });
  }

  if (!contentType.startsWith("application/json")) {
    return res.status(415).json({
      ok: false,
      message: "Unsupported content-type",
      reqId: getRequestId(req),
    });
  }

  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).json({
      ok: false,
      message: "Invalid raw body for Stripe webhook",
      reqId: getRequestId(req),
    });
  }

  next();
}

// ======================================================
// Web Checkout
// POST /api/stripe/checkout
// ======================================================
router.post("/checkout", proteger, async (req, res) => {
  try {
    const uid = `web:${req.usuario._id || req.usuario.id}`;
    const prepared = await getLifecycle("web").prepare({ uid, email: req.usuario.email || "", key: req.headers["idempotency-key"], input: req.body || {},
      buildOrder: async input => ({ ...await buildMongoOrderFromMobilePayload({ ...input, web: true }), usuario: req.usuario._id || req.usuario.id }),
    });
    if (!prepared.checkoutUrl) throw Object.assign(new Error("Checkout pendiente; recupera la misma intención"), { statusCode: 409 });
    return res.status(201).json({ ok: true, data: { ordenId: String(prepared.order._id), url: prepared.checkoutUrl } });
  } catch (err) { return sendError(res, req, err); }
});

// ======================================================
// Mobile PaymentSheet
// POST /api/stripe/payment-sheet
// ======================================================
router.post("/payment-sheet", verificarFirebase, async (req, res) => {
  try {
    const prepared = await prepareCheckout({
      uid: req.firebaseUser.uid,
      email: req.firebaseUser.email,
      key: req.headers["idempotency-key"],
      input: req.body || {},
      buildOrder: buildMongoOrderFromMobilePayload,
    });
    const orden = prepared.order;
    const ordenId = String(orden._id);
    const pricing = { subtotal: orden.subtotal, tax: orden.tax, shipping: orden.shipping, discount: orden.discount, total: orden.total };
    return res.status(201).json({ ok: true, data: { clientSecret: prepared.clientSecret, ordenId, pricing }, clientSecret: prepared.clientSecret, ordenId, pricing });
  } catch (err) { return sendError(res, req, err); }
});

const webOwner = req => `web:${req.usuario._id || req.usuario.id}`;
router.get("/web/checkout-intent", proteger, async (req, res) => {
  try { return res.json({ ok: true, data: intentView(await getLifecycle("web").resolve(webOwner(req), req.headers["idempotency-key"])) }); }
  catch (err) { return sendError(res, req, err); }
});
router.post("/web/checkout-intent/cancel", proteger, async (req, res) => {
  try { return res.json({ ok: true, data: intentView(await getLifecycle("web").cancel(webOwner(req), req.headers["idempotency-key"])) }); }
  catch (err) { return sendError(res, req, err); }
});

function intentView(order) {
  return { order: toPublicOrder(order), reservationState: order.inventoryReservation.state, expiresAt: order.inventoryReservation.expiresAt, needsReconciliation: order.inventoryReservation.needsReconciliation === true };
}
router.get("/checkout-intent", verificarFirebase, async (req, res) => {
  try {
    const order = await getLifecycle().resolve(req.firebaseUser.uid, req.headers["idempotency-key"]);
    return res.json({ ok: true, data: intentView(order) });
  } catch (err) { return sendError(res, req, err); }
});
router.post("/checkout-intent/cancel", verificarFirebase, async (req, res) => {
  try {
    const order = await getLifecycle().cancel(req.firebaseUser.uid, req.headers["idempotency-key"]);
    return res.json({ ok: true, data: intentView(order) });
  } catch (err) { return sendError(res, req, err); }
});

// ======================================================
// Stripe Webhook
// POST /api/stripe/webhook
// ======================================================
router.post("/webhook", validarStripeWebhookRequest, async (req, res) => {
  try {
    await procesarWebhookStripe(req, res);
  } catch (err) {
    console.error("❌ Error en webhook Stripe", {
      reqId: getRequestId(req),
      code: err?.code,
      type: err?.type,
    });

    return res.status(500).json({
      ok: false,
      message: "Webhook processing failed",
      reqId: getRequestId(req),
    });
  }
});

module.exports = router;