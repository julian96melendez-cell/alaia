"use strict";

const Stripe = require("stripe");

// ======================================================
// Validación ENV
// ======================================================
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("❌ FALTA STRIPE_SECRET_KEY en el archivo .env");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
  timeout: 20000,
});

// ======================================================
// Helpers
// ======================================================
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

function safeStr(v, fallback = "") {
  if (v === null || v === undefined) return fallback;
  return String(v).trim();
}

function normalizeCurrency(c) {
  const cur = safeStr(c, "usd").toLowerCase();
  return ALLOWED_CURRENCIES.has(cur) ? cur : "usd";
}

function safeInt(n) {
  const v = Number(n);

  if (!Number.isFinite(v) || v <= 0) {
    throw new Error("Stripe: unit_amount inválido");
  }

  return Math.round(v);
}

function normalizeEmail(email) {
  const value = safeStr(email).toLowerCase();
  return value || null;
}

function sanitizeMetadata(metadata = {}) {
  const out = {};

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return out;
  }

  for (const [key, value] of Object.entries(metadata)) {
    const cleanKey = safeStr(key).slice(0, 40);
    if (!cleanKey) continue;

    const cleanValue = safeStr(value).slice(0, 500);
    out[cleanKey] = cleanValue;
  }

  return out;
}

// ======================================================
// Helpers URLs
// ======================================================
function getBaseUrl() {
  const base =
    safeStr(process.env.FRONTEND_URL) ||
    safeStr(process.env.CLIENT_URL).split(",")[0]?.trim() ||
    "";

  if (!base) {
    throw new Error("❌ Falta FRONTEND_URL o CLIENT_URL en el archivo .env");
  }

  return base.replace(/\/$/, "");
}

function withQuery(url, query) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${query}`;
}

function getSuccessUrl(ordenId) {
  const base =
    safeStr(process.env.STRIPE_SUCCESS_URL) ||
    `${getBaseUrl()}/pago-exitoso`;

  return withQuery(
    base,
    `ordenId=${encodeURIComponent(ordenId)}&session_id={CHECKOUT_SESSION_ID}`
  );
}

function getCancelUrl(ordenId) {
  const base =
    safeStr(process.env.STRIPE_CANCEL_URL) ||
    `${getBaseUrl()}/pago-cancelado`;

  return withQuery(base, `ordenId=${encodeURIComponent(ordenId)}`);
}

// ======================================================
// Normalizar line items (Stripe)
// ======================================================
function normalizarLineItems(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Stripe: lineItems inválidos o vacíos.");
  }

  return items.map((it, i) => {
    const unitAmount = it?.price_data?.unit_amount;
    const quantity = it?.quantity;
    const currency = it?.price_data?.currency;
    const name = it?.price_data?.product_data?.name;

    if (unitAmount === undefined || unitAmount === null || !quantity) {
      throw new Error(`Stripe: lineItem inválido en índice ${i}`);
    }

    return {
      price_data: {
        currency: normalizeCurrency(currency),
        product_data: {
          name: safeStr(name, "Producto").slice(0, 200),
        },
        unit_amount: safeInt(unitAmount),
      },
      quantity: Math.max(1, parseInt(quantity, 10) || 1),
    };
  });
}

// ======================================================
// Crear sesión Checkout
// ======================================================
async function crearSesionPago({
  lineItems,
  metadata = {},
  clienteEmail = null,
  idempotencyKey = null,
}) {
  const cleanMetadata = sanitizeMetadata(metadata);
  const ordenId = cleanMetadata?.ordenId;

  if (!ordenId) {
    throw new Error("Stripe: Falta ordenId en metadata.");
  }

  const normalizedItems = normalizarLineItems(lineItems);
  const email = normalizeEmail(clienteEmail);

  const payload = {
    mode: "payment",
    payment_method_types: ["card"],
    line_items: normalizedItems,

    success_url: getSuccessUrl(ordenId),
    cancel_url: getCancelUrl(ordenId),

    metadata: cleanMetadata,

    payment_intent_data: {
      metadata: cleanMetadata,
      transfer_group: `order_${ordenId}`,
    },

    customer_email: email || undefined,
  };

  try {
    const session = await stripe.checkout.sessions.create(
      payload,
      idempotencyKey ? { idempotencyKey: safeStr(idempotencyKey).slice(0, 255) } : undefined
    );

    return session;
  } catch (err) {
    console.error("❌ Stripe Checkout Error:", {
      message: err?.message,
      type: err?.type,
      code: err?.code,
      decline_code: err?.decline_code,
      param: err?.param,
      ordenId,
    });

    throw err;
  }
}

// ======================================================
// Construir evento Webhook
// ======================================================
function construirEventoDesdeWebhook(signature, rawBody) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error("❌ Falta STRIPE_WEBHOOK_SECRET en el archivo .env");
  }

  const sig = safeStr(signature);
  if (!sig) {
    throw new Error("Stripe: stripe-signature requerida");
  }

  if (!Buffer.isBuffer(rawBody)) {
    throw new Error("Stripe: rawBody inválido para webhook");
  }

  return stripe.webhooks.constructEvent(rawBody, sig, secret);
}

// ======================================================
// Utilidades Stripe
// ======================================================
function extraerOrdenId(obj) {
  return obj?.metadata?.ordenId || null;
}

function resumirEventoStripe(event) {
  const obj = event?.data?.object || {};

  return {
    eventId: event?.id || "",
    eventType: event?.type || "",
    objectType: obj?.object || "",
    objectId: obj?.id || "",
    sessionId: obj?.object === "checkout.session" ? obj?.id || "" : "",
    paymentIntent: obj?.payment_intent || "",
    amountTotal: typeof obj?.amount_total === "number" ? obj.amount_total : 0,
    amountReceived:
      typeof obj?.amount_received === "number" ? obj.amount_received : 0,
    currency: obj?.currency || "",
    ordenId: extraerOrdenId(obj),
    livemode: !!event?.livemode,
  };
}

// ======================================================
// Reembolso
// ======================================================
async function crearReembolso({
  paymentIntentId,
  motivo = "requested_by_customer",
  amount = null,
  metadata = {},
}) {
  const pi = safeStr(paymentIntentId);

  if (!pi) {
    throw new Error("Stripe: paymentIntentId requerido para reembolso.");
  }

  const payload = {
    payment_intent: pi,
    reason: safeStr(motivo, "requested_by_customer"),
    metadata: sanitizeMetadata(metadata),
  };

  if (amount !== null && amount !== undefined) {
    payload.amount = safeInt(amount);
  }

  return stripe.refunds.create(payload);
}

module.exports = {
  stripe,
  crearSesionPago,
  construirEventoDesdeWebhook,
  extraerOrdenId,
  resumirEventoStripe,
  crearReembolso,
};