// ==========================================================
// adminOrdenController.js — Admin Órdenes (ENTERPRISE ULTRA)
// ==========================================================
//
// Incluye:
// ✅ Listado paginado + filtros + búsqueda (lookup PRO)
// ✅ Métricas pro (totales, pagadas, pendientes, fallidas)
// ✅ Detalle de orden
// ✅ Actualizar estado pago/fulfillment (admin) + AUDIT + LEDGER
// ✅ Validación estricta de enums (incluye filtros del listado)
// ✅ Colección Usuario dinámica (sin suposiciones)
// ✅ Respuesta consistente y segura
// ✅ EMAIL: notifica al cliente cuando cambia fulfillment (idempotente)
// ✅ EMAIL: (opcional) notifica cambios de pago (idempotente)
// ✅ Fail-safe: email NO rompe endpoint
// ✅ Feature flags por ENV para producción
// ✅ Logger estructurado (sin dependencias extra)
//
// ✅ TIMELINE AMAZON-LIKE:
//    - Registra eventos de cambios (fulfillment/pago) en historial
//    - Idempotente (no duplica el mismo evento consecutivo)
//    - Fuente para /public/:id/timeline
//
// ✅ (AÑADIDO SIN ROMPER NADA):
//    - Payouts automáticos Stripe Connect al marcar "entregado"
//    - Idempotencia por proveedor (ledger en historial)
//    - Usa Orden.items.ingresoVendedor (si existe) como fuente de verdad
//    - Resuelve Stripe Account por ENV (STRIPE_VENDOR_ACCOUNTS_JSON)
//    - Si no hay mapping, NO rompe: registra historial y continúa
//
// Requiere middleware: proteger + soloAdmin
// ==========================================================

const mongoose = require("mongoose");
const Orden = require("../models/Orden");

// ✅ Stripe (opcional) para payouts automáticos
let stripe = null;
try {
  ({ stripe } = require("./stripeService"));
} catch (_) {
  stripe = null;
}

// ✅ Realtime SSE emitter
let emitOrdenUpdate = null;
try {
  ({ emitOrdenUpdate } = require("./ordenRealtimeController"));
} catch (_) {
  emitOrdenUpdate = null;
}

// ✅ Email service (ya lo tienes)
let EmailService = null;
try {
  EmailService = require("../services/emailService");
} catch (e) {
  EmailService = null;
}

// (OPCIONAL) Modelo Usuario para lookup robusto
let UsuarioModel = null;
try {
  UsuarioModel = require("../models/Usuario");
} catch (_) {
  UsuarioModel = null;
}

// ==========================================================
// Helpers base (HTTP)
// ==========================================================
const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const send = (res, statusCode, payload) => res.status(statusCode).json(payload);

const ok = (res, { message = "OK", data = null, meta = null } = {}) =>
  send(res, 200, { ok: true, message, data, meta });

const bad = (res, message = "Bad Request", extra = {}) =>
  send(res, 400, { ok: false, message, ...extra });

const forbidden = (res, message = "Acceso denegado") =>
  send(res, 403, { ok: false, message });

const notFound = (res, message = "No encontrado") =>
  send(res, 404, { ok: false, message });

const serverError = (res, message = "Error interno", extra = {}) =>
  send(res, 500, { ok: false, message, ...extra });

// ==========================================================
// Helpers utilitarios (safe)
// ==========================================================
const safeInt = (v, def = 0) => {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : def;
};

const safeFloat = (v, def = 0) => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : def;
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const safeString = (v, def = "") => (typeof v === "string" ? v.trim() : def);

const lower = (v) => safeString(v, "").toLowerCase();

const now = () => new Date();

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeDateFromQuery(v) {
  const s = safeString(v, "");
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// ==========================================================
// Feature flags por ENV (prod-ready)
// ==========================================================
function envBool(key, def = false) {
  const v = process.env[key];
  if (v === undefined || v === null || String(v).trim() === "") return def;
  const s = String(v).trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(s);
}

const FLAGS = {
  EMAIL_ON_FULFILLMENT: envBool("EMAIL_ON_FULFILLMENT", true),
  EMAIL_ON_PAYMENT_STATUS: envBool("EMAIL_ON_PAYMENT_STATUS", false), // opcional
  EMAIL_VERBOSE_LOGS: envBool("EMAIL_VERBOSE_LOGS", true),

  // Si lo enciendes, bloquea cambios “peligrosos” de fulfillment cuando la orden no está pagada (excepto cancelado).
  ENFORCE_FULFILLMENT_REQUIRES_PAID: envBool(
    "ENFORCE_FULFILLMENT_REQUIRES_PAID",
    true
  ),

  // Si lo enciendes, impide cambiar el pago por admin a "pagado" si no hay evidencia (útil si solo Stripe debe hacerlo)
  ENFORCE_PAYMENT_IS_STRIPE_ONLY: envBool(
    "ENFORCE_PAYMENT_IS_STRIPE_ONLY",
    false
  ),

  // ============================
  // 🔥 TIMELINE AMAZON-LIKE FLAGS
  // ============================
  TIMELINE_ON_FULFILLMENT: envBool("TIMELINE_ON_FULFILLMENT", true),
  TIMELINE_ON_PAYMENT: envBool("TIMELINE_ON_PAYMENT", true),
  TIMELINE_VERBOSE_LOGS: envBool("TIMELINE_VERBOSE_LOGS", true),

  // ============================
  // 🔥 REALTIME FLAGS
  // ============================
  REALTIME_ON_ADMIN_UPDATE: envBool("REALTIME_ON_ADMIN_UPDATE", true),
  REALTIME_ON_EMAIL_LEDGER: envBool("REALTIME_ON_EMAIL_LEDGER", false), // normalmente no hace falta

  // ============================
  // ✅ PAYOUTS AUTOMÁTICOS (Stripe Connect)
  // ============================
  AUTO_PAYOUT_ON_DELIVERED: envBool("AUTO_PAYOUT_ON_DELIVERED", true),
  AUTO_PAYOUT_REQUIRE_PAID: envBool("AUTO_PAYOUT_REQUIRE_PAID", true),

  // Si está activo, solo intenta payouts si hay stripeService disponible
  AUTO_PAYOUT_REQUIRE_STRIPE: envBool("AUTO_PAYOUT_REQUIRE_STRIPE", true),

  // Environments:
  // STRIPE_VENDOR_ACCOUNTS_JSON='{"local":"acct_123","proveedorX":"acct_456"}'
  STRIPE_VENDOR_ACCOUNTS_JSON: safeString(process.env.STRIPE_VENDOR_ACCOUNTS_JSON || process.env.STRIPE_VENDOR_ACCOUNTS || ""),
};

// ==========================================================
// Logger estructurado (sin libs)
// ==========================================================
function getRequestId(req) {
  return (
    req.headers["x-request-id"] ||
    req.headers["x-correlation-id"] ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function log(level, msg, ctx = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...ctx,
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
}

// ==========================================================
// REALTIME EMIT (safe)
// ==========================================================
function emitRealtimeSafe(ordenDocOrLean, ctx = {}) {
  try {
    if (!FLAGS.REALTIME_ON_ADMIN_UPDATE) return;
    if (typeof emitOrdenUpdate !== "function") return;

    const ordenId = String(ordenDocOrLean?._id || "");
    if (!ordenId) return;

    const payload =
      ordenDocOrLean?.toObject && typeof ordenDocOrLean.toObject === "function"
        ? ordenDocOrLean.toObject()
        : ordenDocOrLean;

    // ✅ Firma correcta: (ordenId, payload)
    emitOrdenUpdate(ordenId, payload);
  } catch (e) {
    log("warn", "Realtime emit error (no bloquea)", {
      ...ctx,
      err: e?.message || String(e),
    });
  }
}

// ==========================================================
// Enums (alineados con tu schema Orden)
// ==========================================================
const ESTADOS_PAGO = new Set(["pendiente", "pagado", "fallido", "reembolsado"]);
const ESTADOS_FULFILLMENT = new Set([
  "pendiente",
  "procesando",
  "enviado",
  "entregado",
  "cancelado",
]);

function validateEstadoPagoOrAll(value) {
  if (!value || value === "all") return { ok: true };
  if (!ESTADOS_PAGO.has(value)) {
    return {
      ok: false,
      message: "estadoPago inválido",
      allowed: Array.from(ESTADOS_PAGO),
    };
  }
  return { ok: true };
}

function validateEstadoFulfillmentOrAll(value) {
  if (!value || value === "all") return { ok: true };
  if (!ESTADOS_FULFILLMENT.has(value)) {
    return {
      ok: false,
      message: "estadoFulfillment inválido",
      allowed: Array.from(ESTADOS_FULFILLMENT),
    };
  }
  return { ok: true };
}

// ==========================================================
// Colección Usuario para $lookup (robusta)
// ==========================================================
function getUserCollectionName() {
  if (
    process.env.USER_COLLECTION &&
    String(process.env.USER_COLLECTION).trim()
  ) {
    return String(process.env.USER_COLLECTION).trim();
  }
  if (UsuarioModel?.collection?.name) return UsuarioModel.collection.name;
  return "usuarios";
}

// ==========================================================
// Sort parser
// ==========================================================
function parseSort(sort) {
  switch (sort) {
    case "createdAt_asc":
      return { createdAt: 1 };
    case "total_desc":
      return { total: -1 };
    case "total_asc":
      return { total: 1 };
    case "paidAt_desc":
      return { paidAt: -1 };
    case "paidAt_asc":
      return { paidAt: 1 };
    case "createdAt_desc":
    default:
      return { createdAt: -1 };
  }
}

// ==========================================================
// Historial: compatibilidad con docs viejos
// ==========================================================
function ensureHistorialArray(orden) {
  if (!orden) return;
  if (!Array.isArray(orden.historial)) orden.historial = [];
}

function pushHistorial(orden, estado, meta = null) {
  ensureHistorialArray(orden);
  orden.historial.push({ estado, fecha: now(), meta: meta || null });
}

// ==========================================================
// 🔥 TIMELINE AMAZON-LIKE
// ==========================================================
function timelineKey(kind) {
  return `timeline_${String(kind || "").toLowerCase()}`.slice(0, 60);
}

function buildTimelineEvent(kind, from, to, meta = {}) {
  return {
    estado: timelineKey(kind),
    fecha: now(),
    meta: {
      kind,
      from: from ?? null,
      to: to ?? null,
      ...meta,
    },
  };
}

function lastHistorialEntry(orden) {
  const h = Array.isArray(orden?.historial) ? orden.historial : [];
  return h.length ? h[h.length - 1] : null;
}

function pushTimelineEventIdempotent(orden, kind, from, to, meta = {}) {
  ensureHistorialArray(orden);

  const next = buildTimelineEvent(kind, from, to, meta);
  const last = lastHistorialEntry(orden);

  if (
    last?.estado === next.estado &&
    last?.meta?.kind === next.meta.kind &&
    String(last?.meta?.from ?? "") === String(next?.meta?.from ?? "") &&
    String(last?.meta?.to ?? "") === String(next?.meta?.to ?? "")
  ) {
    return { pushed: false, reason: "DUPLICATE_CONSECUTIVE" };
  }

  orden.historial.push(next);
  return { pushed: true };
}

// ==========================================================
// EMAIL ENGINE (ENTERPRISE)
// ==========================================================
function buildEmailLedgerKey(kind, value) {
  return `email_${kind}_${String(value || "").toLowerCase()}`.slice(0, 120);
}

function hasEmailLedger(orden, ledgerKey) {
  const h = Array.isArray(orden?.historial) ? orden.historial : [];
  return h.some((x) => x?.estado === ledgerKey);
}

function extractCustomerEmail(orden) {
  const usuarioObj =
    orden?.usuario && typeof orden.usuario === "object" ? orden.usuario : null;

  return (
    usuarioObj?.email ||
    orden?.email ||
    orden?.clienteEmail ||
    orden?.direccionEntrega?.email ||
    null
  );
}

async function safeSendEmail({
  type,
  orden,
  to,
  payload = {},
  ledgerKey,
  reqId,
}) {
  try {
    if (!EmailService) {
      if (FLAGS.EMAIL_VERBOSE_LOGS) {
        log("warn", "EmailService no disponible (require falló)", { reqId });
      }
      return { sent: false, reason: "EMAIL_SERVICE_MISSING" };
    }

    if (!to) return { sent: false, reason: "NO_EMAIL" };

    if (ledgerKey && hasEmailLedger(orden, ledgerKey)) {
      return { sent: false, reason: "ALREADY_SENT" };
    }

    if (type === "fulfillment") {
      if (typeof EmailService.enviarCorreoCambioEstado !== "function") {
        return {
          sent: false,
          reason: "MISSING_FN_enviarCorreoCambioEstado",
        };
      }
      await EmailService.enviarCorreoCambioEstado({
        to,
        orden: orden.toObject ? orden.toObject() : orden,
        nuevoEstado: payload.nuevoEstado,
      });
    } else if (type === "payment") {
      if (typeof EmailService.enviarCorreoOrdenPagada !== "function") {
        return { sent: false, reason: "MISSING_FN_enviarCorreoOrdenPagada" };
      }
      await EmailService.enviarCorreoOrdenPagada({
        to,
        orden: orden.toObject ? orden.toObject() : orden,
      });
    } else {
      return { sent: false, reason: "UNKNOWN_EMAIL_TYPE" };
    }

    // Ledger idempotente
    if (ledgerKey) {
      pushHistorial(orden, ledgerKey, {
        type,
        to,
        payload,
        at: new Date().toISOString(),
      });

      // Best effort save (no rompe)
      await orden.save().catch(() => {});

      // ✅ (opcional) emitir por ledger si lo quieres (por defecto lo dejo apagado)
      if (FLAGS.REALTIME_ON_EMAIL_LEDGER) {
        emitRealtimeSafe(orden, { reqId, source: "email_ledger" });
      }
    }

    if (FLAGS.EMAIL_VERBOSE_LOGS) {
      log("info", "Email enviado", {
        reqId,
        type,
        to,
        ledgerKey: ledgerKey || "n/a",
      });
    }

    return { sent: true };
  } catch (err) {
    log("warn", "Email falló (no bloquea)", {
      reqId,
      err: err?.message || String(err),
    });
    return { sent: false, reason: "SEND_FAILED" };
  }
}

// ==========================================================
// ✅ PAYOUTS AUTOMÁTICOS (Stripe Connect) — helpers
// ==========================================================
function toCents(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function normalizeCurrency(v) {
  return String(v || "usd").trim().toLowerCase() || "usd";
}

function buildPayoutLedgerKey(proveedor) {
  return `payout_${String(proveedor || "unknown").toLowerCase()}`.slice(0, 120);
}

function hasPayoutLedger(orden, proveedor) {
  const key = buildPayoutLedgerKey(proveedor);
  const h = Array.isArray(orden?.historial) ? orden.historial : [];
  return h.some((x) => x?.estado === key);
}

function parseVendorAccountsMap() {
  const raw = FLAGS.STRIPE_VENDOR_ACCOUNTS_JSON;
  if (!raw) return {};

  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return {};
    return obj;
  } catch {
    // permitir formato "a=acct_x,b=acct_y"
    try {
      const out = {};
      String(raw)
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .forEach((pair) => {
          const [k, v] = pair.split("=").map((x) => (x || "").trim());
          if (k && v) out[k] = v;
        });
      return out;
    } catch {
      return {};
    }
  }
}

/**
 * Procesa payouts por proveedor usando Stripe Transfers (Connect)
 * - Fuente de verdad: items[].ingresoVendedor (si existe)
 * - Fallback: si no existe ingresoVendedor, usa (subtotal - comisionMonto) si existe
 * - Idempotencia: historial estado "payout_<proveedor>"
 * - Guarda transferId en proveedores[].referenciaProveedor y marca estadoPagoProveedor="pagado"
 * - Si no hay mapping proveedor -> account, NO rompe: registra historial "payout_skipped_*"
 */
async function procesarPayoutsMarketplace({ orden, reqId, adminId }) {
  const result = {
    attempted: false,
    processed: [],
    skipped: [],
    errors: [],
  };

  try {
    if (!FLAGS.AUTO_PAYOUT_ON_DELIVERED) return result;

    // Si exiges Stripe y no está disponible, no intentamos
    if (FLAGS.AUTO_PAYOUT_REQUIRE_STRIPE && !stripe) {
      result.skipped.push({ reason: "STRIPE_NOT_AVAILABLE" });
      return result;
    }

    // Requiere pagada (recomendado)
    if (FLAGS.AUTO_PAYOUT_REQUIRE_PAID && orden?.estadoPago !== "pagado") {
      result.skipped.push({ reason: "ORDER_NOT_PAID" });
      return result;
    }

    const items = Array.isArray(orden?.items) ? orden.items : [];
    if (!items.length) {
      result.skipped.push({ reason: "NO_ITEMS" });
      return result;
    }

    const vendorMap = parseVendorAccountsMap();

    // Agrupar por proveedor
    const byProveedor = new Map(); // proveedor -> { amount, currency }
    for (const it of items) {
      const proveedor = safeString(it?.proveedor, "local") || "local";

      // ingreso vendedor preferido (tu Orden.js ya lo calcula)
      const ingresoVendedor = Number(it?.ingresoVendedor);

      // fallback
      const subtotal = Number(it?.subtotal);
      const comisionMonto = Number(it?.comisionMonto);

      let amount = 0;
      if (Number.isFinite(ingresoVendedor)) {
        amount = ingresoVendedor;
      } else if (Number.isFinite(subtotal) && Number.isFinite(comisionMonto)) {
        amount = subtotal - comisionMonto;
      } else if (Number.isFinite(subtotal)) {
        // último fallback: subtotal
        amount = subtotal;
      }

      amount = Math.max(0, amount);

      const prev = byProveedor.get(proveedor) || { amount: 0 };
      byProveedor.set(proveedor, { amount: prev.amount + amount });
    }

    const currency = normalizeCurrency(orden?.moneda || "usd");
    const ordenId = String(orden?._id || "");
    if (!ordenId) {
      result.skipped.push({ reason: "MISSING_ORDEN_ID" });
      return result;
    }

    result.attempted = true;

    // Ejecutar por proveedor
    for (const [proveedor, data] of byProveedor.entries()) {
      const amount = Math.round((Number(data.amount) || 0) * 100) / 100;
      const ledgerKey = buildPayoutLedgerKey(proveedor);

      // idempotencia
      if (hasPayoutLedger(orden, proveedor)) {
        result.skipped.push({ proveedor, reason: "ALREADY_PAID_OUT" });
        continue;
      }

      // resolver account id por ENV mapping
      const destAccount = vendorMap?.[proveedor] || vendorMap?.[String(proveedor).toLowerCase()] || null;
      if (!destAccount) {
        // registra y sigue (no rompe)
        pushHistorial(orden, ledgerKey, {
          status: "skipped",
          reason: "MISSING_VENDOR_ACCOUNT_MAPPING",
          proveedor,
          at: new Date().toISOString(),
          reqId,
          adminId,
        });

        result.skipped.push({ proveedor, reason: "MISSING_VENDOR_ACCOUNT_MAPPING" });
        continue;
      }

      const cents = toCents(amount);
      if (!cents || cents <= 0) {
        pushHistorial(orden, ledgerKey, {
          status: "skipped",
          reason: "ZERO_AMOUNT",
          proveedor,
          amount,
          at: new Date().toISOString(),
          reqId,
          adminId,
        });
        result.skipped.push({ proveedor, reason: "ZERO_AMOUNT" });
        continue;
      }

      try {
        // Stripe Transfer (Connect)
        const transfer = await stripe.transfers.create(
          {
            amount: cents,
            currency,
            destination: String(destAccount),
            metadata: {
              ordenId,
              proveedor: String(proveedor),
              adminId: adminId ? String(adminId) : "",
            },
          },
          {
            // idempotencia Stripe por orden+proveedor
            idempotencyKey: `payout_${ordenId}_${String(proveedor).toLowerCase()}`.slice(0, 255),
          }
        );

        // Ledger en historial (idempotencia)
        pushHistorial(orden, ledgerKey, {
          status: "paid",
          proveedor,
          amount,
          cents,
          currency,
          destination: String(destAccount),
          transferId: transfer?.id || null,
          at: new Date().toISOString(),
          reqId,
          adminId,
        });

        // Marcar proveedor pagado en proveedores[] (si existe)
        if (Array.isArray(orden.proveedores)) {
          const row = orden.proveedores.find(
            (x) => safeString(x?.proveedor, "").trim() === String(proveedor).trim()
          );
          if (row) {
            row.estadoPagoProveedor = "pagado";
            row.referenciaProveedor = transfer?.id ? String(transfer.id) : row.referenciaProveedor;
          }
        }

        result.processed.push({
          proveedor,
          amount,
          cents,
          currency,
          destination: String(destAccount),
          transferId: transfer?.id || null,
        });
      } catch (e) {
        // Registra error pero NO rompe endpoint
        pushHistorial(orden, ledgerKey, {
          status: "failed",
          proveedor,
          amount,
          cents,
          currency,
          destination: String(destAccount),
          err: e?.message || String(e),
          at: new Date().toISOString(),
          reqId,
          adminId,
        });

        result.errors.push({
          proveedor,
          err: e?.message || String(e),
        });
      }
    }

    // Guardar cambios de historial/proveedores (best effort)
    await orden.save().catch(() => {});
    return result;
  } catch (e) {
    result.errors.push({ err: e?.message || String(e) });
    return result;
  }
}

// ==========================================================
// GET /api/ordenes/admin
// ==========================================================
exports.adminListarOrdenes = async (req, res) => {
  const reqId = getRequestId(req);

  try {
    if (req.usuario?.rol !== "admin") return forbidden(res);

    const page = clamp(safeInt(req.query.page, 1), 1, 100000);
    const limit = clamp(safeInt(req.query.limit, 20), 1, 100);
    const skip = (page - 1) * limit;

    const q = lower(req.query.q);
    const estadoPago = safeString(req.query.estadoPago) || "all";
    const estadoFulfillment = safeString(req.query.estadoFulfillment) || "all";
    const sort = safeString(req.query.sort) || "createdAt_desc";

    const vPago = validateEstadoPagoOrAll(estadoPago);
    if (!vPago.ok) return bad(res, vPago.message, { allowed: vPago.allowed });

    const vFul = validateEstadoFulfillmentOrAll(estadoFulfillment);
    if (!vFul.ok) return bad(res, vFul.message, { allowed: vFul.allowed });

    const filter = {};

    if (estadoPago !== "all") filter.estadoPago = estadoPago;
    if (estadoFulfillment !== "all")
      filter.estadoFulfillment = estadoFulfillment;

    const minTotal = safeFloat(req.query.minTotal, NaN);
    const maxTotal = safeFloat(req.query.maxTotal, NaN);

    if (Number.isFinite(minTotal) || Number.isFinite(maxTotal)) {
      filter.total = {};
      if (Number.isFinite(minTotal)) filter.total.$gte = minTotal;
      if (Number.isFinite(maxTotal)) filter.total.$lte = maxTotal;
    }

    const from = safeDateFromQuery(req.query.from);
    const to = safeDateFromQuery(req.query.to);
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = from;
      if (to) filter.createdAt.$lte = to;
    }

    if (q && isObjectId(q)) {
      filter.$or = [{ _id: q }];

      const [totalDocs, docs] = await Promise.all([
        Orden.countDocuments(filter),
        Orden.find(filter)
          .populate("usuario", "nombre email rol")
          .sort(parseSort(sort))
          .skip(skip)
          .limit(limit)
          .lean(),
      ]);

      return ok(res, {
        message: "Órdenes (admin)",
        data: docs,
        meta: {
          page,
          limit,
          total: totalDocs,
          pages: Math.ceil(totalDocs / limit) || 1,
          reqId,
        },
      });
    }

    if (!q) {
      const [totalDocs, docs] = await Promise.all([
        Orden.countDocuments(filter),
        Orden.find(filter)
          .populate("usuario", "nombre email rol")
          .sort(parseSort(sort))
          .skip(skip)
          .limit(limit)
          .lean(),
      ]);

      return ok(res, {
        message: "Órdenes (admin)",
        data: docs,
        meta: {
          page,
          limit,
          total: totalDocs,
          pages: Math.ceil(totalDocs / limit) || 1,
          reqId,
        },
      });
    }

    const userCollection = getUserCollectionName();

    const pipeline = [
      { $match: { ...filter } },
      {
        $lookup: {
          from: userCollection,
          localField: "usuario",
          foreignField: "_id",
          as: "usuarioDoc",
        },
      },
      { $unwind: { path: "$usuarioDoc", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          usuarioNombre: { $ifNull: ["$usuarioDoc.nombre", ""] },
          usuarioEmail: { $ifNull: ["$usuarioDoc.email", ""] },
        },
      },
      {
        $match: {
          $or: [
            { usuarioNombre: { $regex: escapeRegex(q), $options: "i" } },
            { usuarioEmail: { $regex: escapeRegex(q), $options: "i" } },
            {
              $expr: {
                $regexMatch: {
                  input: { $toString: "$_id" },
                  regex: escapeRegex(q),
                  options: "i",
                },
              },
            },
          ],
        },
      },
      { $sort: parseSort(sort) },
      {
        $facet: {
          meta: [{ $count: "total" }],
          data: [{ $skip: skip }, { $limit: limit }],
        },
      },
    ];

    const agg = await Orden.aggregate(pipeline);

    const metaTotal = agg?.[0]?.meta?.[0]?.total || 0;

    const docs = (agg?.[0]?.data || []).map((o) => {
      const usuario = o.usuarioDoc
        ? {
            _id: o.usuarioDoc._id,
            nombre: o.usuarioDoc.nombre,
            email: o.usuarioDoc.email,
            rol: o.usuarioDoc.rol,
          }
        : o.usuario;

      delete o.usuarioDoc;
      delete o.usuarioNombre;
      delete o.usuarioEmail;

      return { ...o, usuario };
    });

    return ok(res, {
      message: "Órdenes (admin)",
      data: docs,
      meta: {
        page,
        limit,
        total: metaTotal,
        pages: Math.ceil(metaTotal / limit) || 1,
        reqId,
      },
    });
  } catch (err) {
    log("error", "adminListarOrdenes error", {
      reqId,
      err: err?.message || String(err),
    });
    return serverError(res, "Error interno listando órdenes", { reqId });
  }
};

// ==========================================================
// GET /api/ordenes/admin/:id
// ==========================================================
exports.adminObtenerOrden = async (req, res) => {
  const reqId = getRequestId(req);

  try {
    if (req.usuario?.rol !== "admin") return forbidden(res);

    const { id } = req.params;
    if (!isObjectId(id)) return bad(res, "ID inválido");

    const orden = await Orden.findById(id)
      .populate("usuario", "nombre email rol")
      .lean();

    if (!orden) return notFound(res, "Orden no encontrada");

    return ok(res, {
      message: "Detalle de orden (admin)",
      data: orden,
      meta: { reqId },
    });
  } catch (err) {
    log("error", "adminObtenerOrden error", {
      reqId,
      err: err?.message || String(err),
    });
    return serverError(res, "Error interno consultando orden", { reqId });
  }
};

// ==========================================================
// PUT /api/ordenes/admin/:id/estado
// Body: { estadoPago?, estadoFulfillment? }
// ==========================================================
exports.adminActualizarEstado = async (req, res) => {
  const reqId = getRequestId(req);

  try {
    if (req.usuario?.rol !== "admin") return forbidden(res);

    const { id } = req.params;
    if (!isObjectId(id)) return bad(res, "ID inválido");

    const estadoPago = safeString(req.body?.estadoPago);
    const estadoFulfillment = safeString(req.body?.estadoFulfillment);

    if (!estadoPago && !estadoFulfillment) {
      return bad(res, "Debes enviar estadoPago y/o estadoFulfillment");
    }

    if (estadoPago && !ESTADOS_PAGO.has(estadoPago)) {
      return bad(res, "estadoPago inválido", {
        allowed: Array.from(ESTADOS_PAGO),
      });
    }

    if (estadoFulfillment && !ESTADOS_FULFILLMENT.has(estadoFulfillment)) {
      return bad(res, "estadoFulfillment inválido", {
        allowed: Array.from(ESTADOS_FULFILLMENT),
      });
    }

    // populate usuario para email
    const orden = await Orden.findById(id).populate("usuario", "email nombre");
    if (!orden) return notFound(res, "Orden no encontrada");

    ensureHistorialArray(orden);

    const adminId = req.usuario?._id?.toString?.() || req.usuario?.id || null;

    const cambios = {};
    let fulfillmentCambioReal = false;
    let paymentCambioReal = false;

    const prevFulfillment = orden.estadoFulfillment;
    const prevPago = orden.estadoPago;

    // --------------------------------------------
    // Reglas opcionales (enterprise / compliance)
    // --------------------------------------------
    if (FLAGS.ENFORCE_PAYMENT_IS_STRIPE_ONLY && estadoPago === "pagado") {
      return bad(
        res,
        "Pago solo puede marcarlo Stripe (ENFORCE_PAYMENT_IS_STRIPE_ONLY activo)"
      );
    }

    if (
      FLAGS.ENFORCE_FULFILLMENT_REQUIRES_PAID &&
      estadoFulfillment &&
      estadoFulfillment !== "cancelado" &&
      orden.estadoPago !== "pagado"
    ) {
      return bad(
        res,
        "No se puede avanzar fulfillment si la orden no está pagada (flag activo)"
      );
    }

    // --------------------------------------------
    // Aplicar cambios
    // --------------------------------------------
    if (estadoPago && orden.estadoPago !== estadoPago) {
      paymentCambioReal = true;
      cambios.estadoPago = { from: orden.estadoPago, to: estadoPago };
      orden.estadoPago = estadoPago;
    }

    if (estadoFulfillment && orden.estadoFulfillment !== estadoFulfillment) {
      fulfillmentCambioReal = true;
      cambios.estadoFulfillment = {
        from: orden.estadoFulfillment,
        to: estadoFulfillment,
      };
      orden.estadoFulfillment = estadoFulfillment;
    }

    if (!Object.keys(cambios).length) {
      return ok(res, { message: "Sin cambios", data: orden, meta: { reqId } });
    }

    // --------------------------------------------
    // Audit trail admin
    // --------------------------------------------
    pushHistorial(orden, "admin_update", { adminId, cambios, reqId });

    if (paymentCambioReal)
      pushHistorial(orden, `admin_payment_${orden.estadoPago}`, {
        from: prevPago,
        to: orden.estadoPago,
      });

    if (fulfillmentCambioReal)
      pushHistorial(orden, `admin_fulfillment_${orden.estadoFulfillment}`, {
        from: prevFulfillment,
        to: orden.estadoFulfillment,
      });

    // ======================================================
    // 🔥 TIMELINE AMAZON-LIKE
    // ======================================================
    if (fulfillmentCambioReal && FLAGS.TIMELINE_ON_FULFILLMENT) {
      const r = pushTimelineEventIdempotent(
        orden,
        "fulfillment",
        prevFulfillment,
        orden.estadoFulfillment,
        { adminId, reqId }
      );

      if (FLAGS.TIMELINE_VERBOSE_LOGS) {
        log("info", "timeline_fulfillment", {
          reqId,
          ordenId: String(orden._id),
          from: prevFulfillment,
          to: orden.estadoFulfillment,
          pushed: r.pushed,
          reason: r.reason || null,
        });
      }
    }

    if (paymentCambioReal && FLAGS.TIMELINE_ON_PAYMENT) {
      const r = pushTimelineEventIdempotent(
        orden,
        "payment",
        prevPago,
        orden.estadoPago,
        { adminId, reqId }
      );

      if (FLAGS.TIMELINE_VERBOSE_LOGS) {
        log("info", "timeline_payment", {
          reqId,
          ordenId: String(orden._id),
          from: prevPago,
          to: orden.estadoPago,
          pushed: r.pushed,
          reason: r.reason || null,
        });
      }
    }

    // ✅ Guardar TODO junto
    await orden.save();

    // ✅ REALTIME: emitir SIEMPRE que haya cambio (no depende del email)
    emitRealtimeSafe(orden, { reqId, source: "adminActualizarEstado" });

    // ======================================================
    // ✅ PAYOUTS AUTOMÁTICOS (Stripe Connect)
    // - Solo cuando cambia a "entregado"
    // - NO rompe endpoint si falla
    // ======================================================
    if (fulfillmentCambioReal && orden.estadoFulfillment === "entregado") {
      const payoutRes = await procesarPayoutsMarketplace({
        orden,
        reqId,
        adminId,
      });

      // Log estructurado (no bloquea)
      log("info", "payouts_on_delivered", {
        reqId,
        ordenId: String(orden._id),
        attempted: payoutRes.attempted,
        processed: payoutRes.processed?.length || 0,
        skipped: payoutRes.skipped?.length || 0,
        errors: payoutRes.errors?.length || 0,
      });

      // Si el payout tocó orden (historial/proveedores), emitimos realtime otra vez (best effort)
      if (
        (payoutRes.processed && payoutRes.processed.length) ||
        (payoutRes.errors && payoutRes.errors.length)
      ) {
        emitRealtimeSafe(orden, { reqId, source: "payouts_on_delivered" });
      }
    }

    // ======================================================
    // 📧 EMAIL: fulfillment
    // ======================================================
    if (fulfillmentCambioReal && FLAGS.EMAIL_ON_FULFILLMENT) {
      const to = extractCustomerEmail(orden);

      const ledgerKey = buildEmailLedgerKey(
        "fulfillment",
        orden.estadoFulfillment
      );

      await safeSendEmail({
        type: "fulfillment",
        orden,
        to,
        payload: {
          nuevoEstado: orden.estadoFulfillment,
          prevFulfillment,
          adminId,
          reqId,
        },
        ledgerKey,
        reqId,
      });
    }

    // ======================================================
    // 📧 EMAIL: pago (opcional)
    // ======================================================
    if (paymentCambioReal && FLAGS.EMAIL_ON_PAYMENT_STATUS) {
      const to = extractCustomerEmail(orden);

      const ledgerKey = buildEmailLedgerKey("payment", orden.estadoPago);

      if (orden.estadoPago === "pagado") {
        await safeSendEmail({
          type: "payment",
          orden,
          to,
          payload: { prevPago, adminId, reqId },
          ledgerKey,
          reqId,
        });
      } else {
        if (FLAGS.EMAIL_VERBOSE_LOGS) {
          log(
            "info",
            "EMAIL_ON_PAYMENT_STATUS activo, pero no hay plantilla para este estadoPago",
            { reqId, estadoPago: orden.estadoPago }
          );
        }
      }
    }

    return ok(res, {
      message: "Estado actualizado",
      data: orden,
      meta: { reqId },
    });
  } catch (err) {
    log("error", "adminActualizarEstado error", {
      reqId,
      err: err?.message || String(err),
    });
    return serverError(res, "Error interno actualizando estado", { reqId });
  }
};

// ==========================================================
// GET /api/ordenes/admin/metrics
// ==========================================================
exports.adminMetrics = async (req, res) => {
  const reqId = getRequestId(req);

  try {
    if (req.usuario?.rol !== "admin") return forbidden(res);

    const pipeline = [
      {
        $group: {
          _id: null,
          totalOrdenes: { $sum: 1 },
          totalIngresos: { $sum: "$total" },
          totalCostoProveedor: { $sum: "$totalCostoProveedor" },
          totalGanancia: { $sum: "$gananciaTotal" },

          pagadas: {
            $sum: { $cond: [{ $eq: ["$estadoPago", "pagado"] }, 1, 0] },
          },
          pendientes: {
            $sum: { $cond: [{ $eq: ["$estadoPago", "pendiente"] }, 1, 0] },
          },
          fallidas: {
            $sum: { $cond: [{ $eq: ["$estadoPago", "fallido"] }, 1, 0] },
          },
          reembolsadas: {
            $sum: { $cond: [{ $eq: ["$estadoPago", "reembolsado"] }, 1, 0] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalOrdenes: 1,
          totalIngresos: 1,
          totalCostoProveedor: 1,
          totalGanancia: 1,
          pagadas: 1,
          pendientes: 1,
          fallidas: 1,
          reembolsadas: 1,
        },
      },
    ];

    const [m] = await Orden.aggregate(pipeline);

    return ok(res, {
      message: "Métricas (admin)",
      data:
        m || {
          totalOrdenes: 0,
          totalIngresos: 0,
          totalCostoProveedor: 0,
          totalGanancia: 0,
          pagadas: 0,
          pendientes: 0,
          fallidas: 0,
          reembolsadas: 0,
        },
      meta: { reqId },
    });
  } catch (err) {
    log("error", "adminMetrics error", {
      reqId,
      err: err?.message || String(err),
    });
    return serverError(res, "Error interno en métricas", { reqId });
  }
}; // ✅ <-- ESTA LLAVE/FIRMA ERA LA QUE TE FALTABA

// ==========================================================
// WRAPPERS PARA ROUTER (compatibilidad)
// ==========================================================
//
// Tu router usa:
//   - adminActualizarFulfillment
//   - adminActualizarPago
//
// Este controller tiene un endpoint universal:
//   - adminActualizarEstado
//
// Estos wrappers adaptan las rutas SIN ROMPER tu diseño.
// ==========================================================

// PUT /ordenes/:id/fulfillment
exports.adminActualizarFulfillment = async (req, res) => {
  // No cambiamos estructura: solo delegamos.
  return exports.adminActualizarEstado(req, res);
};

// PUT /ordenes/:id/pago
exports.adminActualizarPago = async (req, res) => {
  // No cambiamos estructura: solo delegamos.
  return exports.adminActualizarEstado(req, res);
};