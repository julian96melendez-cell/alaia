"use strict";

// =============================================
// productosController.js — Público + Admin PRO
// =============================================

const mongoose = require("mongoose");
const { validationResult } = require("express-validator");
const Producto = require("../models/Producto");

// ----------------------------------------------
// Helpers respuesta
// ----------------------------------------------
const sendSuccess = (
  res,
  { statusCode = 200, message = "OK", data = null, meta = null } = {}
) => {
  return res.status(statusCode).json({
    ok: true,
    message,
    data,
    meta,
  });
};

const sendError = (
  res,
  { statusCode = 500, message = "Error interno del servidor", errors = null } = {}
) => {
  const payload = { ok: false, message };
  if (errors) payload.errors = errors;
  return res.status(statusCode).json(payload);
};

const validar = (req, res) => {
  const errores = validationResult(req);

  if (!errores.isEmpty()) {
    sendError(res, {
      statusCode: 400,
      message: "Errores de validación",
      errors: errores.array(),
    });
    return false;
  }

  return true;
};

const safeString = (v, fallback = "") => {
  if (v === null || v === undefined) return fallback;
  return String(v).trim();
};

const safeNumber = (v, fallback = null) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const safeBool = (v, fallback = null) => {
  if (v === undefined || v === null || v === "") return fallback;
  if (typeof v === "boolean") return v;

  const s = String(v).trim().toLowerCase();

  if (["true", "1", "yes", "si", "sí", "on"].includes(s)) return true;
  if (["false", "0", "no", "off"].includes(s)) return false;

  return fallback;
};

const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

function buildSort(sortBy) {
  const raw = safeString(sortBy);

  if (!raw) return { createdAt: -1 };

  const allowed = new Set([
    "createdAt",
    "updatedAt",
    "nombre",
    "precioFinal",
    "stock",
    "categoria",
    "tipo",
  ]);

  const desc = raw.startsWith("-");
  const field = desc ? raw.slice(1) : raw;

  if (!allowed.has(field)) {
    return { createdAt: -1 };
  }

  return { [field]: desc ? -1 : 1 };
}

function buildPublicFilter(query = {}) {
  const {
    q,
    categoria,
    proveedor,
    tipo,
    precioMin,
    precioMax,
    conStock,
  } = query;

  const filtro = {
    activo: true,
    visible: true,
  };

  const qClean = safeString(q).toLowerCase();
  const categoriaClean = safeString(categoria);
  const proveedorClean = safeString(proveedor);
  const tipoClean = safeString(tipo).toLowerCase();

  if (qClean) {
    filtro.$or = [
      { nombre: { $regex: qClean, $options: "i" } },
      { descripcion: { $regex: qClean, $options: "i" } },
      { categoria: { $regex: qClean, $options: "i" } },
      { proveedor: { $regex: qClean, $options: "i" } },
      { sku: { $regex: qClean, $options: "i" } },
    ];
  }

  if (categoriaClean) filtro.categoria = categoriaClean;
  if (proveedorClean) filtro.proveedor = proveedorClean;

  if (["marketplace", "dropshipping", "afiliado"].includes(tipoClean)) {
    filtro.tipo = tipoClean;
  }

  const min = safeNumber(precioMin, null);
  const max = safeNumber(precioMax, null);

  if (min !== null || max !== null) {
    filtro.precioFinal = {};
    if (min !== null && min >= 0) filtro.precioFinal.$gte = min;
    if (max !== null && max >= 0) filtro.precioFinal.$lte = max;
  }

  const onlyStock = safeBool(conStock, null);

  if (onlyStock === true) {
    filtro.$and = [
      ...(filtro.$and || []),
      {
        $or: [
          { gestionStock: false },
          { gestionStock: { $exists: false } },
          { stock: { $gt: 0 } },
        ],
      },
    ];
  }

  return filtro;
}

function buildAdminFilter(query = {}) {
  const filtro = {};

  const q = safeString(query.q).toLowerCase();
  const categoria = safeString(query.categoria);
  const proveedor = safeString(query.proveedor);
  const tipo = safeString(query.tipo).toLowerCase();
  const sellerType = safeString(query.sellerType).toLowerCase();

  const activo = safeBool(query.activo, null);
  const visible = safeBool(query.visible, null);

  if (q) {
    filtro.$or = [
      { nombre: { $regex: q, $options: "i" } },
      { descripcion: { $regex: q, $options: "i" } },
      { categoria: { $regex: q, $options: "i" } },
      { proveedor: { $regex: q, $options: "i" } },
      { sku: { $regex: q, $options: "i" } },
    ];
  }

  if (categoria) filtro.categoria = categoria;
  if (proveedor) filtro.proveedor = proveedor;

  if (["marketplace", "dropshipping", "afiliado"].includes(tipo)) {
    filtro.tipo = tipo;
  }

  if (["platform", "seller"].includes(sellerType)) {
    filtro.sellerType = sellerType;
  }

  if (activo !== null) filtro.activo = activo;
  if (visible !== null) filtro.visible = visible;

  return filtro;
}

function getPagination(query = {}) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

function normalizeProductPayload(body = {}) {
  const precio = safeNumber(body.precio, null);
  const precioFinal = safeNumber(body.precioFinal, null);

  const payload = {
    nombre: safeString(body.nombre),
    sku: safeString(body.sku).toUpperCase(),
    descripcion: safeString(body.descripcion),
    categoria: safeString(body.categoria),
    proveedor: safeString(body.proveedor, "local") || "local",
    proveedorProductoId: safeString(body.proveedorProductoId),
    moneda: safeString(body.moneda, "USD").toUpperCase() || "USD",

    tipo: ["marketplace", "dropshipping", "afiliado"].includes(
      safeString(body.tipo).toLowerCase()
    )
      ? safeString(body.tipo).toLowerCase()
      : "marketplace",

    sellerType: ["platform", "seller"].includes(
      safeString(body.sellerType).toLowerCase()
    )
      ? safeString(body.sellerType).toLowerCase()
      : "platform",

    costoProveedor: Math.max(0, safeNumber(body.costoProveedor, 0)),
    margenPorcentaje: Math.max(0, safeNumber(body.margenPorcentaje, 20)),
    stock: Math.max(0, Math.floor(safeNumber(body.stock, 0))),
    gestionStock: safeBool(body.gestionStock, false),

    activo: safeBool(body.activo, true),
    visible: safeBool(body.visible, true),

    imagenPrincipal: safeString(body.imagenPrincipal),
    imagenes: Array.isArray(body.imagenes)
      ? body.imagenes.map((x) => safeString(x)).filter(Boolean).slice(0, 20)
      : [],

    tags: Array.isArray(body.tags)
      ? Array.from(
          new Set(
            body.tags
              .map((x) => safeString(x).toLowerCase())
              .filter(Boolean)
              .slice(0, 50)
          )
        )
      : [],

    affiliateUrl: safeString(body.affiliateUrl),
    plataformaAfiliado: safeString(body.plataformaAfiliado),

    metadata:
      body.metadata && typeof body.metadata === "object" ? body.metadata : {},
  };

  if (precio !== null && precio > 0) {
    payload.precioFinal = precio;
  } else if (precioFinal !== null && precioFinal > 0) {
    payload.precioFinal = precioFinal;
  }

  if (
    body.comisionPct === null ||
    body.comisionPct === undefined ||
    body.comisionPct === ""
  ) {
    payload.comisionPct = null;
  } else {
    payload.comisionPct = Math.max(0, Math.min(100, safeNumber(body.comisionPct, 0)));
  }

  payload.commissionFlat = Math.max(0, safeNumber(body.commissionFlat, 0));

  return payload;
}

// =======================================================
// GET /api/productos
// Público: productos activos y visibles
// =======================================================
exports.obtenerProductos = async (req, res, next) => {
  try {
    const filtro = buildPublicFilter(req.query);
    const sort = buildSort(req.query.sortBy);
    const { page, limit, skip } = getPagination(req.query);

    const [productos, total] = await Promise.all([
      Producto.find(filtro).sort(sort).skip(skip).limit(limit).lean(),
      Producto.countDocuments(filtro),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return sendSuccess(res, {
      message: "Lista de productos obtenida correctamente",
      data: productos,
      meta: {
        total,
        page,
        totalPages,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (err) {
    return next(err);
  }
};

// =======================================================
// GET /api/productos/admin
// Admin: lista completa con filtros
// =======================================================
exports.obtenerProductosAdmin = async (req, res, next) => {
  try {
    const filtro = buildAdminFilter(req.query);
    const sort = buildSort(req.query.sortBy);
    const { page, limit, skip } = getPagination(req.query);

    const [productos, total] = await Promise.all([
      Producto.find(filtro).sort(sort).skip(skip).limit(limit).lean(),
      Producto.countDocuments(filtro),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return sendSuccess(res, {
      message: "Lista administrativa de productos obtenida correctamente",
      data: productos,
      meta: {
        total,
        page,
        totalPages,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (err) {
    return next(err);
  }
};

// =======================================================
// GET /api/productos/:id
// Público: detalle si activo/visible
// =======================================================
exports.obtenerProductoPorId = async (req, res, next) => {
  try {
    if (!validar(req, res)) return;

    const { id } = req.params;

    if (!id || !isObjectId(id)) {
      return sendError(res, {
        statusCode: 400,
        message: "ID de producto inválido",
      });
    }

    const producto = await Producto.findOne({
      _id: id,
      activo: true,
      visible: true,
    }).lean();

    if (!producto) {
      return sendError(res, {
        statusCode: 404,
        message: "Producto no encontrado",
      });
    }

    return sendSuccess(res, {
      message: "Producto obtenido correctamente",
      data: producto,
    });
  } catch (err) {
    return next(err);
  }
};

// =======================================================
// POST /api/productos/crear
// Admin/platform legacy
// =======================================================
exports.crearProducto = async (req, res, next) => {
  try {
    if (!validar(req, res)) return;

    const payload = normalizeProductPayload(req.body);

    if (!payload.nombre) {
      return sendError(res, {
        statusCode: 400,
        message: "El nombre es obligatorio",
      });
    }

    if (payload.tipo !== "afiliado" && (!payload.precioFinal || payload.precioFinal <= 0)) {
      return sendError(res, {
        statusCode: 400,
        message: "El producto requiere un precio válido",
      });
    }

    if (payload.tipo === "afiliado" && !payload.affiliateUrl) {
      return sendError(res, {
        statusCode: 400,
        message: "Los productos afiliados requieren affiliateUrl",
      });
    }

    const nuevo = await Producto.create(payload);

    return sendSuccess(res, {
      statusCode: 201,
      message: "Producto creado correctamente",
      data: nuevo,
    });
  } catch (err) {
    return next(err);
  }
};

// =======================================================
// PUT /api/productos/editar/:id
// =======================================================
exports.editarProducto = async (req, res, next) => {
  try {
    if (!validar(req, res)) return;

    const { id } = req.params;

    if (!id || !isObjectId(id)) {
      return sendError(res, {
        statusCode: 400,
        message: "ID de producto inválido",
      });
    }

    const payload = normalizeProductPayload(req.body);

    if (!payload.nombre) {
      return sendError(res, {
        statusCode: 400,
        message: "El nombre es obligatorio",
      });
    }

    if (payload.tipo !== "afiliado" && (!payload.precioFinal || payload.precioFinal <= 0)) {
      return sendError(res, {
        statusCode: 400,
        message: "El producto requiere un precio válido",
      });
    }

    const actualizado = await Producto.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true,
    });

    if (!actualizado) {
      return sendError(res, {
        statusCode: 404,
        message: "Producto no encontrado",
      });
    }

    return sendSuccess(res, {
      message: "Producto actualizado correctamente",
      data: actualizado,
    });
  } catch (err) {
    return next(err);
  }
};

// =======================================================
// DELETE /api/productos/eliminar/:id
// =======================================================
exports.eliminarProducto = async (req, res, next) => {
  try {
    if (!validar(req, res)) return;

    const { id } = req.params;

    if (!id || !isObjectId(id)) {
      return sendError(res, {
        statusCode: 400,
        message: "ID de producto inválido",
      });
    }

    const eliminado = await Producto.findByIdAndDelete(id);

    if (!eliminado) {
      return sendError(res, {
        statusCode: 404,
        message: "Producto no encontrado",
      });
    }

    return sendSuccess(res, {
      message: "Producto eliminado correctamente",
      data: {
        _id: eliminado._id,
      },
    });
  } catch (err) {
    return next(err);
  }
};