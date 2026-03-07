// ======================================================
// carritoController.js — Controlador PRO del carrito
// ======================================================

const carritoService = require('../../services/carrito/carritoService');
const { success } = require('../../utils/apiResponse');
const mongoose = require('mongoose');

// ======================================================
// Helpers
// ======================================================
const getUserId = (req) => req.usuario?._id || req.usuario?.id;

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// ======================================================
// OBTENER CARRITO
// ======================================================
exports.obtenerCarrito = async (req, res, next) => {
  try {
    const usuarioId = getUserId(req);

    const carrito = await carritoService.obtenerCarrito(usuarioId);

    return success(res, {
      message: 'Carrito obtenido correctamente',
      data: carrito,
    });
  } catch (err) {
    next(err);
  }
};

// ======================================================
// AGREGAR ITEM
// ======================================================
exports.agregarItem = async (req, res, next) => {
  try {
    const usuarioId = getUserId(req);

    // 🔥 Soporta ambos nombres (frontend flexible)
    const productoId = req.body.productoId || req.body.productId;
    const cantidad = Number(req.body.cantidad || 1);

    if (!productoId) {
      return res.status(400).json({
        ok: false,
        message: 'productoId es obligatorio',
      });
    }

    if (!isValidObjectId(productoId)) {
      return res.status(400).json({
        ok: false,
        message: 'productoId inválido',
      });
    }

    if (cantidad <= 0) {
      return res.status(400).json({
        ok: false,
        message: 'La cantidad debe ser mayor a 0',
      });
    }

    const carrito = await carritoService.agregarItem(
      usuarioId,
      productoId,
      cantidad
    );

    return success(res, {
      message: 'Producto agregado al carrito',
      data: carrito,
    });
  } catch (err) {
    next(err);
  }
};

// ======================================================
// ACTUALIZAR CANTIDAD
// ======================================================
exports.actualizarCantidad = async (req, res, next) => {
  try {
    const usuarioId = getUserId(req);
    const productoId = req.params.productoId;
    const cantidad = Number(req.body.cantidad);

    if (!productoId || !isValidObjectId(productoId)) {
      return res.status(400).json({
        ok: false,
        message: 'productoId inválido',
      });
    }

    if (cantidad <= 0) {
      return res.status(400).json({
        ok: false,
        message: 'La cantidad debe ser mayor a 0',
      });
    }

    const carrito = await carritoService.actualizarCantidad(
      usuarioId,
      productoId,
      cantidad
    );

    return success(res, {
      message: 'Cantidad actualizada',
      data: carrito,
    });
  } catch (err) {
    next(err);
  }
};

// ======================================================
// ELIMINAR ITEM
// ======================================================
exports.eliminarItem = async (req, res, next) => {
  try {
    const usuarioId = getUserId(req);
    const { productoId } = req.params;

    if (!productoId || !isValidObjectId(productoId)) {
      return res.status(400).json({
        ok: false,
        message: 'productoId inválido',
      });
    }

    const carrito = await carritoService.eliminarItem(
      usuarioId,
      productoId
    );

    return success(res, {
      message: 'Producto eliminado del carrito',
      data: carrito,
    });
  } catch (err) {
    next(err);
  }
};

// ======================================================
// VACIAR CARRITO
// ======================================================
exports.vaciarCarrito = async (req, res, next) => {
  try {
    const usuarioId = getUserId(req);

    const carrito = await carritoService.vaciarCarrito(usuarioId);

    return success(res, {
      message: 'Carrito vaciado correctamente',
      data: carrito,
    });
  } catch (err) {
    next(err);
  }
}; 