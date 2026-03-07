// =============================================
// productosController.js — VERSIÓN PRO + STANDALONE
// =============================================

const { validationResult } = require('express-validator');
const Producto = require('../models/Producto');

// ----------------------------------------------
// Helpers locales para respuestas
// ----------------------------------------------
const sendSuccess = (res, { statusCode = 200, message = "OK", data = null, meta = null }) => {
  return res.status(statusCode).json({ ok: true, message, data, meta });
};

const sendError = (res, { statusCode = 500, message = "Error interno del servidor", errors = null }) => {
  const payload = { ok: false, message };
  if (errors) payload.errors = errors;
  return res.status(statusCode).json(payload);
};

// ----------------------------------------------
// Validación (estandarizada)
// ----------------------------------------------
const validar = (req, res) => {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return sendError(res, {
      statusCode: 400,
      message: "Errores de validación",
      errors: errores.array()
    });
  }
  return true;
};

// =======================================================
// GET /api/productos
// Lista de productos con filtros PRO + paginación
// =======================================================
exports.obtenerProductos = async (req, res, next) => {
  try {
    const { q, categoria, proveedor, precioMin, precioMax, sortBy, page = 1, limit = 20 } = req.query;

    const filtro = {};

    if (q) {
      filtro.$or = [
        { nombre: { $regex: q, $options: "i" } },
        { descripcion: { $regex: q, $options: "i" } },
      ];
    }

    if (categoria) filtro.categoria = categoria;
    if (proveedor) filtro.proveedor = proveedor;

    if (precioMin || precioMax) {
      filtro.precio = {};
      if (precioMin) filtro.precio.$gte = Number(precioMin);
      if (precioMax) filtro.precio.$lte = Number(precioMax);
    }

    // SORTING
    let sort = { createdAt: -1 };
    if (sortBy) {
      if (sortBy.startsWith("-")) {
        sort = { [sortBy.substring(1)]: -1 };
      } else {
        sort = { [sortBy]: 1 };
      }
    }

    // PAGINACIÓN
    const pageNumber = Math.max(parseInt(page) || 1, 1);
    const limitNumber = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const skip = (pageNumber - 1) * limitNumber;

    const [productos, total] = await Promise.all([
      Producto.find(filtro).sort(sort).skip(skip).limit(limitNumber),
      Producto.countDocuments(filtro)
    ]);

    const totalPages = Math.ceil(total / limitNumber);

    return sendSuccess(res, {
      message: "Lista de productos obtenida correctamente",
      data: productos,
      meta: {
        total,
        page: pageNumber,
        totalPages,
        limit: limitNumber,
        hasNextPage: pageNumber < totalPages,
        hasPrevPage: pageNumber > 1,
      }
    });

  } catch (err) {
    next(err);
  }
};

// =======================================================
// GET /api/productos/:id
// =======================================================
exports.obtenerProductoPorId = async (req, res, next) => {
  try {
    if (!validar(req, res)) return;

    const { id } = req.params;

    const producto = await Producto.findById(id);
    if (!producto) {
      return sendError(res, {
        statusCode: 404,
        message: "Producto no encontrado"
      });
    }

    return sendSuccess(res, {
      message: "Producto obtenido correctamente",
      data: producto
    });

  } catch (err) {
    next(err);
  }
};

// =======================================================
// POST /api/productos/crear (solo admin)
// =======================================================
exports.crearProducto = async (req, res, next) => {
  try {
    if (!validar(req, res)) return;

    const nuevo = new Producto(req.body);
    await nuevo.save();

    return sendSuccess(res, {
      statusCode: 201,
      message: "Producto creado correctamente",
      data: nuevo
    });

  } catch (err) {
    next(err);
  }
};

// =======================================================
// PUT /api/productos/editar/:id
// =======================================================
exports.editarProducto = async (req, res, next) => {
  try {
    if (!validar(req, res)) return;

    const { id } = req.params;

    const actualizado = await Producto.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true
    });

    if (!actualizado) {
      return sendError(res, {
        statusCode: 404,
        message: "Producto no encontrado"
      });
    }

    return sendSuccess(res, {
      message: "Producto actualizado correctamente",
      data: actualizado
    });

  } catch (err) {
    next(err);
  }
};

// =======================================================
// DELETE /api/productos/eliminar/:id
// =======================================================
exports.eliminarProducto = async (req, res, next) => {
  try {
    if (!validar(req, res)) return;

    const { id } = req.params;

    const eliminado = await Producto.findByIdAndDelete(id);

    if (!eliminado) {
      return sendError(res, {
        statusCode: 404,
        message: "Producto no encontrado"
      });
    }

    return sendSuccess(res, {
      message: "Producto eliminado correctamente"
    });

  } catch (err) {
    next(err);
  }
};