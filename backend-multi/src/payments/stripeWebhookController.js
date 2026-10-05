"use strict";

const Orden = require("../models/Orden");
const { getLifecycle } = require("../services/checkoutLifecycle");
const WebhookEvent = require("../models/WebhookEvent");

const {
  construirEventoDesdeWebhook,
  resumirEventoStripe,
} = require("./stripeService");

const { enviarCorreoOrdenPagada } = require("../services/emailService");

const {
  updateFirestoreOrderFromStripe,
} = require("../services/firestoreOrderSync");

// ======================================================
// Config / Feature flags
// ======================================================
const envBool = (k, def = false) => {
  const v = process.env[k];
  if (v === undefined || v === null || String(v).trim() === "") return def;

  return ["1", "true", "yes", "y", "on"].includes(
    String(v).trim().toLowerCase()
  );
};

const FLAGS = {
  EMAIL_ON_PAYMENT: envBool("EMAIL_ON_PAYMENT", true),
  ENFORCE_LIVEMODE: process.env.STRIPE_LIVEMODE !== undefined,
  STRIPE_ACCOUNT_ID: (process.env.STRIPE_ACCOUNT_ID || "").trim() || null,
  ENFORCE_AMOUNT_MATCH: envBool("STRIPE_ENFORCE_AMOUNT_MATCH", true),
  ENFORCE_CURRENCY_MATCH: envBool("STRIPE_ENFORCE_CURRENCY_MATCH", true),
};

const ok = (res) => res.status(200).json({ received: true });

const safeStr = (v, fallback = "") =>
  v === null || v === undefined ? fallback : String(v);

const now = () => new Date();

function getReqId(req) {
  return (
    req.reqId ||
    req.headers["x-request-id"] ||
    req.headers["x-correlation-id"] ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function log(level, msg, ctx = {}) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      msg,
      ...ctx,
    })
  );
}

async function syncFirestoreOrderSafe({
  stripeObject,
  status,
  paymentStatus,
  eventId,
  detail,
  reqId,
}) {
  // Mobile checkout/history now read MongoDB; no Firestore order is created or required.
  if (["mobile_payment_sheet", "web_checkout"].includes(stripeObject?.metadata?.source)) return;
  try {
    await updateFirestoreOrderFromStripe({
      stripeObject,
      status,
      paymentStatus,
      eventId,
      detail,
    });
  } catch (err) {
    log("warn", "Firestore order sync failed, webhook continues", {
      reqId,
      eventId,
      detail,
      err: err?.message || String(err),
    });
  }
}

function getStripeSignature(req) {
  return req.headers["stripe-signature"];
}

function getRawBody(req) {
  if (req.rawBody) return req.rawBody;
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);
  return null;
}

function getOrdenIdFromStripeObject(obj) {
  return obj?.metadata?.ordenId || obj?.metadata?.orderId || null;
}

const toCents = (amount) => {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
};

const normalizeCurrency = (v) => safeStr(v, "").trim().toLowerCase();

const PAYMENT_OPEN_STATES = ["pendiente"];
const PAYMENT_FINAL_STATES = ["pagado", "reembolsado", "reembolsado_parcial"];

// ======================================================
// WebhookEvent safe update
// ======================================================
async function updateWebhookEventSafe(eventRow, update) {
  try {
    if (!eventRow?._id) return;

    await WebhookEvent.updateOne({ _id: eventRow._id }, update);
  } catch {
    log("warn", "No se pudo actualizar WebhookEvent", {
      code: "WEBHOOK_LEDGER_UNAVAILABLE",
    });
    throw Object.assign(new Error("Webhook ledger unavailable"), {
      publicCode: "WEBHOOK_LEDGER_UNAVAILABLE",
    });
  }
}

// ======================================================
// EMAIL Ledger
// ======================================================
const buildEmailLedgerKey = (type, value) =>
  `email_${type}_${String(value || "").toLowerCase()}`.slice(0, 120);

async function reserveEmailLedgerAtomic({ ordenId, ledgerKey, meta }) {
  const res = await Orden.updateOne(
    { _id: ordenId, "historial.estado": { $ne: ledgerKey } },
    {
      $push: {
        historial: {
          estado: ledgerKey,
          fecha: new Date(),
          source: "stripe_webhook",
          meta: meta || null,
        },
      },
    }
  );

  return { reserved: !!res?.modifiedCount };
}

async function enviarEmailPagoConfirmadoSafe({
  reqId,
  ordenId,
  reason,
  eventId,
}) {
  try {
    if (!FLAGS.EMAIL_ON_PAYMENT) return;

    const ledgerKey = buildEmailLedgerKey("payment", "pagado");

    const reserved = await reserveEmailLedgerAtomic({
      ordenId,
      ledgerKey,
      meta: { reason, eventId, at: new Date().toISOString() },
    });

    if (!reserved.reserved) {
      log("info", "Email pago ya reservado/enviado", {
        reqId,
        ordenId,
        eventId,
      });
      return;
    }

    const orden = await Orden.findById(ordenId)
      .populate("usuario", "email nombre")
      .lean();

    if (!orden) return;

    const usuarioObj =
      orden?.usuario && typeof orden.usuario === "object" ? orden.usuario : null;

    const email =
      usuarioObj?.email ||
      orden?.email ||
      orden?.clienteEmail ||
      orden?.direccionEntrega?.email ||
      null;

    if (!email) {
      log("warn", "No hay email para orden pagada", {
        reqId,
        ordenId,
        eventId,
      });
      return;
    }

    await enviarCorreoOrdenPagada({
      to: String(email),
      orden,
      meta: { reason, eventId },
    });

    log("info", "Email pago confirmado enviado", {
      reqId,
      ordenId,
      to: String(email),
      eventId,
    });
  } catch (err) {
    log("warn", "Falló envío email, no bloquea webhook", {
      reqId,
      ordenId,
      eventId,
      err: err?.message || String(err),
    });
  }
}

// ======================================================
// WebhookEvent persistence
// ======================================================
async function markEvent({
  event,
  status,
  ordenId = null,
  errorMessage = "",
  summary = {},
  reqId,
}) {
  try {
    const doc = await WebhookEvent.create({
      provider: "stripe",
      eventId: event.id,
      eventType: event.type,
      ordenId,
      status,
      errorMessage,
      summary,
      reqId,
      processedAt: new Date(),
    });

    return { created: true, doc };
  } catch (err) {
    if (err?.code === 11000) {
      const filter = { provider: "stripe", eventId: event.id };
      const reclaimed = await WebhookEvent.findOneAndUpdate({
        ...filter,
        $or: [
          { status: "failed" },
          { status: "received", updatedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } },
        ],
      }, { $set: { status: "received", errorMessage: "", reqId, processedAt: new Date() } }, { new: true });
      if (reclaimed) return { created: true, doc: reclaimed };
      return { created: false, doc: await WebhookEvent.findOne(filter) };
    }

    throw err;
  }
}

async function addStripeEventIdToOrden({ ordenId, eventId }) {
  if (!ordenId || !eventId) return;

  await Orden.updateOne(
    { _id: ordenId },
    {
      $addToSet: {
        stripeEventIds: String(eventId),
      },
    }
  ).catch(() => {});
}

function setOrdenAuditFields({ update, eventId, detail }) {
  if (!update.$set) update.$set = {};
  update.$set.stripeLatestEventId = safeStr(eventId, "");

  if (detail) {
    update.$set.paymentStatusDetail = safeStr(detail, "").slice(0, 500);
  }
}

// ======================================================
// Anti-fraude
// ======================================================
async function validarMontoYMonedaSiAplica({
  ordenId,
  stripeAmountTotal,
  stripeCurrency,
  reqId,
  eventId,
  eventType,
}) {
  const orden = await Orden.findById(ordenId)
    .select("total moneda estadoPago stripeAmountReceived stripeAmountTotal")
    .lean();

  if (!orden) {
    log("error", "Orden no encontrada para webhook", {
      reqId,
      ordenId,
      eventId,
      eventType,
    });

    return { ok: false, reason: "ORDER_NOT_FOUND" };
  }

  if (FLAGS.ENFORCE_AMOUNT_MATCH && stripeAmountTotal != null) {
    const totalCents = toCents(orden.total);

    if (totalCents == null) {
      return { ok: false, reason: "ORDER_TOTAL_INVALID" };
    }

    const stripeCents = Number(stripeAmountTotal) || 0;
    const diff = Math.abs(totalCents - stripeCents);

    if (diff > 1) {
      log("error", "Monto mismatch", {
        reqId,
        ordenId,
        eventId,
        eventType,
        orderTotalCents: totalCents,
        stripeAmountTotal: stripeCents,
        diff,
      });

      await Orden.updateOne(
        { _id: ordenId },
        {
          $set: {
            paymentStatusDetail: `amount_mismatch order=${totalCents} stripe=${stripeCents}`,
            stripeLatestEventId: String(eventId),
          },
        }
      ).catch(() => {});

      return { ok: false, reason: "AMOUNT_MISMATCH" };
    }
  }

  if (FLAGS.ENFORCE_CURRENCY_MATCH && stripeCurrency) {
    const orderCurrency = normalizeCurrency(orden?.moneda);
    const webhookCurrency = normalizeCurrency(stripeCurrency);

    if (orderCurrency && webhookCurrency && orderCurrency !== webhookCurrency) {
      log("error", "Currency mismatch", {
        reqId,
        ordenId,
        eventId,
        eventType,
        orderCurrency,
        webhookCurrency,
      });

      await Orden.updateOne(
        { _id: ordenId },
        {
          $set: {
            paymentStatusDetail: `currency_mismatch order=${orderCurrency} stripe=${webhookCurrency}`,
            stripeLatestEventId: String(eventId),
          },
        }
      ).catch(() => {});

      return { ok: false, reason: "CURRENCY_MISMATCH" };
    }
  }

  return { ok: true };
}

// ======================================================
// Helpers estado orden
// ======================================================
async function marcarOrdenPagadaAtomico({
  ordenId,
  sessionLike,
  financialProof,
  eventId,
  detail = "",
}) {
  const update = {
    $set: {
      estadoPago: "pagado",
      metodoPago: "stripe",
      paymentProvider: "stripe",
      paidAt: now(),
      failedAt: null,
      refundedAt: null,
    },
  };

  const obj = sessionLike || {};

  if (obj?.id) update.$set.stripeSessionId = safeStr(obj.id);

  if (obj?.payment_intent) {
    update.$set.stripePaymentIntentId = safeStr(obj.payment_intent);
  }

  if (obj?.currency) {
    update.$set.moneda = safeStr(obj.currency, "usd").toLowerCase();
  }

  if (obj?.amount_total != null) {
    update.$set.stripeAmountTotal = Number(obj.amount_total) || 0;
  }

  if (obj?.amount_received != null) {
    update.$set.stripeAmountReceived = Number(obj.amount_received) || 0;
  }

  if (obj?.customer) {
    update.$set.stripeCustomerId = safeStr(obj.customer);
  }

  setOrdenAuditFields({ update, eventId, detail });

  const reservedPayment = await getLifecycle().settlePaid(ordenId, update.$set, financialProof);
  if (reservedPayment.managed) return reservedPayment.changed ? reservedPayment.order : null;

  return require("../services/financialCoordinator").applyFinancialEvent(ordenId, update.$set, financialProof);
}

async function marcarOrdenFallidaAtomico({
  ordenId,
  eventId,
  detail = "",
  financialProof,
  clearSession = false,
}) {
  const update = {
    $set: {
      estadoPago: "fallido",
      metodoPago: "stripe",
      paymentProvider: "stripe",
      failedAt: now(),
    },
  };

  // Preserve the persisted Stripe binding even when payment fails.

  setOrdenAuditFields({ update, eventId, detail });

  return require("../services/financialCoordinator").applyFinancialEvent(ordenId, update.$set, financialProof);
}

async function marcarOrdenReembolsoAtomico({
  ordenId,
  eventId,
  detail = "",
  financialProof,
  refundAmountCents = null,
  chargeAmountCents = null,
}) {
  let estadoPago = "reembolsado";

  if (
    Number.isFinite(refundAmountCents) &&
    Number.isFinite(chargeAmountCents) &&
    refundAmountCents > 0 &&
    refundAmountCents < chargeAmountCents
  ) {
    estadoPago = "reembolsado_parcial";
  }

  const update = {
    $set: {
      estadoPago,
      metodoPago: "stripe",
      paymentProvider: "stripe",
      refundedAt: now(),
    },
  };

  if (refundAmountCents != null) {
    update.$set.stripeRefundAmount = Number(refundAmountCents) || 0;
  }

  setOrdenAuditFields({ update, eventId, detail });

  return require("../services/financialCoordinator").applyFinancialEvent(ordenId, update.$set, financialProof);
}

async function obtenerMontoReferenciaOrden(ordenId) {
  const orden = await Orden.findById(ordenId)
    .select("stripeAmountReceived stripeAmountTotal total")
    .lean();

  if (!orden) return null;

  const candidates = [
    Number(orden?.stripeAmountReceived),
    Number(orden?.stripeAmountTotal),
    toCents(orden?.total),
  ].filter(Number.isFinite);

  return candidates.length ? Math.max(...candidates) : null;
}

function enforceLivemodeOrSkip({ event, reqId }) {
  if (!FLAGS.ENFORCE_LIVEMODE) return { ok: true };

  const desired = String(process.env.STRIPE_LIVEMODE || "")
    .trim()
    .toLowerCase();

  if (desired !== "true" && desired !== "false") return { ok: true };

  const want = desired === "true";
  const got = !!event?.livemode;

  if (want !== got) {
    log("warn", "Evento ignorado por livemode mismatch", {
      reqId,
      eventId: event?.id,
      type: event?.type,
      wantLivemode: want,
      gotLivemode: got,
    });

    return { ok: false, reason: "LIVEMODE_MISMATCH" };
  }

  return { ok: true };
}

function enforceAccountOrSkip({ req, event, reqId }) {
  if (!FLAGS.STRIPE_ACCOUNT_ID) return { ok: true };

  const hdr = req.headers["stripe-account"];
  const account = safeStr(hdr || event?.account || "", "");

  if (account && account !== FLAGS.STRIPE_ACCOUNT_ID) {
    log("warn", "Evento ignorado por account mismatch", {
      reqId,
      eventId: event?.id,
      type: event?.type,
      gotAccount: account,
      expectedAccount: FLAGS.STRIPE_ACCOUNT_ID,
    });

    return { ok: false, reason: "ACCOUNT_MISMATCH" };
  }

  return { ok: true };
}

// ======================================================
// Procesador principal
// ======================================================
exports.procesarWebhookStripe = async (req, res) => {
  const reqId = getReqId(req);

  const signature = getStripeSignature(req);

  if (!signature) {
    return res.status(400).send("Missing stripe-signature header");
  }

  const rawBody = getRawBody(req);

  if (!rawBody) {
    return res.status(400).json({
      ok: false,
      message:
        'Missing raw body. Usa express.raw({ type: "application/json" }) en la ruta del webhook.',
    });
  }

  let event;

  try {
    event = construirEventoDesdeWebhook(signature, rawBody);
  } catch (err) {
    log("warn", "Stripe signature invalid", {
      reqId,
      code: "STRIPE_SIGNATURE_INVALID",
    });

    return res.status(400).send("Firma de webhook inválida");
  }

  const liveCheck = enforceLivemodeOrSkip({ event, reqId });
  if (!liveCheck.ok) return ok(res);

  const acctCheck = enforceAccountOrSkip({ req, event, reqId });
  if (!acctCheck.ok) return ok(res);

  const summary = resumirEventoStripe(event);
  const eventId = safeStr(summary?.eventId || event?.id);
  const eventType = safeStr(summary?.eventType || event?.type);

  const obj = event?.data?.object || {};
  let ordenId = summary?.ordenId || getOrdenIdFromStripeObject(obj);
  let resolvedFinancialObject;
  const eventPaymentIntentId = eventType.startsWith("payment_intent.") ? obj.id : typeof obj.payment_intent === "string" ? obj.payment_intent : obj.payment_intent?.id;
  // Refunds/charges do not always include order metadata. Resolve through their
  // authoritative PI, then validate its opaque correlation before order writes.
  if (!ordenId && eventPaymentIntentId && /^(payment_intent|charge|refund)\./.test(eventType)) {
    try {
      if (eventType.startsWith("payment_intent.")) {
        const linked = await Orden.findOne({ stripePaymentIntentId: eventPaymentIntentId }).select("_id").lean();
        ordenId = linked?._id ? String(linked._id) : null;
      } else {
        resolvedFinancialObject = await require("./stripeService").stripe.paymentIntents.retrieve(eventPaymentIntentId);
        ordenId = getOrdenIdFromStripeObject(resolvedFinancialObject);
      }
    } catch { return res.status(503).json({ ok: false, message: "Correlación Stripe pendiente; reintentar" }); }
  }

  log("info", "Stripe webhook received", {
    reqId,
    eventId,
    eventType,
    ordenId: ordenId || null,
  });

  let eventRow = null;

  try {
    const result = await markEvent({
      event,
      status: "received",
      ordenId,
      summary,
      reqId,
    });

    eventRow = result.doc || null;

    if (!result.created) {
      if (!result.doc || !["processed", "skipped"].includes(result.doc.status)) {
        return res.status(503).json({ ok: false, message: "Webhook pendiente; reintentar" });
      }
      log("info", "Evento duplicado ignorado", {
        reqId,
        eventId,
        eventType,
      });

      return ok(res);
    }
  } catch (err) {
    log("error", "No se pudo registrar el evento Stripe", { reqId, eventId });
    return res.status(503).json({ ok: false, message: "Webhook pendiente; reintentar" });
  }

  try {
  if (!ordenId) {
    if (/^(payment_intent|charge|refund|checkout\.session)\./.test(eventType)) {
      await updateWebhookEventSafe(eventRow, { $set: { status: "skipped", ordenId: null, summary: { ...summary, ordenId: null }, errorMessage: "LEGACY_BINDING_REQUIRED: no verified order; manual review" } });
      return ok(res);
    }
  const mobileEvents = {
    "payment_intent.succeeded": {
      status: "confirmada",
      paymentStatus: "pagado",
    },
    "charge.succeeded": {
      status: "confirmada",
      paymentStatus: "pagado",
    },
    "payment_intent.payment_failed": {
      status: "pendiente_pago",
      paymentStatus: "fallido",
    },
    "charge.refunded": {
      status: "confirmada",
      paymentStatus: "reembolsado",
    },
  };

  const syncConfig = mobileEvents[eventType];

  if (syncConfig) {
    await syncFirestoreOrderSafe({
      stripeObject: obj,
      status: syncConfig.status,
      paymentStatus: syncConfig.paymentStatus,
      eventId,
      detail: eventType,
      reqId,
    });

    await updateWebhookEventSafe(eventRow, {
      $set: {
        status: "processed",
        ordenId: null,
        summary,
        errorMessage: "",
      },
    });

    return ok(res);
  }

  await updateWebhookEventSafe(eventRow, {
    $set: {
      status: "skipped",
      ordenId: null,
      summary,
      errorMessage: "Missing ordenId",
    },
  });

      return ok(res);
    }

    let financialProof;
    if (/^(payment_intent|charge|refund|checkout\.session)\./.test(eventType)) {
      const order = await Orden.findById(ordenId).select("+checkoutIntent.stripeCorrelation");
      if (!order) {
        await updateWebhookEventSafe(eventRow, { $set: { status: "skipped", ordenId: null, summary: { ...summary, ordenId: null }, errorMessage: "LEGACY_BINDING_REQUIRED: no verified order; manual review" } });
        return ok(res);
      }
      if (order.checkoutIntent?.keyHash && !order.checkoutIntent.stripeCorrelation) throw Object.assign(new Error("Intención sin correlación requiere revisión manual"), { publicCode: "FINANCIAL_REVIEW_REQUIRED" });
      const piId = eventPaymentIntentId;
      if (order?.checkoutIntent?.keyHash && order?.stripePaymentIntentId && piId !== order.stripePaymentIntentId) throw Object.assign(new Error("Evento Stripe incompatible"), { publicCode: "STRIPE_CORRELATION_MISMATCH" });
      if (order?.checkoutIntent?.keyHash && eventType.startsWith("checkout.session.") && order?.stripeSessionId && obj.id !== order.stripeSessionId) throw Object.assign(new Error("Session Stripe incompatible"), { publicCode: "STRIPE_CORRELATION_MISMATCH" });
      if (order && !order.checkoutIntent?.keyHash) {
        const binding = { eventType, paymentIntentId: piId, sessionId: eventType.startsWith("checkout.session.") ? obj.id : undefined };
        if (!require("../services/orderInvariants").hasExactLegacyBinding(order, binding)) {
          await updateWebhookEventSafe(eventRow, { $set: { status: "skipped", ordenId: null, summary: { ...summary, ordenId: null }, errorMessage: "LEGACY_BINDING_REQUIRED: manual review; no order effects" } });
          return ok(res);
        }
        const reference = eventType.startsWith("payment_intent.") || !piId ? obj : resolvedFinancialObject || await require("./stripeService").stripe.paymentIntents.retrieve(piId);
        financialProof = { ...binding, amount: reference.amount ?? reference.amount_total, currency: reference.currency };
        require("../services/orderInvariants").assertFinancialEventBinding(order, financialProof);
      }
      if (order?.checkoutIntent?.keyHash) {
        // Charge/refund metadata may not carry PI metadata. Retrieve the PI only
        // after ensuring a stored identity cannot disagree with this event.
        if (order.stripePaymentIntentId && piId !== order.stripePaymentIntentId) throw Object.assign(new Error("Evento Stripe incompatible"), { publicCode: "STRIPE_CORRELATION_MISMATCH" });
        const financialObject = resolvedFinancialObject || (eventType.startsWith("payment_intent.") || !piId ? obj : await require("./stripeService").stripe.paymentIntents.retrieve(piId));
        financialProof = { orderId: financialObject.metadata?.ordenId, correlation: financialObject.metadata?.checkoutCorrelation, uid: financialObject.metadata?.firebaseUserId, paymentIntentId: piId, sessionId: eventType.startsWith("checkout.session.") ? obj.id : undefined, amount: financialObject.amount ?? financialObject.amount_total, currency: financialObject.currency };
        require("../services/orderInvariants").assertStripeCorrelation(order, financialProof);
        const confirmsPayment = eventType === "payment_intent.succeeded" || eventType === "charge.succeeded" || eventType === "checkout.session.async_payment_succeeded" || (eventType === "checkout.session.completed" && obj.payment_status === "paid");
        if (confirmsPayment && (financialObject.status !== "succeeded" || financialObject.amount_received !== Math.round(order.total * 100))) {
          throw Object.assign(new Error("Pago Stripe no confirmado por el importe esperado"), { publicCode: "STRIPE_CORRELATION_MISMATCH" });
        }
      }
    }
    await addStripeEventIdToOrden({ ordenId, eventId });

    // ====================================================
    // checkout.session.completed
    // ====================================================
    if (eventType === "checkout.session.completed") {
      const session = obj;

      if (session?.mode && session.mode !== "payment") {
        const msg = "Session mode != payment";

        await updateWebhookEventSafe(eventRow, {
          $set: { status: "skipped", errorMessage: msg },
        });

        await Orden.updateOne(
          { _id: ordenId },
          {
            $set: {
              stripeLatestEventId: eventId,
              paymentStatusDetail: msg,
            },
          }
        ).catch(() => {});

        return ok(res);
      }

      if (session?.payment_status && session.payment_status !== "paid") {
        const msg = `payment_status != paid (${session.payment_status})`;

        await updateWebhookEventSafe(eventRow, {
          $set: { status: "skipped", errorMessage: msg },
        });

        await Orden.updateOne(
          { _id: ordenId },
          {
            $set: {
              stripeLatestEventId: eventId,
              paymentStatusDetail: msg,
            },
          }
        ).catch(() => {});

        return ok(res);
      }

      const amountCheck = await validarMontoYMonedaSiAplica({
        ordenId,
        stripeAmountTotal: session?.amount_total,
        stripeCurrency: session?.currency,
        reqId,
        eventId,
        eventType,
      });

      if (!amountCheck.ok) {
        await updateWebhookEventSafe(eventRow, {
          $set: {
            status: "skipped",
            errorMessage: amountCheck.reason,
          },
        });

        return ok(res);
      }

      const ordenActualizada = await marcarOrdenPagadaAtomico({
        ordenId,
        financialProof,
        sessionLike: session,
        eventId,
        detail: "checkout.session.completed",
      });

      if (ordenActualizada) {
        await enviarEmailPagoConfirmadoSafe({
          reqId,
          ordenId,
          reason: "checkout.session.completed",
          eventId,
        });
      }

      await syncFirestoreOrderSafe({
        stripeObject: obj,
        status: "confirmada",
        paymentStatus: "pagado",
        eventId,
        detail: eventType,
        reqId,
      });

      await updateWebhookEventSafe(eventRow, {
        $set: {
          status: "processed",
          ordenId,
          summary,
        },
      });

      return ok(res);
    }

    // ====================================================
    // checkout.session.async_payment_succeeded
    // ====================================================
    if (eventType === "checkout.session.async_payment_succeeded") {
      const session = obj;

      const amountCheck = await validarMontoYMonedaSiAplica({
        ordenId,
        stripeAmountTotal: session?.amount_total,
        stripeCurrency: session?.currency,
        reqId,
        eventId,
        eventType,
      });

      if (!amountCheck.ok) {
        await updateWebhookEventSafe(eventRow, {
          $set: {
            status: "skipped",
            errorMessage: amountCheck.reason,
          },
        });

        return ok(res);
      }

      const ordenActualizada = await marcarOrdenPagadaAtomico({
        ordenId,
        financialProof,
        sessionLike: session,
        eventId,
        detail: "checkout.session.async_payment_succeeded",
      });

      if (ordenActualizada) {
        await enviarEmailPagoConfirmadoSafe({
          reqId,
          ordenId,
          reason: "checkout.session.async_payment_succeeded",
          eventId,
        });
      }

      await syncFirestoreOrderSafe({
        stripeObject: obj,
        status: "confirmada",
        paymentStatus: "pagado",
        eventId,
        detail: eventType,
        reqId,
      });

      await updateWebhookEventSafe(eventRow, {
        $set: {
          status: "processed",
          ordenId,
          summary,
        },
      });

      return ok(res);
    }

    // ====================================================
    // checkout.session.async_payment_failed
    // ====================================================
    if (eventType === "checkout.session.async_payment_failed") {
      await marcarOrdenFallidaAtomico({
        ordenId,
        financialProof,
        eventId,
        detail: "checkout.session.async_payment_failed",
      });

      await syncFirestoreOrderSafe({
        stripeObject: obj,
        status: "pendiente_pago",
        paymentStatus: "fallido",
        eventId,
        detail: eventType,
        reqId,
      });

      await updateWebhookEventSafe(eventRow, {
        $set: {
          status: "processed",
          ordenId,
          summary,
        },
      });

      return ok(res);
    }

    // ====================================================
    // checkout.session.expired
    // ====================================================
    if (eventType === "checkout.session.expired") {
      if (financialProof?.correlation) {
        await getLifecycle("web").expiredWebhook(ordenId, obj.id, financialProof);
        await updateWebhookEventSafe(eventRow, { $set: { status: "processed", ordenId, summary } });
        return ok(res);
      }
      await marcarOrdenFallidaAtomico({
        ordenId,
        financialProof,
        eventId,
        detail: "checkout.session.expired",
        clearSession: true,
      });

      await syncFirestoreOrderSafe({
        stripeObject: obj,
        status: "pendiente_pago",
        paymentStatus: "fallido",
        eventId,
        detail: eventType,
        reqId,
      });

      await updateWebhookEventSafe(eventRow, {
        $set: {
          status: "processed",
          ordenId,
          summary,
        },
      });

      return ok(res);
    }

    // ====================================================
    if (eventType === "payment_intent.canceled") {
      await getLifecycle().cancelledWebhook(ordenId, obj.id, financialProof);
      await updateWebhookEventSafe(eventRow, { $set: { status: "processed", ordenId, summary } });
      return ok(res);
    }

    // payment_intent.payment_failed
    // ====================================================
    if (eventType === "payment_intent.payment_failed") {
      await marcarOrdenFallidaAtomico({
        ordenId,
        financialProof,
        eventId,
        detail: "payment_intent.payment_failed",
      });

      await syncFirestoreOrderSafe({
        stripeObject: obj,
        status: "pendiente_pago",
        paymentStatus: "fallido",
        eventId,
        detail: eventType,
        reqId,
      });

      await updateWebhookEventSafe(eventRow, {
        $set: {
          status: "processed",
          ordenId,
          summary,
        },
      });

      return ok(res);
    }

    // ====================================================
    // payment_intent.succeeded
    // ====================================================
    if (eventType === "payment_intent.succeeded") {
      const intent = obj;

      const amountCheck = await validarMontoYMonedaSiAplica({
        ordenId,
        stripeAmountTotal: intent?.amount_received ?? intent?.amount,
        stripeCurrency: intent?.currency,
        reqId,
        eventId,
        eventType,
      });

      if (!amountCheck.ok) {
        await updateWebhookEventSafe(eventRow, {
          $set: {
            status: "skipped",
            errorMessage: amountCheck.reason,
          },
        });

        return ok(res);
      }

      const ordenActualizada = await marcarOrdenPagadaAtomico({
        ordenId,
        financialProof,
        sessionLike: {
          id: null,
          payment_intent: intent?.id,
          currency: intent?.currency,
          amount_received: intent?.amount_received,
          customer: intent?.customer,
        },
        eventId,
        detail: "payment_intent.succeeded",
      });

      if (ordenActualizada) {
        await enviarEmailPagoConfirmadoSafe({
          reqId,
          ordenId,
          reason: "payment_intent.succeeded",
          eventId,
        });
      }

      await syncFirestoreOrderSafe({
        stripeObject: obj,
        status: "confirmada",
        paymentStatus: "pagado",
        eventId,
        detail: eventType,
        reqId,
      });

      await updateWebhookEventSafe(eventRow, {
        $set: {
          status: "processed",
          ordenId,
          summary,
        },
      });

      return ok(res);
    }

    // ====================================================
    // charge.succeeded
    // ====================================================
    if (eventType === "charge.succeeded") {
      const charge = obj;

      const amountCheck = await validarMontoYMonedaSiAplica({
        ordenId,
        stripeAmountTotal: charge?.amount_captured ?? charge?.amount,
        stripeCurrency: charge?.currency,
        reqId,
        eventId,
        eventType,
      });

      if (!amountCheck.ok) {
        await updateWebhookEventSafe(eventRow, {
          $set: {
            status: "skipped",
            errorMessage: amountCheck.reason,
          },
        });

        return ok(res);
      }

      const ordenActualizada = await marcarOrdenPagadaAtomico({
        ordenId,
        financialProof,
        sessionLike: {
          id: null,
          payment_intent: charge?.payment_intent,
          currency: charge?.currency,
          amount_received: charge?.amount_captured,
          customer: charge?.customer,
        },
        eventId,
        detail: "charge.succeeded",
      });

      if (ordenActualizada) {
        await enviarEmailPagoConfirmadoSafe({
          reqId,
          ordenId,
          reason: "charge.succeeded",
          eventId,
        });
      }

      await syncFirestoreOrderSafe({
        stripeObject: obj,
        status: "confirmada",
        paymentStatus: "pagado",
        eventId,
        detail: eventType,
        reqId,
      });

      await updateWebhookEventSafe(eventRow, {
        $set: {
          status: "processed",
          ordenId,
          summary,
        },
      });

      return ok(res);
    }

    // ====================================================
    // charge.refunded
    // ====================================================
    if (eventType === "charge.refunded") {
      const charge = obj;
      const refundAmount = Number(charge?.amount_refunded) || 0;
      const chargeAmount = Number(charge?.amount) || 0;

      await marcarOrdenReembolsoAtomico({
        ordenId,
        financialProof,
        eventId,
        detail: "charge.refunded",
        refundAmountCents: refundAmount,
        chargeAmountCents: chargeAmount,
      });

      await syncFirestoreOrderSafe({
        stripeObject: obj,
        status: "confirmada",
        paymentStatus: "reembolsado",
        eventId,
        detail: eventType,
        reqId,
      });

      await updateWebhookEventSafe(eventRow, {
        $set: {
          status: "processed",
          ordenId,
          summary,
        },
      });

      return ok(res);
    }

    // ====================================================
    // refund.updated
    // ====================================================
    if (eventType === "refund.updated") {
      const refund = obj;

      if (refund?.status !== "succeeded") {
        await updateWebhookEventSafe(eventRow, {
          $set: {
            status: "skipped",
            ordenId,
            summary,
            errorMessage: `refund_status_${safeStr(refund?.status, "unknown")}`,
          },
        });

        return ok(res);
      }

      const referenceAmount =
        Number(refund?.charge_details?.amount) ||
        Number(refund?.payment_intent_details?.amount) ||
        (await obtenerMontoReferenciaOrden(ordenId));

      await marcarOrdenReembolsoAtomico({
        ordenId,
        financialProof,
        eventId,
        detail: "refund.updated",
        refundAmountCents: Number(refund?.amount) || 0,
        chargeAmountCents: Number.isFinite(referenceAmount)
          ? referenceAmount
          : null,
      });

      await syncFirestoreOrderSafe({
        stripeObject: obj,
        status: "confirmada",
        paymentStatus: "reembolsado",
        eventId,
        detail: eventType,
        reqId,
      });

      await updateWebhookEventSafe(eventRow, {
        $set: {
          status: "processed",
          ordenId,
          summary,
        },
      });

      return ok(res);
    }

    // ====================================================
    // unhandled event
    // ====================================================
    await updateWebhookEventSafe(eventRow, {
      $set: {
        status: "skipped",
        ordenId,
        summary,
      },
    });

    await Orden.updateOne(
      { _id: ordenId },
      {
        $set: {
          stripeLatestEventId: eventId,
          paymentStatusDetail: `unhandled_event:${eventType}`,
        },
      }
    ).catch(() => {});

    return ok(res);
  } catch (err) {
    if (err.publicCode === "WEBHOOK_LEDGER_UNAVAILABLE") {
      return res.status(503).json({ ok: false, message: "Webhook pendiente; reintentar" });
    }
    if (err.publicCode === "FINANCIAL_REVIEW_REQUIRED") {
      await updateWebhookEventSafe(eventRow, { $set: { status: "skipped", ordenId: null, summary: { ...summary, ordenId: null }, errorMessage: "FINANCIAL_REVIEW_REQUIRED: no order effects; manual review" } });
      return ok(res);
    }
    log("error", "Webhook fatal error", {
      reqId,
      eventId,
      eventType,
      ordenId: ordenId || null,
      err: err?.message || String(err),
    });

    await updateWebhookEventSafe(eventRow, {
      $set: {
        status: "failed",
        errorMessage: safeStr(err?.message || err).slice(0, 500),
        ordenId: ordenId || null,
        summary,
      },
    });

    if (err.publicCode !== "STRIPE_CORRELATION_MISMATCH") await Orden.updateOne(
      { _id: ordenId },
      {
        $set: {
          stripeLatestEventId: eventId,
          paymentStatusDetail: `webhook_failed:${safeStr(
            err?.message || err
          ).slice(0, 250)}`,
        },
      }
    ).catch(() => {});

    return res.status(err.publicCode === "STRIPE_CORRELATION_MISMATCH" ? 409 : 500).json({
      ok: false,
      message: "Webhook processing failed",
    });
  }
};

// Guard before authentication dependencies, persistence or provider effects.
const financialGate = require("../config/financialOperations").requireFinancialOperations;
for (const name of ['procesarWebhookStripe']) {
  const handler = module.exports[name];
  if (handler) module.exports[name] = (req, res, next) => financialGate(req, res, () => handler(req, res, next));
}
