"use strict";

const mongoose = require("mongoose");
const Producto = require("../models/Producto");

const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const send = (res, statusCode, payload) => res.status(statusCode).json(payload);

const ok = (res, { message = "OK", data = null, meta = null } = {}) =>
  send(res, 200, { ok: true, message, data, meta });

const created = (res, { message = "Creado", data = null, meta = null } = {}) =>
  send(res, 201, { ok: true, message, data, meta });

const bad = (res, message = "Bad Request", extra = {}) =>
  send(res, 400, { ok: false, message, ...extra });

const forbidden = (res, message = "Acceso denegado") =>
  send(res, 403, { ok: false, message });

const notFound = (res, message = "No encontrado") =>
  send(res, 404, { ok: false, message });

const serverError = (res, message = "Error interno", extra = {}) =>
  send(res, 500, { ok: false, message, ...extra });

const safeString = (v, fallback = "") =>
  v === null || v === undefined ? fallback : String(v).trim();

const safeNumber = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const safeBool = (v, fallback = false) => {
  if (typeof v === "boolean") return v;

  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(s)) return true;
    if (["false", "0", "no", "n", "off"].includes(s)) return false;
  }

  return fallback;
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function getReqId(req) {
  return (
    req.reqId ||
    req.headers["x-request-id"] ||
    req.headers["x-correlation-id"] ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function getUsuarioId(req) {
  return String(req.usuario?._id || req.usuario?.id || "");
}

function isSeller(req) {
  return req.usuario?.rol === "vendedor";
}

function canManageSellerProducts(req) {
  return req.usuario?.rol === "admin" || req.usuario?.rol === "vendedor";
}

function normalizeImages(input) {
  if (!Array.isArray(input)) return [];

  return input
    .map((x) => safeString(x))
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeTags(input) {
  if (!Array.isArray(input)) return [];

  return Array.from(
    new Set(
      input
        .map((x) => safeString(x).toLowerCase())
        .filter(Boolean)
        .slice(0, 50)
    )
  );
}

function sanitizeCreateOrUpdatePayload(body = {}) {
  const tipoRaw = safeString(body.tipo || "marketplace").toLowerCase();

  const tipo = ["marketplace", "dropshipping", "afiliado"].includes(tipoRaw)
    ? tipoRaw
    : "marketplace";

  const gestionStock = safeBool(body.gestionStock, false);
  const costoProveedor = Math.max(0, round2(safeNumber(body.costoProveedor, 0)));
  const margenPorcentaje = Math.max(0, safeNumber(body.margenPorcentaje, 20));
  const precioFinalManual = Math.max(0, round2(safeNumber(body.precioFinal, 0)));
  const stock = Math.max(0, Math.floor(safeNumber(body.stock, 0)));

  const payload = {
    nombre: safeString(body.nombre),
    sku: safeString(body.sku).toUpperCase(),
    descripcion: safeString(body.descripcion),
    categoria: safeString(body.categoria),
    proveedor: safeString(body.proveedor, "local") || "local",
    proveedorProductoId: safeString(body.proveedorProductoId),
    moneda: safeString(body.moneda, "USD").toUpperCase() || "USD",

    tipo,
    gestionStock,
    stock,

    activo: safeBool(body.activo, true),
    visible: safeBool(body.visible, true),

    imagenPrincipal: safeString(body.imagenPrincipal),
    imagenes: normalizeImages(body.imagenes),
    tags: normalizeTags(body.tags),

    costoProveedor,
    margenPorcentaje,

    comisionPct:
      body.comisionPct === null ||
      body.comisionPct === undefined ||
      body.comisionPct === ""
        ? null
        : Math.max(0, Math.min(100, safeNumber(body.comisionPct, 0))),

    commissionFlat: Math.max(0, round2(safeNumber(body.commissionFlat, 0))),
  };

  const precioCompat = safeNumber(body.precio, NaN);

  if (Number.isFinite(precioCompat) && precioCompat > 0) {
    payload.precioFinal = round2(precioCompat);
  } else if (precioFinalManual > 0) {
    payload.precioFinal = precioFinalManual;
  }

  if (tipo === "afiliado") {
    payload.affiliateUrl = safeString(body.affiliateUrl);
    payload.plataformaAfiliado = safeString(body.plataformaAfiliado);
  } else {
    payload.affiliateUrl = "";
    payload.plataformaAfiliado = "";
  }

  return payload;
}

// ======================================================
// GET /api/seller/productos
// ======================================================
exports.listarProductos = async (req, res) => {
  const reqId = getReqId(req);

  try {
    if (!req.usuario) return forbidden(res, "No autenticado");

    if (!canManageSellerProducts(req)) {
      return forbidden(res, "Acceso exclusivo para vendedores");
    }

    const vendedorId = getUsuarioId(req);
    if (!vendedorId) return forbidden(res, "No autenticado");

    const q = safeString(req.query.q).toLowerCase();

    const activo =
      req.query.activo === undefined ? null : safeBool(req.query.activo, true);

    const visible =
      req.query.visible === undefined ? null : safeBool(req.query.visible, true);

    const categoria = safeString(req.query.categoria);
    const tipo = safeString(req.query.tipo).toLowerCase();

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const filter = {
      vendedor: vendedorId,
      sellerType: "seller",
    };

    if (q) {
      filter.$or = [
        { nombre: { $regex: q, $options: "i" } },
        { sku: { $regex: q, $options: "i" } },
        { descripcion: { $regex: q, $options: "i" } },
        { categoria: { $regex: q, $options: "i" } },
        { proveedor: { $regex: q, $options: "i" } },
      ];
    }

    if (activo !== null) filter.activo = activo;
    if (visible !== null) filter.visible = visible;
    if (categoria) filter.categoria = categoria;

    if (["marketplace", "dropshipping", "afiliado"].includes(tipo)) {
      filter.tipo = tipo;
    }

    const [items, total] = await Promise.all([
      Producto.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Producto.countDocuments(filter),
    ]);

    return ok(res, {
      message: "Productos del vendedor obtenidos correctamente",
      data: items,
      meta: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
        reqId,
      },
    });
  } catch (err) {
    console.error("SELLER PRODUCTOS LIST ERROR:", {
      reqId,
      name: err?.name,
      message: err?.message,
      code: err?.code,
      errors: err?.errors,
      stack: err?.stack,
    });

    return serverError(res, "Error obteniendo productos del vendedor", {
      reqId,
      error: err?.message,
      name: err?.name,
      code: err?.code,
    });
  }
};

// ======================================================
// POST /api/seller/productos
// ======================================================
exports.crearProducto = async (req, res) => {
  const reqId = getReqId(req);

  try {
    if (!req.usuario) return forbidden(res, "No autenticado");

    if (!canManageSellerProducts(req)) {
      return forbidden(res, "Acceso exclusivo para vendedores");
    }

    const vendedorId = getUsuarioId(req);
    if (!vendedorId) return forbidden(res, "No autenticado");

    const payload = sanitizeCreateOrUpdatePayload(req.body);

    if (!payload.nombre) {
      return bad(res, "El nombre es obligatorio");
    }

    if (
      payload.tipo !== "afiliado" &&
      (!Number.isFinite(payload.precioFinal) || payload.precioFinal <= 0)
    ) {
      return bad(res, "El producto requiere un precio válido");
    }

    if (payload.tipo === "afiliado" && !payload.affiliateUrl) {
      return bad(res, "Los productos afiliados requieren affiliateUrl");
    }

    const producto = await Producto.create({
      ...payload,
      vendedor: vendedorId,
      sellerType: "seller",
    });

    return created(res, {
      message: "Producto creado correctamente",
      data: producto,
      meta: { reqId },
    });
  } catch (err) {
    console.error("SELLER PRODUCTOS CREATE ERROR:", {
      reqId,
      name: err?.name,
      message: err?.message,
      code: err?.code,
      errors: err?.errors,
      stack: err?.stack,
    });

    return serverError(res, "Error creando producto", {
      reqId,
      error: err?.message,
      name: err?.name,
      code: err?.code,
      errors: err?.errors,
    });
  }
};

// ======================================================
// GET /api/seller/productos/:id
// ======================================================
exports.obtenerProducto = async (req, res) => {
  const reqId = getReqId(req);

  try {
    if (!req.usuario) return forbidden(res, "No autenticado");

    if (!canManageSellerProducts(req)) {
      return forbidden(res, "Acceso exclusivo para vendedores");
    }

    const vendedorId = getUsuarioId(req);
    const { id } = req.params;

    if (!id || !isObjectId(id)) {
      return bad(res, "ID de producto inválido");
    }

    const producto = await Producto.findOne({
      _id: id,
      vendedor: vendedorId,
      sellerType: "seller",
    }).lean();

    if (!producto) {
      return notFound(res, "Producto no encontrado");
    }

    return ok(res, {
      message: "Producto obtenido correctamente",
      data: producto,
      meta: { reqId },
    });
  } catch (err) {
    console.error("SELLER PRODUCTOS GET ERROR:", {
      reqId,
      name: err?.name,
      message: err?.message,
      code: err?.code,
      errors: err?.errors,
      stack: err?.stack,
    });

    return serverError(res, "Error obteniendo producto", {
      reqId,
      error: err?.message,
      name: err?.name,
      code: err?.code,
    });
  }
};

// ======================================================
// PUT /api/seller/productos/:id
// ======================================================
exports.actualizarProducto = async (req, res) => {
  const reqId = getReqId(req);

  try {
    if (!req.usuario) return forbidden(res, "No autenticado");

    if (!canManageSellerProducts(req)) {
      return forbidden(res, "Acceso exclusivo para vendedores");
    }

    const vendedorId = getUsuarioId(req);
    const { id } = req.params;

    if (!id || !isObjectId(id)) {
      return bad(res, "ID de producto inválido");
    }

    const payload = sanitizeCreateOrUpdatePayload(req.body);

    if (!payload.nombre) {
      return bad(res, "El nombre es obligatorio");
    }

    if (
      payload.tipo !== "afiliado" &&
      (!Number.isFinite(payload.precioFinal) || payload.precioFinal <= 0)
    ) {
      return bad(res, "El producto requiere un precio válido");
    }

    if (payload.tipo === "afiliado" && !payload.affiliateUrl) {
      return bad(res, "Los productos afiliados requieren affiliateUrl");
    }

    const producto = await Producto.findOneAndUpdate(
      {
        _id: id,
        vendedor: vendedorId,
        sellerType: "seller",
      },
      {
        ...payload,
        vendedor: vendedorId,
        sellerType: "seller",
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!producto) {
      return notFound(res, "Producto no encontrado");
    }

    return ok(res, {
      message: "Producto actualizado correctamente",
      data: producto,
      meta: { reqId },
    });
  } catch (err) {
    console.error("SELLER PRODUCTOS UPDATE ERROR:", {
      reqId,
      name: err?.name,
      message: err?.message,
      code: err?.code,
      errors: err?.errors,
      stack: err?.stack,
    });

    return serverError(res, "Error actualizando producto", {
      reqId,
      error: err?.message,
      name: err?.name,
      code: err?.code,
      errors: err?.errors,
    });
  }
};

// ======================================================
// DELETE /api/seller/productos/:id
// ======================================================
exports.eliminarProducto = async (req, res) => {
  const reqId = getReqId(req);

  try {
    if (!req.usuario) return forbidden(res, "No autenticado");

    if (!canManageSellerProducts(req)) {
      return forbidden(res, "Acceso exclusivo para vendedores");
    }

    const vendedorId = getUsuarioId(req);
    const { id } = req.params;

    if (!id || !isObjectId(id)) {
      return bad(res, "ID de producto inválido");
    }

    const producto = await Producto.findOneAndDelete({
      _id: id,
      vendedor: vendedorId,
      sellerType: "seller",
    });

    if (!producto) {
      return notFound(res, "Producto no encontrado");
    }

    return ok(res, {
      message: "Producto eliminado correctamente",
      data: {
        _id: producto._id,
      },
      meta: { reqId },
    });
  } catch (err) {
    console.error("SELLER PRODUCTOS DELETE ERROR:", {
      reqId,
      name: err?.name,
      message: err?.message,
      code: err?.code,
      errors: err?.errors,
      stack: err?.stack,
    });

    return serverError(res, "Error eliminando producto", {
      reqId,
      error: err?.message,
      name: err?.name,
      code: err?.code,
    });
  }
};