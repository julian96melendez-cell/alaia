// ==========================================================
// ordenController.js — Controlador de Órdenes (ENTERPRISE ULTRA FINAL)
// COMPLETO / ROBUSTO / PRODUCCIÓN REAL / FUTURE-READY
// ==========================================================

const mongoose = require("mongoose");
const crypto = require("crypto");
const Orden = require("../models/Orden");
const Producto = require("../models/Producto");

// ==========================================================
// Stripe service (opcional)
// ==========================================================
let StripeService = null;
try {
  StripeService = require("../payments/stripeService");
} catch (_) {
  try {
    StripeService = require("../controllers/stripeService");
  } catch (_) {
    try {
      StripeService = require("./stripeService");
    } catch (_) {
      StripeService = null;
    }
  }
}

const { crearSesionPago } = StripeService || {};

// ==========================================================
// Email service (opcional)
// ==========================================================
let EmailService = null;
try {
  EmailService = require("../services/emailService");
} catch (_) {
  try {
    EmailService = require("../services/emailServices");
  } catch (_) {
    try {
      EmailService = require("../services/services");
    } catch (_) {
      EmailService = null;
    }
  }
}

// ==========================================================
// Helpers de respuesta
// ==========================================================
const sendSuccess = (
  res,
  { statusCode = 200, message = "OK", data = null, meta = null } = {}
) => res.status(statusCode).json({ ok: true, message, data, meta });

const sendError = (
  res,
  { statusCode = 500, message = "Error interno", errors = null } = {}
) => {
  const payload = { ok: false, message };
  if (errors) payload.errors = errors;
  return res.status(statusCode).json(payload);
};

// ==========================================================
// Helpers utilitarios
// ==========================================================
const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const getUserId = (req) =>
  req.usuario?._id?.toString?.() || req.usuario?.id || null;

const safeNumber = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const safeString = (v, fallback = "") => {
  if (v === null || v === undefined) return fallback;
  return String(v);
};

const round2 = (n) => Math.round(safeNumber(n) * 100) / 100;

const now = () => new Date();

const lower = (v) => safeString(v, "").trim().toLowerCase();

function stableJson(obj) {
  const seen = new WeakSet();
  const sorter = (x) => {
    if (!x || typeof x !== "object") return x;
    if (seen.has(x)) return null;
    seen.add(x);
    if (Array.isArray(x)) return x.map(sorter);
    const out = {};
    Object.keys(x)
      .sort()
      .forEach((k) => (out[k] = sorter(x[k])));
    return out;
  };
  return JSON.stringify(sorter(obj));
}

function sha256(str) {
  return crypto.createHash("sha256").update(String(str)).digest("hex");
}

// ==========================================================
// Feature flags ENV
// ==========================================================
const envBool = (k, def = false) => {
  const v = process.env[k];
  if (v === undefined || v === null || v === "") return def;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase().trim());
};

const FLAGS = {
  EMAIL_ON_FULFILLMENT: envBool("EMAIL_ON_FULFILLMENT", true),
  EMAIL_ON_PAYMENT_STATUS: envBool("EMAIL_ON_PAYMENT_STATUS", true),
  EMAIL_VERBOSE_LOGS: envBool("EMAIL_VERBOSE_LOGS", true),

  STRIPE_ENABLED: envBool("STRIPE_ENABLED", true),
  STRIPE_REQUIRE: envBool("STRIPE_REQUIRE", false),
  STRIPE_IDEMPOTENCY: envBool("STRIPE_IDEMPOTENCY", true),
};

// ==========================================================
// Estados permitidos
// ==========================================================
const ALLOWED_ESTADO_PAGO = new Set([
  "pendiente",
  "pagado",
  "fallido",
  "reembolsado",
]);

const ALLOWED_ESTADO_FULFILLMENT = new Set([
  "pendiente",
  "procesando",
  "enviado",
  "entregado",
  "cancelado",
]);

// ==========================================================
// EMAIL ENGINE
// ==========================================================
const emailLedgerKey = (tipo, estado) =>
  `email_${String(tipo).toLowerCase()}_${String(estado).toLowerCase()}`.slice(
    0,
    120
  );

const ensureHistorial = (orden) => {
  if (!orden) return;
  if (!Array.isArray(orden.historial)) orden.historial = [];
};

const alreadySent = (orden, ledgerKey) => {
  ensureHistorial(orden);
  return orden.historial.some((h) => h?.estado === ledgerKey);
};

const registerLedger = (orden, ledgerKey, meta = null) => {
  ensureHistorial(orden);
  orden.historial.push({ estado: ledgerKey, fecha: now(), meta });
};

const getEmailDestino = (orden) => {
  const userObj =
    orden?.usuario && typeof orden.usuario === "object" ? orden.usuario : null;

  return (
    userObj?.email ||
    orden?.email ||
    orden?.clienteEmail ||
    orden?.direccionEntrega?.email ||
    null
  );
};

async function safeSendEmail({ tipo, orden, nuevoEstado, meta = {} }) {
  try {
    if (!EmailService) return;
    if (!orden) return;

    const to = getEmailDestino(orden);
    if (!to) return;

    const ledger = emailLedgerKey(tipo, nuevoEstado);

    if (alreadySent(orden, ledger)) return;

    if (tipo === "fulfillment") {
      if (!FLAGS.EMAIL_ON_FULFILLMENT) return;
      if (typeof EmailService.enviarCorreoCambioEstado !== "function") return;

      await EmailService.enviarCorreoCambioEstado({
        to: String(to),
        orden,
        nuevoEstado,
      });
    }

    if (tipo === "payment") {
      if (!FLAGS.EMAIL_ON_PAYMENT_STATUS) return;
      if (String(nuevoEstado).toLowerCase() !== "pagado") return;
      if (typeof EmailService.enviarCorreoOrdenPagada !== "function") return;

      await EmailService.enviarCorreoOrdenPagada({
        to: String(to),
        orden,
      });
    }

    registerLedger(orden, ledger, { to, nuevoEstado, ...meta });
    await orden.save().catch(() => {});

    if (FLAGS.EMAIL_VERBOSE_LOGS) {
      console.log(`📧 Email enviado (${tipo}) → ${to} | estado=${nuevoEstado}`);
    }
  } catch (err) {
    console.log("⚠️ Email falló (no bloquea API):", err?.message || err);
  }
}

// ==========================================================
// Idempotencia
// ==========================================================
function buildCreateFingerprint({
  usuarioId,
  items,
  direccionEntrega,
  metodoPago,
}) {
  const safeItems = (Array.isArray(items) ? items : []).map((it) => ({
    producto: String(it?.producto || ""),
    cantidad: Math.max(1, parseInt(it?.cantidad, 10) || 1),
  }));
  safeItems.sort((a, b) => a.producto.localeCompare(b.producto));

  const payload = {
    usuarioId: String(usuarioId || ""),
    metodoPago: String(metodoPago || ""),
    items: safeItems,
    direccionEntrega: direccionEntrega || {},
  };

  return `create_${sha256(stableJson(payload))}`.slice(0, 120);
}

async function findOrdenByCreateFingerprint(usuarioId, fp) {
  if (!usuarioId || !fp) return null;

  return Orden.findOne({
    usuario: usuarioId,
    "historial.estado": fp,
  })
    .sort({ createdAt: -1 })
    .lean();
}

// ==========================================================
// POST /api/ordenes/crear
// ==========================================================
exports.crearOrden = async (req, res, next) => {
  try {
    const usuarioId = getUserId(req);
    const { items = [], metodoPago = "stripe", direccionEntrega = {} } = req.body;

    if (!usuarioId) {
      return sendError(res, { statusCode: 401, message: "No autenticado" });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return sendError(res, {
        statusCode: 400,
        message: "La orden debe contener al menos un producto",
      });
    }

    for (const it of items) {
      if (!it?.producto || !isObjectId(it.producto)) {
        return sendError(res, {
          statusCode: 400,
          message: "Cada item debe incluir producto (ObjectId válido)",
        });
      }
    }

    const fp = buildCreateFingerprint({
      usuarioId,
      items,
      direccionEntrega,
      metodoPago,
    });

    const existing = await findOrdenByCreateFingerprint(usuarioId, fp);
    if (existing) {
      return sendSuccess(res, {
        statusCode: 200,
        message: "Orden ya existía (idempotencia)",
        data: existing,
        meta: { reused: true },
      });
    }

    const productos = await Producto.find({
      _id: { $in: items.map((i) => i.producto) },
      activo: true,
    });

    const productosMap = new Map(productos.map((p) => [p._id.toString(), p]));

    let total = 0;
    let totalCostoProveedor = 0;
    const itemsOrden = [];

    for (const it of items) {
      const producto = productosMap.get(it.producto.toString());

      if (!producto) {
        return sendError(res, {
          statusCode: 404,
          message: `Producto no disponible: ${it.producto}`,
        });
      }

      if (producto.tipo === "afiliado") {
        return sendError(res, {
          statusCode: 400,
          message: `El producto "${producto.nombre}" es afiliado`,
        });
      }

      const cantidad = Math.max(1, parseInt(it.cantidad, 10) || 1);
      const precioUnitario = safeNumber(producto.precioFinal);
      const costoProveedorUnitario = safeNumber(producto.costoProveedor);

      if (precioUnitario <= 0) {
        return sendError(res, {
          statusCode: 400,
          message: `Producto "${producto.nombre}" sin precio válido`,
        });
      }

      const subtotal = round2(precioUnitario * cantidad);
      const costoTotalProveedor = round2(costoProveedorUnitario * cantidad);

      const comisionPorcentaje =
        producto?.sellerType === "seller"
          ? producto?.commissionRatePct ?? null
          : null;

      itemsOrden.push({
        producto: producto._id,
        nombre: producto.nombre,
        cantidad,
        precioUnitario,
        costoProveedorUnitario,
        proveedor: producto.proveedor || "local",
        tipoProducto: producto.tipo,
        subtotal,
        ganancia: round2(subtotal - costoTotalProveedor),
        ...(comisionPorcentaje !== null ? { comisionPorcentaje } : {}),
      });

      total += subtotal;
      totalCostoProveedor += costoTotalProveedor;
    }

    const orden = await Orden.create({
      usuario: usuarioId,
      items: itemsOrden,
      total: round2(total),
      totalCostoProveedor: round2(totalCostoProveedor),
      gananciaTotal: round2(total - totalCostoProveedor),
      metodoPago,
      estadoPago: "pendiente",
      estadoFulfillment: "pendiente",
      direccionEntrega,
      historial: [
        { estado: "creada", fecha: now() },
        { estado: fp, fecha: now(), meta: { kind: "create_fingerprint" } },
      ],
    });

    return sendSuccess(res, {
      statusCode: 201,
      message: "Orden creada correctamente",
      data: orden,
    });
  } catch (err) {
    next(err);
  }
};

// ==========================================================
// POST /api/ordenes/checkout/stripe
// Checkout Stripe con usuario logueado o invitado
// ==========================================================
exports.crearOrdenYCheckoutStripe = async (req, res, next) => {
  try {
    const usuarioId = getUserId(req) || null;
    const { items = [], direccionEntrega = {}, clienteEmail = null } =
      req.body || {};

    if (!FLAGS.STRIPE_ENABLED) {
      return sendError(res, {
        statusCode: 400,
        message: "Stripe deshabilitado (STRIPE_ENABLED=false)",
      });
    }

    if (typeof crearSesionPago !== "function") {
      if (FLAGS.STRIPE_REQUIRE) {
        return sendError(res, {
          statusCode: 500,
          message: "Stripe no configurado (crearSesionPago no disponible)",
        });
      }

      return sendError(res, {
        statusCode: 400,
        message: "Stripe no disponible en este entorno",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return sendError(res, {
        statusCode: 400,
        message: "Debes enviar items",
      });
    }

    for (const it of items) {
      if (!it?.producto || !isObjectId(it.producto)) {
        return sendError(res, {
          statusCode: 400,
          message: "Cada item debe incluir producto (ObjectId válido)",
        });
      }
    }

    const headerKey = safeString(
      req.headers["idempotency-key"] || req.headers["Idempotency-Key"] || ""
    );

    const metodoPago = "stripe";

    const fpBase = buildCreateFingerprint({
      usuarioId: usuarioId || "guest",
      items,
      direccionEntrega,
      metodoPago,
    });

    const fp = headerKey
      ? `create_${sha256(fpBase + "::" + headerKey)}`.slice(0, 120)
      : fpBase;

    const existing = usuarioId
      ? await findOrdenByCreateFingerprint(usuarioId, fp)
      : null;

    if (existing) {
      return sendSuccess(res, {
        statusCode: 200,
        message: "Orden ya existía (idempotencia)",
        data: existing,
        meta: { reused: true },
      });
    }

    const productos = await Producto.find({
      _id: { $in: items.map((i) => i.producto) },
      activo: true,
      visible: true,
    }).lean();

    const productosMap = new Map(productos.map((p) => [String(p._id), p]));

    const itemsOrden = [];
    const lineItems = [];

    let total = 0;
    let totalCostoProveedor = 0;

    for (const it of items) {
      const producto = productosMap.get(String(it.producto));

      if (!producto) {
        return sendError(res, {
          statusCode: 404,
          message: `Producto no disponible: ${it.producto}`,
        });
      }

      if (producto.tipo === "afiliado") {
        return sendError(res, {
          statusCode: 400,
          message: `El producto "${producto.nombre}" es afiliado`,
        });
      }

      if (
        producto.gestionStock === true &&
        safeNumber(producto.stock, 0) <= 0
      ) {
        return sendError(res, {
          statusCode: 400,
          message: `El producto "${producto.nombre}" no tiene stock disponible`,
        });
      }

      const cantidad = Math.max(1, parseInt(it.cantidad, 10) || 1);
      const precioUnitario = safeNumber(producto.precioFinal);
      const costoProveedorUnitario = safeNumber(producto.costoProveedor);

      if (precioUnitario <= 0) {
        return sendError(res, {
          statusCode: 400,
          message: `Producto "${producto.nombre}" sin precio válido`,
        });
      }

      const subtotal = round2(precioUnitario * cantidad);
      const costoTotalProveedor = round2(costoProveedorUnitario * cantidad);

      const comisionPorcentaje =
        producto?.sellerType === "seller"
          ? producto?.commissionRatePct ?? null
          : null;

      itemsOrden.push({
        producto: producto._id,
        nombre: producto.nombre,
        cantidad,
        precioUnitario,
        costoProveedorUnitario,
        proveedor: producto.proveedor || "local",
        tipoProducto: producto.tipo,
        subtotal,
        ganancia: round2(subtotal - costoTotalProveedor),
        ...(comisionPorcentaje !== null ? { comisionPorcentaje } : {}),
      });

      total += subtotal;
      totalCostoProveedor += costoTotalProveedor;

      lineItems.push({
        price_data: {
          currency: lower(producto.moneda || "usd"),
          product_data: {
            name: producto.nombre || "Producto",
          },
          unit_amount: Math.round(precioUnitario * 100),
        },
        quantity: cantidad,
      });
    }

    const emailDestino =
      clienteEmail ||
      req.usuario?.email ||
      direccionEntrega?.email ||
      null;

    const ordenPayload = {
      items: itemsOrden,
      total: round2(total),
      totalCostoProveedor: round2(totalCostoProveedor),
      gananciaTotal: round2(total - totalCostoProveedor),
      metodoPago: "stripe",
      estadoPago: "pendiente",
      estadoFulfillment: "pendiente",
      direccionEntrega,
      clienteEmail: emailDestino,
      historial: [
        {
          estado: "creada",
          fecha: now(),
          meta: {
            source: "stripe_checkout",
            checkoutType: usuarioId ? "authenticated" : "guest",
          },
        },
        {
          estado: fp,
          fecha: now(),
          meta: { kind: "create_fingerprint" },
        },
      ],
    };

    if (usuarioId) {
      ordenPayload.usuario = usuarioId;
    }

    const orden = await Orden.create(ordenPayload);

    const metadata = {
      ordenId: String(orden._id),
      usuarioId: usuarioId ? String(usuarioId) : "guest",
      checkoutType: usuarioId ? "authenticated" : "guest",
    };

    const stripeIdempotencyKey = FLAGS.STRIPE_IDEMPOTENCY
      ? `checkout_${String(orden._id)}`
      : null;

    const session = await crearSesionPago({
      lineItems,
      metadata,
      clienteEmail: emailDestino,
      idempotencyKey: stripeIdempotencyKey,
    });

    try {
      orden.stripeSessionId = safeString(session?.id || "");
      await orden.save();
    } catch (_) {}

    return sendSuccess(res, {
      statusCode: 201,
      message: "Checkout Stripe creado",
      data: {
        ordenId: String(orden._id),
        stripeSessionId: session?.id || null,
        checkoutUrl: session?.url || null,
        url: session?.url || null,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ==========================================================
// GET /api/ordenes/mias
// ==========================================================
exports.obtenerMisOrdenes = async (req, res, next) => {
  try {
    const usuarioId = getUserId(req);

    if (!usuarioId) {
      return sendError(res, { statusCode: 401, message: "No autenticado" });
    }

    const ordenes = await Orden.find({ usuario: usuarioId }).sort({
      createdAt: -1,
    });

    return sendSuccess(res, {
      message: "Órdenes del usuario",
      data: ordenes,
    });
  } catch (err) {
    next(err);
  }
};

// ==========================================================
// GET /api/ordenes/:id
// ==========================================================
exports.obtenerOrdenPorId = async (req, res, next) => {
  try {
    const usuarioId = getUserId(req);
    const { id } = req.params;

    if (!isObjectId(id)) {
      return sendError(res, { statusCode: 400, message: "ID inválido" });
    }

    const orden = await Orden.findById(id)
      .populate("usuario", "nombre email rol")
      .populate("items.producto");

    if (!orden) {
      return sendError(res, { statusCode: 404, message: "Orden no encontrada" });
    }

    const esDueno = orden.usuario?._id?.toString() === String(usuarioId);
    const esAdmin = req.usuario?.rol === "admin";

    if (!esDueno && !esAdmin) {
      return sendError(res, { statusCode: 403, message: "No autorizado" });
    }

    return sendSuccess(res, {
      message: "Orden obtenida",
      data: orden,
    });
  } catch (err) {
    next(err);
  }
};

// ==========================================================
// GET /api/ordenes/public/:id
// ==========================================================
exports.obtenerOrdenPublica = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isObjectId(id)) {
      return sendError(res, { statusCode: 400, message: "ID inválido" });
    }

    const orden = await Orden.findById(id).select(
      "_id total estadoPago estadoFulfillment createdAt moneda"
    );

    if (!orden) {
      return sendError(res, { statusCode: 404, message: "Orden no encontrada" });
    }

    return sendSuccess(res, {
      message: "Orden pública",
      data: orden,
    });
  } catch (err) {
    next(err);
  }
};

// ==========================================================
// GET /api/ordenes/admin
// ==========================================================
exports.obtenerTodasOrdenes = async (req, res, next) => {
  try {
    if (req.usuario?.rol !== "admin") {
      return sendError(res, { statusCode: 403, message: "Solo admin" });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit, 10) || 20)
    );
    const skip = (page - 1) * limit;

    const filtro = {};

    const estadoPago = safeString(req.query.estadoPago).trim();
    const estadoFulfillment = safeString(req.query.estadoFulfillment).trim();

    if (estadoPago && ALLOWED_ESTADO_PAGO.has(estadoPago)) {
      filtro.estadoPago = estadoPago;
    }

    if (
      estadoFulfillment &&
      ALLOWED_ESTADO_FULFILLMENT.has(estadoFulfillment)
    ) {
      filtro.estadoFulfillment = estadoFulfillment;
    }

    const [total, ordenes] = await Promise.all([
      Orden.countDocuments(filtro),
      Orden.find(filtro)
        .populate("usuario", "nombre email rol")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    return sendSuccess(res, {
      message: "Listado de órdenes",
      data: ordenes,
      meta: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ==========================================================
// PUT /api/ordenes/estado/:id
// ==========================================================
exports.actualizarEstado = async (req, res, next) => {
  try {
    if (req.usuario?.rol !== "admin") {
      return sendError(res, { statusCode: 403, message: "Solo admin" });
    }

    const { id } = req.params;

    if (!isObjectId(id)) {
      return sendError(res, { statusCode: 400, message: "ID inválido" });
    }

    const estadoPago = safeString(req.body?.estadoPago).trim();
    const estadoFulfillment = safeString(req.body?.estadoFulfillment).trim();

    if (!estadoPago && !estadoFulfillment) {
      return sendError(res, {
        statusCode: 400,
        message: "Debes enviar estadoPago y/o estadoFulfillment",
      });
    }

    if (estadoPago && !ALLOWED_ESTADO_PAGO.has(estadoPago)) {
      return sendError(res, {
        statusCode: 400,
        message: "estadoPago inválido",
        errors: { allowed: Array.from(ALLOWED_ESTADO_PAGO) },
      });
    }

    if (
      estadoFulfillment &&
      !ALLOWED_ESTADO_FULFILLMENT.has(estadoFulfillment)
    ) {
      return sendError(res, {
        statusCode: 400,
        message: "estadoFulfillment inválido",
        errors: { allowed: Array.from(ALLOWED_ESTADO_FULFILLMENT) },
      });
    }

    const orden = await Orden.findById(id).populate("usuario", "nombre email");

    if (!orden) {
      return sendError(res, { statusCode: 404, message: "Orden no encontrada" });
    }

    if (
      estadoFulfillment &&
      estadoFulfillment !== "cancelado" &&
      orden.estadoPago !== "pagado"
    ) {
      return sendError(res, {
        statusCode: 400,
        message: "No se puede procesar una orden no pagada (excepto cancelar)",
      });
    }

    const cambios = {};
    let pagoChanged = false;
    let fulfillmentChanged = false;

    if (estadoPago && orden.estadoPago !== estadoPago) {
      cambios.estadoPago = { from: orden.estadoPago, to: estadoPago };
      orden.estadoPago = estadoPago;
      pagoChanged = true;
    }

    if (estadoFulfillment && orden.estadoFulfillment !== estadoFulfillment) {
      cambios.estadoFulfillment = {
        from: orden.estadoFulfillment,
        to: estadoFulfillment,
      };
      orden.estadoFulfillment = estadoFulfillment;
      fulfillmentChanged = true;
    }

    ensureHistorial(orden);
    orden.historial.push({
      estado: "admin_update",
      fecha: now(),
      meta: {
        adminId: getUserId(req),
        cambios,
      },
    });

    await orden.save();

    if (pagoChanged) {
      await safeSendEmail({
        tipo: "payment",
        orden,
        nuevoEstado: orden.estadoPago,
        meta: { source: "admin_update" },
      });
    }

    if (fulfillmentChanged) {
      await safeSendEmail({
        tipo: "fulfillment",
        orden,
        nuevoEstado: orden.estadoFulfillment,
        meta: { source: "admin_update" },
      });
    }

    return sendSuccess(res, {
      message: "Orden actualizada",
      data: orden,
    });
  } catch (err) {
    next(err);
  }
};

// ==========================================================
// PUT /api/ordenes/cancelar/:id
// ==========================================================
exports.cancelarOrden = async (req, res, next) => {
  try {
    const usuarioId = getUserId(req);
    const { id } = req.params;

    if (!isObjectId(id)) {
      return sendError(res, { statusCode: 400, message: "ID inválido" });
    }

    const orden = await Orden.findById(id).populate("usuario", "nombre email rol");

    if (!orden) {
      return sendError(res, { statusCode: 404, message: "Orden no encontrada" });
    }

    const esDueno = orden.usuario?._id?.toString() === String(usuarioId);
    const esAdmin = req.usuario?.rol === "admin";

    if (!esDueno && !esAdmin) {
      return sendError(res, { statusCode: 403, message: "No autorizado" });
    }

    if (["enviado", "entregado"].includes(orden.estadoFulfillment)) {
      return sendError(res, {
        statusCode: 400,
        message: "No se puede cancelar una orden enviada o entregada",
      });
    }

    const beforeFul = orden.estadoFulfillment;
    const beforePago = orden.estadoPago;

    orden.estadoFulfillment = "cancelado";

    if (orden.estadoPago !== "pagado") {
      orden.estadoPago = "fallido";
    }

    ensureHistorial(orden);
    orden.historial.push({
      estado: "cancelada",
      fecha: now(),
      meta: {
        by: esAdmin ? "admin" : "user",
        before: {
          estadoFulfillment: beforeFul,
          estadoPago: beforePago,
        },
        after: {
          estadoFulfillment: orden.estadoFulfillment,
          estadoPago: orden.estadoPago,
        },
      },
    });

    await orden.save();

    await safeSendEmail({
      tipo: "fulfillment",
      orden,
      nuevoEstado: "cancelado",
      meta: { source: "cancelarOrden" },
    });

    return sendSuccess(res, {
      message: "Orden cancelada",
      data: orden,
    });
  } catch (err) {
    next(err);
  }
};