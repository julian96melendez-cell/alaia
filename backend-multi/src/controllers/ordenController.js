"use strict";

const mongoose = require("mongoose");
const Orden = require("../models/Orden");
const Producto = require("../models/Producto");

const { crearSesionPago } = require("../payments/stripeService");

// ======================================================
// Helpers
// ======================================================
const sendSuccess = (
  res,
  { statusCode = 200, message = "OK", data = null, meta = null } = {}
) => res.status(statusCode).json({ ok: true, message, data, orden: data, meta });

const sendError = (
  res,
  { statusCode = 500, message = "Error interno", errors = null } = {}
) => {
  const payload = { ok: false, message };
  if (errors) payload.errors = errors;
  return res.status(statusCode).json(payload);
};

const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const getUserId = (req) =>
  req.usuario?._id?.toString?.() || req.usuario?.id || null;

const safeNumber = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const safeString = (v, fallback = "") => {
  if (v === null || v === undefined) return fallback;
  return String(v).trim();
};

const round2 = (n) => Math.round(safeNumber(n) * 100) / 100;

const now = () => new Date();

const normalizeCurrency = (v) =>
  safeString(v, "usd").toLowerCase() || "usd";

// ======================================================
// Estados permitidos
// ======================================================
const ALLOWED_ESTADO_PAGO = new Set([
  "pendiente",
  "pagado",
  "fallido",
  "reembolsado",
  "reembolsado_parcial",
]);

const ALLOWED_ESTADO_FULFILLMENT = new Set([
  "pendiente",
  "procesando",
  "enviado",
  "entregado",
  "cancelado",
]);

// ======================================================
// Construir orden desde productos
// ======================================================
async function construirItemsOrden(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    throw Object.assign(new Error("Debes enviar items"), { statusCode: 400 });
  }

  for (const item of items) {
    if (!item?.producto || !isObjectId(item.producto)) {
      throw Object.assign(
        new Error("Cada item debe incluir producto ObjectId válido"),
        { statusCode: 400 }
      );
    }
  }

  const productos = await Producto.find({
    _id: { $in: items.map((i) => i.producto) },
    activo: true,
  }).lean();

  const productosMap = new Map(productos.map((p) => [String(p._id), p]));

  const itemsOrden = [];
  const lineItems = [];

  let total = 0;
  let totalCostoProveedor = 0;
  let moneda = "usd";

  for (const item of items) {
    const producto = productosMap.get(String(item.producto));

    if (!producto) {
      throw Object.assign(
        new Error(`Producto no disponible: ${item.producto}`),
        { statusCode: 404 }
      );
    }

    if (producto.tipo === "afiliado") {
      throw Object.assign(
        new Error(`El producto "${producto.nombre}" es afiliado`),
        { statusCode: 400 }
      );
    }

    const cantidad = Math.max(1, parseInt(item.cantidad, 10) || 1);
    const precioUnitario = safeNumber(producto.precioFinal ?? producto.precio);
    const costoProveedorUnitario = safeNumber(producto.costoProveedor);

    if (precioUnitario <= 0) {
      throw Object.assign(
        new Error(`Producto "${producto.nombre}" sin precio válido`),
        { statusCode: 400 }
      );
    }

    moneda = normalizeCurrency(producto.moneda || moneda);

    const subtotal = round2(precioUnitario * cantidad);
    const costoTotalProveedor = round2(costoProveedorUnitario * cantidad);

    itemsOrden.push({
      producto: producto._id,
      nombre: producto.nombre || "Producto",
      cantidad,
      precioUnitario,
      costoProveedorUnitario,
      proveedor: producto.proveedor || "local",
      tipoProducto: producto.tipo || "marketplace",
      subtotal,
      ganancia: round2(subtotal - costoTotalProveedor),
      ...(producto?.sellerType === "seller" &&
      producto?.commissionRatePct !== undefined
        ? { comisionPorcentaje: producto.commissionRatePct }
        : {}),
    });

    lineItems.push({
      price_data: {
        currency: moneda,
        product_data: {
          name: safeString(producto.nombre, "Producto").slice(0, 200),
        },
        unit_amount: Math.round(precioUnitario * 100),
      },
      quantity: cantidad,
    });

    total += subtotal;
    totalCostoProveedor += costoTotalProveedor;
  }

  return {
    itemsOrden,
    lineItems,
    total: round2(total),
    totalCostoProveedor: round2(totalCostoProveedor),
    gananciaTotal: round2(total - totalCostoProveedor),
    moneda,
  };
}

// ======================================================
// POST /api/ordenes/crear
// ======================================================
exports.crearOrden = async (req, res, next) => {
  try {
    const usuarioId = getUserId(req);
    const { items = [], metodoPago = "stripe", direccionEntrega = {}, clienteEmail = null } =
      req.body || {};

    const built = await construirItemsOrden(items);

    const payload = {
      items: built.itemsOrden,
      total: built.total,
      totalCostoProveedor: built.totalCostoProveedor,
      gananciaTotal: built.gananciaTotal,
      moneda: built.moneda,
      metodoPago,
      estadoPago: "pendiente",
      estadoFulfillment: "pendiente",
      direccionEntrega,
      clienteEmail: clienteEmail || direccionEntrega?.email || null,
      historial: [{ estado: "creada", fecha: now(), meta: { source: "manual" } }],
    };

    if (usuarioId) payload.usuario = usuarioId;

    const orden = await Orden.create(payload);

    return sendSuccess(res, {
      statusCode: 201,
      message: "Orden creada correctamente",
      data: orden,
    });
  } catch (err) {
    if (err?.statusCode) {
      return sendError(res, { statusCode: err.statusCode, message: err.message });
    }
    next(err);
  }
};

// ======================================================
// POST /api/stripe/checkout
// Crea orden REAL en MongoDB y usa ese mismo _id en Stripe
// ======================================================
exports.crearOrdenYCheckoutStripe = async (req, res, next) => {
  try {
    const usuarioId = getUserId(req);

    const {
      items = [],
      direccionEntrega = {},
      clienteEmail = null,
      email = null,
    } = req.body || {};

    const built = await construirItemsOrden(items);

    const payload = {
      items: built.itemsOrden,
      total: built.total,
      totalCostoProveedor: built.totalCostoProveedor,
      gananciaTotal: built.gananciaTotal,
      moneda: built.moneda,
      metodoPago: "stripe",
      estadoPago: "pendiente",
      estadoFulfillment: "pendiente",
      direccionEntrega,
      clienteEmail:
        clienteEmail ||
        email ||
        req.usuario?.email ||
        direccionEntrega?.email ||
        null,
      historial: [
        {
          estado: "creada",
          fecha: now(),
          meta: { source: "stripe_checkout" },
        },
      ],
    };

    if (usuarioId) {
      payload.usuario = usuarioId;
    }

    // 1. Crear orden primero
    const orden = await Orden.create(payload);

    const ordenId = String(orden._id);

    // 2. Mandar a Stripe EL MISMO ID
    const session = await crearSesionPago({
      lineItems: built.lineItems,
      clienteEmail: payload.clienteEmail,
      metadata: {
        ordenId,
        orderId: ordenId,
        usuarioId: usuarioId || "guest",
        checkoutType: usuarioId ? "user" : "guest",
      },
      idempotencyKey: `checkout_${ordenId}`,
    });

    // 3. Guardar sesión Stripe
    try {
      orden.stripeSessionId = session?.id || "";
      orden.paymentProvider = "stripe";
      orden.paymentStatusDetail = "checkout_session_created";
      await orden.save();
    } catch (_) {}

    return sendSuccess(res, {
      statusCode: 201,
      message: "Checkout Stripe creado",
      data: {
        ordenId,
        orderId: ordenId,
        stripeSessionId: session?.id || null,
        sessionId: session?.id || null,
        checkoutUrl: session?.url || null,
        url: session?.url || null,
      },
    });
  } catch (err) {
    if (err?.statusCode) {
      return sendError(res, { statusCode: err.statusCode, message: err.message });
    }

    return next(err);
  }
};

// ======================================================
// GET /api/ordenes/mias
// ======================================================
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

// ======================================================
// GET /api/ordenes/public/:id
// ======================================================
exports.obtenerOrdenPublica = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isObjectId(id)) {
      return sendError(res, { statusCode: 400, message: "ID inválido" });
    }

    const orden = await Orden.findById(id).select(
      "_id total moneda estadoPago estadoFulfillment metodoPago paymentProvider paidAt failedAt refundedAt stripeSessionId stripePaymentIntentId paymentStatusDetail createdAt updatedAt"
    );

    if (!orden) {
      return sendError(res, {
        statusCode: 404,
        message: "Orden no encontrada",
      });
    }

    return sendSuccess(res, {
      message: "Orden pública",
      data: orden,
    });
  } catch (err) {
    next(err);
  }
};

// ======================================================
// GET /api/ordenes/:id
// ======================================================
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

    const esAdmin = req.usuario?.rol === "admin";
    const esDueno = orden.usuario?._id?.toString?.() === String(usuarioId);

    if (!esAdmin && !esDueno) {
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

// ======================================================
// GET /api/ordenes/admin
// ======================================================
exports.obtenerTodasOrdenes = async (req, res, next) => {
  try {
    if (req.usuario?.rol !== "admin") {
      return sendError(res, { statusCode: 403, message: "Solo admin" });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const filtro = {};

    const estadoPago = safeString(req.query.estadoPago);
    const estadoFulfillment = safeString(req.query.estadoFulfillment);

    if (estadoPago && ALLOWED_ESTADO_PAGO.has(estadoPago)) {
      filtro.estadoPago = estadoPago;
    }

    if (estadoFulfillment && ALLOWED_ESTADO_FULFILLMENT.has(estadoFulfillment)) {
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

// ======================================================
// PUT /api/ordenes/estado/:id
// ======================================================
exports.actualizarEstado = async (req, res, next) => {
  try {
    if (req.usuario?.rol !== "admin") {
      return sendError(res, { statusCode: 403, message: "Solo admin" });
    }

    const { id } = req.params;

    if (!isObjectId(id)) {
      return sendError(res, { statusCode: 400, message: "ID inválido" });
    }

    const estadoPago = safeString(req.body?.estadoPago);
    const estadoFulfillment = safeString(req.body?.estadoFulfillment);

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
      });
    }

    if (estadoFulfillment && !ALLOWED_ESTADO_FULFILLMENT.has(estadoFulfillment)) {
      return sendError(res, {
        statusCode: 400,
        message: "estadoFulfillment inválido",
      });
    }

    const orden = await Orden.findById(id);

    if (!orden) {
      return sendError(res, { statusCode: 404, message: "Orden no encontrada" });
    }

    if (estadoPago) orden.estadoPago = estadoPago;
    if (estadoFulfillment) orden.estadoFulfillment = estadoFulfillment;

    if (!Array.isArray(orden.historial)) orden.historial = [];

    orden.historial.push({
      estado: "admin_update",
      fecha: now(),
      meta: {
        adminId: getUserId(req),
        estadoPago,
        estadoFulfillment,
      },
    });

    await orden.save();

    return sendSuccess(res, {
      message: "Orden actualizada",
      data: orden,
    });
  } catch (err) {
    next(err);
  }
};

// ======================================================
// PUT /api/ordenes/cancelar/:id
// ======================================================
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

    const esAdmin = req.usuario?.rol === "admin";
    const esDueno = orden.usuario?._id?.toString?.() === String(usuarioId);

    if (!esAdmin && !esDueno) {
      return sendError(res, { statusCode: 403, message: "No autorizado" });
    }

    if (["enviado", "entregado"].includes(orden.estadoFulfillment)) {
      return sendError(res, {
        statusCode: 400,
        message: "No se puede cancelar una orden enviada o entregada",
      });
    }

    orden.estadoFulfillment = "cancelado";

    if (orden.estadoPago !== "pagado") {
      orden.estadoPago = "fallido";
    }

    if (!Array.isArray(orden.historial)) orden.historial = [];

    orden.historial.push({
      estado: "cancelada",
      fecha: now(),
      meta: {
        by: esAdmin ? "admin" : "user",
      },
    });

    await orden.save();

    return sendSuccess(res, {
      message: "Orden cancelada",
      data: orden,
    });
  } catch (err) {
    next(err);
  }
};