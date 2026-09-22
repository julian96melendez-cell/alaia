"use strict";

console.log("✅ stripeRoutes cargado con /checkout, /payment-sheet y /webhook");

const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");

const router = express.Router();

const Orden = require("../models/Orden");
const Producto = require("../models/Producto");

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
    message: err?.message,
    code: err?.code,
    type: err?.type,
  });

  return res.status(status).json({
    ok: false,
    message: err?.message || "No se pudo procesar la solicitud de Stripe.",
    reqId: getRequestId(req),
  });
}

function normalizeMobileItems(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    throw Object.assign(
      new Error("Debes enviar items para crear una orden móvil en Mongo."),
      { statusCode: 400 }
    );
  }

  return items.map((item, index) => {
    const producto = safeString(item.producto || item.productId || item.id);
    const cantidad = Math.max(1, parseInt(item.cantidad || item.quantity, 10) || 1);

    if (!producto || !isObjectId(producto)) {
      throw Object.assign(
        new Error(
          `Item inválido en posición ${index}. El producto debe ser un ObjectId de Mongo.`
        ),
        { statusCode: 400 }
      );
    }

    return { producto, cantidad };
  });
}

async function buildMongoOrderFromMobilePayload({
  items,
  tax = 0,
  shipping = 0,
  discount = 0,
  currency = DEFAULT_CURRENCY,
  firebaseUserId = "",
  userEmail = "",
  firestoreOrderId = "",
  mobileOrderRef = "",
  metadata = {},
}) {
  const normalizedItems = normalizeMobileItems(items);

  const productos = await Producto.find({
    _id: { $in: normalizedItems.map((item) => item.producto) },
    activo: true,
    visible: { $ne: false },
  }).lean();

  const productosMap = new Map(productos.map((p) => [String(p._id), p]));

  const orderItems = [];
  let subtotal = 0;
  let totalCostoProveedor = 0;
  let moneda = normalizeCurrency(currency);

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

    moneda = normalizeCurrency(producto.moneda || moneda);

    const itemSubtotal = round2(precioUnitario * cantidad);
    const itemCosto = round2(costoProveedorUnitario * cantidad);

    subtotal = round2(subtotal + itemSubtotal);
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
      ganancia: round2(itemSubtotal - itemCosto),
      comisionPorcentaje:
        typeof producto.comisionPct === "number" ? producto.comisionPct : undefined,
    });
  }

  const cleanTax = round2(Math.max(0, safeNumber(tax, 0)));
  const cleanShipping = round2(Math.max(0, safeNumber(shipping, 0)));
  const cleanDiscount = round2(Math.max(0, safeNumber(discount, 0)));
  const total = round2(subtotal + cleanTax + cleanShipping - cleanDiscount);

  if (total <= 0) {
    throw Object.assign(new Error("Total de orden inválido."), {
      statusCode: 400,
    });
  }

  const orden = await Orden.create({
    firebaseUserId: safeString(firebaseUserId),
    firestoreOrderId: safeString(firestoreOrderId),
    mobileOrderRef: safeString(mobileOrderRef),
    source: "mobile_payment_sheet",

    clienteEmail: safeString(userEmail).toLowerCase(),
    direccionEntrega: {
      email: safeString(userEmail).toLowerCase(),
    },

    items: orderItems,

    subtotal,
    tax: cleanTax,
    shipping: cleanShipping,
    discount: cleanDiscount,
    total,

    totalCostoProveedor,
    gananciaTotal: round2(total - totalCostoProveedor),

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
        source: "mobile_payment_sheet",
        meta: {
          firebaseUserId: safeString(firebaseUserId),
          firestoreOrderId: safeString(firestoreOrderId),
          mobileOrderRef: safeString(mobileOrderRef),
          metadata: sanitizeMetadata(metadata),
        },
      },
    ],
  });

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
router.post("/checkout", crearOrdenYCheckoutStripe);

// ======================================================
// Mobile PaymentSheet
// POST /api/stripe/payment-sheet
// ======================================================
router.post("/payment-sheet", async (req, res) => {
  let orden = null;

  try {
    const {
      amount,
      currency = DEFAULT_CURRENCY,
      orderId = "",
      ordenId = "",
      userId = "",
      userEmail = "",
      email = "",
      items = [],
      subtotal = 0,
      tax = 0,
      shipping = 0,
      discount = 0,
      metadata = {},
    } = req.body || {};

    const clientOrderRef =
      safeString(orderId || ordenId) || createMobilePaymentRef();

    const finalUserId = safeString(userId);
    const finalEmail = safeString(userEmail || email);
    const finalCurrency = normalizeCurrency(currency);

    orden = await buildMongoOrderFromMobilePayload({
      items,
      tax,
      shipping,
      discount,
      currency: finalCurrency,
      firebaseUserId: finalUserId,
      userEmail: finalEmail,
      firestoreOrderId: clientOrderRef,
      mobileOrderRef: clientOrderRef,
      metadata,
    });

    const mongoOrdenId = String(orden._id);
    const stripeAmount = toStripeAmount(orden.total);

    if (amount !== undefined && amount !== null) {
      const clientAmount = toStripeAmount(amount);
      const diff = Math.abs(clientAmount - stripeAmount);

      if (diff > 1) {
        throw Object.assign(
          new Error("El total enviado por la app no coincide con el total calculado por backend."),
          { statusCode: 400 }
        );
      }
    }

    const sanitizedMetadata = sanitizeMetadata(metadata);

    const result = await crearPaymentIntentMobile({
      amount: stripeAmount,
      currency: finalCurrency,
      clienteEmail: finalEmail || null,
      metadata: {
        ...sanitizedMetadata,

        ordenId: mongoOrdenId,
        orderId: mongoOrdenId,
        mongoOrdenId,

        firestoreOrderId: clientOrderRef,
        mobileOrderRef: clientOrderRef,
        clientOrderId: clientOrderRef,

        userId: finalUserId || "guest",
        firebaseUserId: finalUserId || "",

        source: "mobile_payment_sheet",
        platform: "expo_react_native",
        ip: getClientIp(req),
        reqId: getRequestId(req),
      },
      idempotencyKey: `mobile_pi_${mongoOrdenId}`,
    });

    orden.stripePaymentIntentId = result.paymentIntentId || "";
    orden.stripeAmountTotal = result.amount || stripeAmount;
    orden.paymentStatusDetail = "mobile_payment_intent_created";
    orden.historial.push({
      estado: "stripe_payment_intent_created",
      fecha: now(),
      source: "stripe_routes",
      meta: {
        paymentIntentId: result.paymentIntentId,
        amount: result.amount,
        currency: result.currency,
      },
    });

    await orden.save();

    return res.status(201).json({
      ok: true,
      message: "Orden Mongo y PaymentIntent creados correctamente.",
      data: {
        ...result,
        mongoOrdenId,
        ordenId: mongoOrdenId,
        orderId: mongoOrdenId,
        firestoreOrderId: clientOrderRef,
        clientOrderRef,
      },
      mongoOrdenId,
      ordenId: mongoOrdenId,
      orderId: mongoOrdenId,
      firestoreOrderId: clientOrderRef,
      clientSecret: result.clientSecret,
      paymentIntentId: result.paymentIntentId,
      clientOrderRef,
      reqId: getRequestId(req),
    });
  } catch (err) {
    if (orden?._id && !orden?.stripePaymentIntentId) {
      await Orden.updateOne(
        { _id: orden._id },
        {
          $set: {
            estadoPago: "fallido",
            paymentStatusDetail: `payment_intent_create_failed:${safeString(
              err?.message || err
            ).slice(0, 250)}`,
          },
        }
      ).catch(() => {});
    }

    return sendError(res, req, err);
  }
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
      message: err?.message,
      code: err?.code,
      type: err?.type,
    });

    return res.status(200).json({
      ok: false,
      message: "Webhook error handled safely",
      reqId: getRequestId(req),
    });
  }
});

module.exports = router;