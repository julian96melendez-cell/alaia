// ======================================================
// stripeWebhookController.js — Stripe Webhook ENTERPRISE (ULTRA PRO FINAL)
// ======================================================
//
// ✅ Verificación firma Stripe (RAW BODY)
// ✅ Idempotencia por eventId (WebhookEvent unique)
// ✅ Idempotencia por ORDEN (Orden.stripeEventIds con $addToSet + límite)
// ✅ Anti-downgrade (si pagada no se marca fallida)
// ✅ Validación antifraude: amount_total vs orden.total (centavos)
// ✅ EMAIL idempotente SIN carreras (reserva atómica en historial antes de enviar)
// ✅ Logs estructurados + reqId
// ✅ Filtra livemode (evita mezclar test/live)
// ✅ Soporte eventos Stripe principales + fallbacks
//
// 🛡️ (CAMBIO PRO SEGURIDAD):
// ❌ NO se pagan vendedores al marcar pagada (evita riesgo de chargebacks/fraude)
// ✅ Los payouts deben ejecutarse al marcar "entregado" (o +X días) desde Admin/Fulfillment.
//
// REQUIERE:
// - Ruta con express.raw({ type: "application/json" }) SOLO para este endpoint
// - Model: WebhookEvent con unique index en eventId
// - Orden con campos: total, moneda, stripeEventIds[], etc.
//
// ======================================================

const Orden = require("../models/Orden");
const WebhookEvent = require("../models/WebhookEvent");
const { construirEventoDesdeWebhook, resumirEventoStripe } = require("./stripeService");
const { enviarCorreoOrdenPagada } = require("../services/emailService");

// Nota: mantenemos el import por compatibilidad, pero NO se usa aquí por máxima seguridad.
// El payout debe ejecutarse al pasar a "entregado" (adminOrdenController.js) o en un job con delay.
const { pagarVendedoresDeOrden } = require("../services/payoutService");

// -----------------------------
// Config / Feature flags
// -----------------------------
const envBool = (k, def = false) => {
  const v = process.env[k];
  if (v === undefined || v === null || String(v).trim() === "") return def;
  return ["1", "true", "yes", "y", "on"].includes(String(v).trim().toLowerCase());
};

const FLAGS = {
  EMAIL_ON_PAYMENT: envBool("EMAIL_ON_PAYMENT", true),

  // 🛡️ IMPORTANTE:
  // En modo máxima seguridad, NO pagamos al pagar.
  // El payout se hace al entregar (admin) o por un job programado.
  PAYOUT_ON_PAYMENT: envBool("PAYOUT_ON_PAYMENT", false),

  // Si STRIPE_LIVEMODE="true" => solo procesa livemode=true
  // Si STRIPE_LIVEMODE="false" => solo procesa livemode=false
  ENFORCE_LIVEMODE: process.env.STRIPE_LIVEMODE !== undefined,

  // Stripe Connect (opcional)
  STRIPE_ACCOUNT_ID: (process.env.STRIPE_ACCOUNT_ID || "").trim() || null,

  // Robustez: devolver 200 aunque falle algo interno (evita reintentos infinitos)
  ALWAYS_200: envBool("STRIPE_WEBHOOK_ALWAYS_200", true),

  // Anti-fraude: exige match de monto (recomendado true en producción)
  ENFORCE_AMOUNT_MATCH: envBool("STRIPE_ENFORCE_AMOUNT_MATCH", true),
};

// -----------------------------
// Helpers
// -----------------------------
const ok = (res) => res.status(200).json({ received: true });
const safeStr = (v, fallback = "") => (v === null || v === undefined ? fallback : String(v));
const now = () => new Date();

function getReqId(req) {
  return (
    req.headers["x-request-id"] ||
    req.headers["x-correlation-id"] ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function log(level, msg, ctx = {}) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...ctx }));
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

// money utils
const toCents = (amount) => {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
};

// -----------------------------
// EMAIL Ledger (idempotencia sin carreras)
// -----------------------------
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
          meta: meta || null,
        },
      },
    }
  );
  return { reserved: !!res?.modifiedCount };
}

async function enviarEmailPagoConfirmadoSafe({ reqId, ordenId, reason, eventId }) {
  try {
    if (!FLAGS.EMAIL_ON_PAYMENT) return;

    const ledgerKey = buildEmailLedgerKey("payment", "pagado");

    const reserved = await reserveEmailLedgerAtomic({
      ordenId,
      ledgerKey,
      meta: { reason, eventId, at: new Date().toISOString() },
    });

    if (!reserved.reserved) {
      log("info", "Email pago ya reservado/enviado (ledger)", { reqId, ordenId, eventId });
      return;
    }

    const orden = await Orden.findById(ordenId).populate("usuario", "email nombre").lean();
    if (!orden) return;

    const usuarioObj = orden?.usuario && typeof orden.usuario === "object" ? orden.usuario : null;
    const email =
      usuarioObj?.email ||
      orden?.email ||
      orden?.clienteEmail ||
      orden?.direccionEntrega?.email ||
      null;

    if (!email) {
      log("warn", "No hay email para orden pagada", { reqId, ordenId, eventId });
      return;
    }

    await enviarCorreoOrdenPagada({
      to: String(email),
      orden,
      meta: { reason, eventId },
    });

    log("info", "Email pago confirmado enviado", { reqId, ordenId, to: String(email), eventId });
  } catch (err) {
    log("warn", "Falló envío email (no bloquea)", {
      reqId,
      ordenId,
      eventId,
      err: err?.message || String(err),
    });
  }
}

// -----------------------------
// ✅ PAYOUT helpers (se mantienen por compatibilidad, pero NO se ejecuta aquí)
// -----------------------------
const buildPayoutLedgerKey = () => `payout_payment_pagado`.slice(0, 120);

async function reservePayoutLedgerAtomic({ ordenId, ledgerKey, meta }) {
  const res = await Orden.updateOne(
    { _id: ordenId, "historial.estado": { $ne: ledgerKey } },
    {
      $push: {
        historial: {
          estado: ledgerKey,
          fecha: new Date(),
          meta: meta || null,
        },
      },
    }
  );
  return { reserved: !!res?.modifiedCount };
}

// ⚠️ En modo máxima seguridad, NO lo llamamos aquí.
// Si algún día quisieras activarlo (no recomendado), úsalo bajo tu propio riesgo.
async function pagarVendedoresSafe({ reqId, ordenId, reason, eventId }) {
  try {
    if (!FLAGS.PAYOUT_ON_PAYMENT) return;

    const ledgerKey = buildPayoutLedgerKey();

    const reserved = await reservePayoutLedgerAtomic({
      ordenId,
      ledgerKey,
      meta: { reason, eventId, at: new Date().toISOString() },
    });

    if (!reserved.reserved) {
      log("info", "Payout ya reservado/ejecutado (ledger)", { reqId, ordenId, eventId });
      return;
    }

    await pagarVendedoresDeOrden({ ordenId, eventId, reason });

    log("info", "Payout ejecutado (vendedores)", { reqId, ordenId, eventId, reason });
  } catch (err) {
    log("warn", "Falló payout (no bloquea)", {
      reqId,
      ordenId,
      eventId,
      err: err?.message || String(err),
    });

    await Orden.updateOne(
      { _id: ordenId },
      {
        $push: {
          historial: {
            estado: "payout_failed",
            fecha: new Date(),
            meta: {
              eventId,
              reason,
              err: safeStr(err?.message || err).slice(0, 500),
              at: new Date().toISOString(),
            },
          },
        },
      }
    ).catch(() => {});
  }
}

// -----------------------------
// WebhookEvent persistence (idempotencia por eventId)
// -----------------------------
async function markEvent({ event, status, ordenId = null, errorMessage = "", summary = {}, reqId }) {
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
      return { created: false, doc: await WebhookEvent.findOne({ eventId: event.id }) };
    }
    throw err;
  }
}

// -----------------------------
// Orden: ledger Stripe eventIds (idempotencia por ORDEN)
// ✅ guarda eventId en la orden y limita a últimos 50
// -----------------------------
async function addStripeEventIdToOrden({ ordenId, eventId }) {
  if (!ordenId || !eventId) return;

  await Orden.updateOne(
    { _id: ordenId },
    {
      $addToSet: { stripeEventIds: String(eventId) },
    }
  ).catch(() => {});

  // Limitar a 50 (sin transacciones, pero suficiente)
  await Orden.updateOne(
    { _id: ordenId },
    {
      $push: {
        stripeEventIds: {
          $each: [],
          $slice: -50,
        },
      },
    }
  ).catch(() => {});
}

// -----------------------------
// Auditoría Orden (campos Stripe)
// -----------------------------
function setOrdenAuditFields({ update, eventId, detail }) {
  if (!update.$set) update.$set = {};
  update.$set.stripeLatestEventId = safeStr(eventId, "");
  if (detail) update.$set.paymentStatusDetail = safeStr(detail, "").slice(0, 500);
}

// -----------------------------
// Anti-fraude: validar amount_total vs orden.total
// - Stripe amount_total viene en centavos
// - Orden.total está en dólares => convertimos
// -----------------------------
async function validarMontoSiAplica({ ordenId, stripeAmountTotal, reqId, eventId, eventType }) {
  if (!FLAGS.ENFORCE_AMOUNT_MATCH) return { ok: true };

  if (stripeAmountTotal == null) return { ok: true };

  const orden = await Orden.findById(ordenId).select("total moneda estadoPago").lean();
  if (!orden) return { ok: false, reason: "ORDER_NOT_FOUND" };

  const totalCents = toCents(orden.total);
  if (totalCents == null) return { ok: false, reason: "ORDER_TOTAL_INVALID" };

  const stripeCents = Number(stripeAmountTotal) || 0;

  // tolerancia 1 centavo
  const diff = Math.abs(totalCents - stripeCents);

  if (diff > 1) {
    log("error", "Monto mismatch (possible fraud/misconfig)", {
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

  return { ok: true };
}

/**
 * Marca PAGADA de forma atómica (no duplica, no downgrade)
 */
async function marcarOrdenPagadaAtomico({ ordenId, sessionLike, eventId, detail = "" }) {
  const update = {
    $set: {
      estadoPago: "pagado",
      metodoPago: "stripe",
      paymentProvider: "stripe",
      estadoFulfillment: "pendiente",
      paidAt: now(),
      failedAt: null,
      refundedAt: null,
    },
  };

  const obj = sessionLike || {};

  if (obj?.id) update.$set.stripeSessionId = safeStr(obj.id);
  if (obj?.payment_intent) update.$set.stripePaymentIntentId = safeStr(obj.payment_intent);
  if (obj?.currency) update.$set.moneda = safeStr(obj.currency, "usd").toLowerCase();

  // Auditoría monetaria (si tu Orden schema lo soporta, si no, no rompe)
  if (obj?.amount_total != null) update.$set.stripeAmountTotal = Number(obj.amount_total) || 0;
  if (obj?.amount_received != null) update.$set.stripeAmountReceived = Number(obj.amount_received) || 0;
  if (obj?.customer) update.$set.stripeCustomerId = safeStr(obj.customer);

  setOrdenAuditFields({ update, eventId, detail });

  return await Orden.findOneAndUpdate(
    { _id: ordenId, estadoPago: { $ne: "pagado" } },
    update,
    { new: true }
  );
}

async function marcarOrdenFallidaAtomico({ ordenId, eventId, detail = "", clearSession = false }) {
  const update = {
    $set: {
      estadoPago: "fallido",
      metodoPago: "stripe",
      paymentProvider: "stripe",
      failedAt: now(),
    },
  };

  if (clearSession) update.$set.stripeSessionId = "";

  setOrdenAuditFields({ update, eventId, detail });

  return await Orden.findOneAndUpdate(
    { _id: ordenId, estadoPago: { $ne: "pagado" } },
    update,
    { new: true }
  );
}

async function marcarOrdenReembolsadaAtomico({ ordenId, eventId, detail = "" }) {
  const update = {
    $set: {
      estadoPago: "reembolsado",
      metodoPago: "stripe",
      paymentProvider: "stripe",
      refundedAt: now(),
    },
  };

  setOrdenAuditFields({ update, eventId, detail });

  return await Orden.findOneAndUpdate({ _id: ordenId }, update, { new: true });
}

// -----------------------------
// Livemode enforcement
// -----------------------------
function enforceLivemodeOrSkip({ event, reqId }) {
  if (!FLAGS.ENFORCE_LIVEMODE) return { ok: true };

  const desired = String(process.env.STRIPE_LIVEMODE || "").trim().toLowerCase();
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

// Stripe Connect enforcement (opcional)
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
// Controller principal
// ======================================================
exports.procesarWebhookStripe = async (req, res) => {
  const reqId = getReqId(req);

  const signature = getStripeSignature(req);
  if (!signature) return res.status(400).send("Missing stripe-signature header");

  const rawBody = getRawBody(req);
  if (!rawBody) {
    return res.status(400).json({
      ok: false,
      message: 'Missing raw body. Usa express.raw({ type: "application/json" }) en la ruta del webhook.',
    });
  }

  let event;
  try {
    event = construirEventoDesdeWebhook(signature, rawBody);
  } catch (err) {
    log("warn", "Stripe signature invalid", { reqId, err: err?.message || String(err) });
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const liveCheck = enforceLivemodeOrSkip({ event, reqId });
  if (!liveCheck.ok) return ok(res);

  const acctCheck = enforceAccountOrSkip({ req, event, reqId });
  if (!acctCheck.ok) return ok(res);

  const summary = resumirEventoStripe(event);
  const eventId = safeStr(summary?.eventId || event?.id);
  const eventType = safeStr(summary?.eventType || event?.type);

  const obj = event?.data?.object || {};
  const ordenId = summary?.ordenId || getOrdenIdFromStripeObject(obj);

  log("info", "Stripe webhook received", { reqId, eventId, eventType, ordenId: ordenId || null });

  // ------------------------------------------------------
  // Idempotencia por EVENTO
  // ------------------------------------------------------
  let eventRow;
  try {
    const result = await markEvent({
      event,
      status: "received",
      ordenId,
      summary,
      reqId,
    });

    eventRow = result.doc;

    if (!result.created) {
      log("info", "Evento duplicado ignorado (eventId)", { reqId, eventId, eventType });
      return ok(res);
    }
  } catch (err) {
    log("error", "Error guardando WebhookEvent (no bloquea)", { reqId, eventId, err: err?.message || String(err) });
    return ok(res);
  }

  try {
    if (!ordenId) {
      await WebhookEvent.updateOne(
        { _id: eventRow._id },
        { $set: { status: "skipped", errorMessage: "Missing ordenId" } }
      );
      return ok(res);
    }

    // Guardar eventId también en ORDEN (idempotencia por orden / auditoría)
    await addStripeEventIdToOrden({ ordenId, eventId });

    // =============================
    // checkout.session.completed
    // =============================
    if (eventType === "checkout.session.completed") {
      const session = obj;

      if (session?.mode && session.mode !== "payment") {
        const msg = "Session mode != payment";
        await WebhookEvent.updateOne({ _id: eventRow._id }, { $set: { status: "skipped", errorMessage: msg } });
        await Orden.updateOne({ _id: ordenId }, { $set: { stripeLatestEventId: eventId, paymentStatusDetail: msg } }).catch(() => {});
        return ok(res);
      }

      if (session?.payment_status && session.payment_status !== "paid") {
        const msg = `payment_status != paid (${session.payment_status})`;
        await WebhookEvent.updateOne({ _id: eventRow._id }, { $set: { status: "skipped", errorMessage: msg } });
        await Orden.updateOne({ _id: ordenId }, { $set: { stripeLatestEventId: eventId, paymentStatusDetail: msg } }).catch(() => {});
        return ok(res);
      }

      // ✅ Anti-fraude por monto
      const amountCheck = await validarMontoSiAplica({
        ordenId,
        stripeAmountTotal: session?.amount_total,
        reqId,
        eventId,
        eventType,
      });
      if (!amountCheck.ok) {
        await WebhookEvent.updateOne(
          { _id: eventRow._id },
          { $set: { status: "skipped", errorMessage: amountCheck.reason } }
        );
        return ok(res);
      }

      const ordenActualizada = await marcarOrdenPagadaAtomico({
        ordenId,
        sessionLike: session,
        eventId,
        detail: "checkout.session.completed",
      });

      if (ordenActualizada) {
        await enviarEmailPagoConfirmadoSafe({ reqId, ordenId, reason: "checkout.session.completed", eventId });

        // 🛡️ MÁXIMA SEGURIDAD:
        // ❌ NO pagamos vendedores aquí.
        // ✅ Payout se ejecuta al marcar "entregado" en adminOrdenController.js (o en un job con delay).
      }

      await WebhookEvent.updateOne({ _id: eventRow._id }, { $set: { status: "processed", ordenId, summary } });
      return ok(res);
    }

    // =============================
    // checkout.session.async_payment_succeeded
    // =============================
    if (eventType === "checkout.session.async_payment_succeeded") {
      const session = obj;

      const amountCheck = await validarMontoSiAplica({
        ordenId,
        stripeAmountTotal: session?.amount_total,
        reqId,
        eventId,
        eventType,
      });
      if (!amountCheck.ok) {
        await WebhookEvent.updateOne({ _id: eventRow._id }, { $set: { status: "skipped", errorMessage: amountCheck.reason } });
        return ok(res);
      }

      const ordenActualizada = await marcarOrdenPagadaAtomico({
        ordenId,
        sessionLike: session,
        eventId,
        detail: "checkout.session.async_payment_succeeded",
      });

      if (ordenActualizada) {
        await enviarEmailPagoConfirmadoSafe({ reqId, ordenId, reason: "checkout.session.async_payment_succeeded", eventId });

        // 🛡️ MÁXIMA SEGURIDAD: NO payout aquí.
      }

      await WebhookEvent.updateOne({ _id: eventRow._id }, { $set: { status: "processed", ordenId, summary } });
      return ok(res);
    }

    // =============================
    // checkout.session.async_payment_failed
    // =============================
    if (eventType === "checkout.session.async_payment_failed") {
      await marcarOrdenFallidaAtomico({ ordenId, eventId, detail: "checkout.session.async_payment_failed" });
      await WebhookEvent.updateOne({ _id: eventRow._id }, { $set: { status: "processed", ordenId, summary } });
      return ok(res);
    }

    // =============================
    // checkout.session.expired
    // =============================
    if (eventType === "checkout.session.expired") {
      await marcarOrdenFallidaAtomico({ ordenId, eventId, detail: "checkout.session.expired", clearSession: true });
      await WebhookEvent.updateOne({ _id: eventRow._id }, { $set: { status: "processed", ordenId, summary } });
      return ok(res);
    }

    // =============================
    // payment_intent.payment_failed
    // =============================
    if (eventType === "payment_intent.payment_failed") {
      await marcarOrdenFallidaAtomico({ ordenId, eventId, detail: "payment_intent.payment_failed" });
      await WebhookEvent.updateOne({ _id: eventRow._id }, { $set: { status: "processed", ordenId, summary } });
      return ok(res);
    }

    // =============================
    // payment_intent.succeeded (fallback)
    // =============================
    if (eventType === "payment_intent.succeeded") {
      const intent = obj;

      const ordenActualizada = await marcarOrdenPagadaAtomico({
        ordenId,
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
        await enviarEmailPagoConfirmadoSafe({ reqId, ordenId, reason: "payment_intent.succeeded", eventId });
        // 🛡️ MÁXIMA SEGURIDAD: NO payout aquí.
      }

      await WebhookEvent.updateOne({ _id: eventRow._id }, { $set: { status: "processed", ordenId, summary } });
      return ok(res);
    }

    // =============================
    // charge.succeeded (fallback)
    // =============================
    if (eventType === "charge.succeeded") {
      const charge = obj;

      const ordenActualizada = await marcarOrdenPagadaAtomico({
        ordenId,
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
        await enviarEmailPagoConfirmadoSafe({ reqId, ordenId, reason: "charge.succeeded", eventId });
        // 🛡️ MÁXIMA SEGURIDAD: NO payout aquí.
      }

      await WebhookEvent.updateOne({ _id: eventRow._id }, { $set: { status: "processed", ordenId, summary } });
      return ok(res);
    }

    // =============================
    // refunds
    // =============================
    if (eventType === "charge.refunded" || eventType === "refund.updated") {
      await marcarOrdenReembolsadaAtomico({ ordenId, eventId, detail: eventType });
      await WebhookEvent.updateOne({ _id: eventRow._id }, { $set: { status: "processed", ordenId, summary } });
      return ok(res);
    }

    // No manejado
    await WebhookEvent.updateOne({ _id: eventRow._id }, { $set: { status: "skipped", ordenId, summary } });

    await Orden.updateOne(
      { _id: ordenId },
      { $set: { stripeLatestEventId: eventId, paymentStatusDetail: `unhandled_event:${eventType}` } }
    ).catch(() => {});

    return ok(res);
  } catch (err) {
    log("error", "Webhook fatal error", {
      reqId,
      eventId,
      eventType,
      ordenId: ordenId || null,
      err: err?.message || String(err),
    });

    await WebhookEvent.updateOne(
      { _id: eventRow?._id },
      { $set: { status: "failed", errorMessage: safeStr(err?.message || err).slice(0, 500), ordenId: ordenId || null, summary } }
    ).catch(() => {});

    await Orden.updateOne(
      { _id: ordenId },
      { $set: { stripeLatestEventId: eventId, paymentStatusDetail: `webhook_failed:${safeStr(err?.message || err).slice(0, 250)}` } }
    ).catch(() => {});

    if (FLAGS.ALWAYS_200) return ok(res);
    return res.status(500).json({ ok: false, message: "Webhook processing failed" });
  }
};