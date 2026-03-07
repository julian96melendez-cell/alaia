// =======================================================
// productosRoutes.js — Gestión de Productos (Enterprise)
// =======================================================

const express = require('express');
const router = express.Router();

// Middlewares
const { proteger, soloAdmin } = require('../middleware/auth');

// Controladores
const {
  crearProducto,
  obtenerProductos,
  obtenerProductoPorId,
  editarProducto,
  eliminarProducto
} = require('../controllers/productosController');

// =======================================================
// RUTAS PÚBLICAS
// =======================================================

router.get('/', obtenerProductos);
router.get('/:id', obtenerProductoPorId);

// =======================================================
// RUTAS PRIVADAS (ADMIN)
// =======================================================

router.post(
  '/',
  proteger,
  soloAdmin,
  crearProducto
);

router.put(
  '/:id',
  proteger,
  soloAdmin,
  editarProducto
);

router.delete(
  '/:id',
  proteger,
  soloAdmin,
  eliminarProducto
);

module.exports = router;