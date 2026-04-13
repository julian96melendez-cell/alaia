// ======================================================
// stripeService.js — Servicio Stripe ENTERPRISE (PRO)
// ======================================================

const Stripe = require("stripe");

// ==============================
// Validación ENV
// ==============================
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("❌ FALTA STRIPE_SECRET_KEY en el archivo .env");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
  timeout: 20000,
});

// ==============================
// Helpers
// ==============================
const normalizeCurrency = (c) => String(c || "usd").toLowerCase();

const safeInt = (n) => {
  const v = Number(n);

  if (!Number.isFinite(v) || v <= 0) {
    throw new Error("Stripe: unit_amount inválido");
  }

  return Math.round(v);
};

const normalizeEmail = (email) => {
  const value = String(email || "").trim().toLowerCase();
  return value || null;
};

// ==============================
// Helpers URLs
// ==============================
const getBaseUrl = () => {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL;

  throw new Error("❌ Falta FRONTEND_URL en el archivo .env");
};

const withQuery = (url, query) => {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${query}`;
};

const getSuccessUrl = (ordenId) => {
  const base = process.env.STRIPE_SUCCESS_URL || `${getBaseUrl()}/pago-exitoso`;

  return withQuery(
    base,
    `ordenId=${encodeURIComponent(ordenId)}&session_id={CHECKOUT_SESSION_ID}`
  );
};

const getCancelUrl = (ordenId) => {
  const base = process.env.STRIPE_CANCEL_URL || `${getBaseUrl()}/pago-cancelado`;

  return withQuery(base, `ordenId=${encodeURIComponent(ordenId)}`);
};

// ==============================
// Normalizar line items (Stripe)
// ==============================
const normalizarLineItems = (items = []) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Stripe: lineItems inválidos o vacíos.");
  }

  return items.map((it, i) => {
    if (!it?.price_data || !it?.price_data?.unit_amount || !it?.quantity) {
      throw new Error(`Stripe: lineItem inválido en índice ${i}`);
    }

    return {
      price_data: {
        currency: normalizeCurrency(it.price_data.currency),
        product_data: {
          name: it.price_data.product_data?.name || "Producto",
        },
        unit_amount: safeInt(it.price_data.unit_amount),
      },
      quantity: Math.max(1, parseInt(it.quantity, 10)),
    };
  });
};

// ==============================
// Crear sesión Checkout
// ==============================
const crearSesionPago = async ({
  lineItems,
  metadata = {},
  clienteEmail = null,
  idempotencyKey = null,
}) => {
  const ordenId = metadata?.ordenId;

  if (!ordenId) {
    throw new Error("Stripe: Falta ordenId en metadata.");
  }

  const normalizedItems = normalizarLineItems(lineItems);
  const email = normalizeEmail(clienteEmail);

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: normalizedItems,

        success_url: getSuccessUrl(ordenId),
        cancel_url: getCancelUrl(ordenId),

        metadata,

        payment_intent_data: {
          metadata,
        },

        customer_email: email || undefined,
      },
      idempotencyKey ? { idempotencyKey } : undefined
    );

    return session;
  } catch (err) {
    console.error("❌ Stripe Checkout Error:", err.message);
    throw err;
  }
};

// ==============================
// Construir evento Webhook
// ==============================
const construirEventoDesdeWebhook = (signature, rawBody) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error("❌ Falta STRIPE_WEBHOOK_SECRET en el archivo .env");
  }

  return stripe.webhooks.constructEvent(rawBody, signature, secret);
};

// ==============================
// Utilidades Stripe
// ==============================
const extraerOrdenId = (obj) => obj?.metadata?.ordenId || null;

const resumirEventoStripe = (event) => {
  const obj = event?.data?.object || {};

  return {
    eventId: event?.id || "",
    eventType: event?.type || "",
    objectType: obj?.object || "",
    objectId: obj?.id || "",
    sessionId: obj?.object === "checkout.session" ? obj?.id || "" : "",
    paymentIntent: obj?.payment_intent || "",
    amountTotal: typeof obj?.amount_total === "number" ? obj.amount_total : 0,
    currency: obj?.currency || "",
    ordenId: extraerOrdenId(obj),
    livemode: !!event?.livemode,
  };
};

// ==============================
// Reembolso (future-ready)
// ==============================
const crearReembolso = async ({
  paymentIntentId,
  motivo = "requested_by_customer",
}) => {
  if (!paymentIntentId) {
    throw new Error("Stripe: paymentIntentId requerido para reembolso.");
  }

  return stripe.refunds.create({
    payment_intent: paymentIntentId,
    reason: motivo,
  });
};

// ==============================
module.exports = {
  stripe,
  crearSesionPago,
  construirEventoDesdeWebhook,
  extraerOrdenId,
  resumirEventoStripe,
  crearReembolso,
};