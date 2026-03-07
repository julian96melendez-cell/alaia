// =================================================
// carritoRoutes.js — Rutas del carrito (PRO)
// =================================================

const express = require('express');
const router = express.Router();
const { proteger } = require('../middleware/auth');

const {
  obtenerCarrito,
  agregarItem,
  actualizarCantidad,
  eliminarItem,
  vaciarCarrito
} = require('../controllers/carrito/carritoController');

// Obtener carrito del usuario
router.get('/', proteger, obtenerCarrito);

// Agregar producto al carrito
router.post('/agregar', proteger, agregarItem);

// Actualizar cantidad de un producto
router.put('/cantidad/:productoId', proteger, actualizarCantidad);

// Eliminar un producto del carrito
router.delete('/eliminar/:productoId', proteger, eliminarItem);

// Vaciar carrito completo
router.delete('/vaciar', proteger, vaciarCarrito);

module.exports = router;