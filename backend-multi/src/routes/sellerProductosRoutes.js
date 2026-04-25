"use strict";

const express = require("express");
const router = express.Router();

const { proteger, requireRoles } = require("../middleware/auth");

const {
  listarProductos,
  crearProducto,
  obtenerProducto,
  actualizarProducto,
  eliminarProducto,
} = require("../controllers/sellerProductosController");

// ======================================================
// sellerProductosRoutes.js
// Rutas protegidas para gestión de productos de vendedor/admin
// Base URL en server.js:
// app.use("/api/seller/productos", sellerProductosRoutes);
// ======================================================

// Todas las rutas requieren usuario autenticado
router.use(proteger);

// Permitir gestión a admin y vendedor
router.use(requireRoles("admin", "vendedor"));

// GET /api/seller/productos
router.get("/", listarProductos);

// POST /api/seller/productos
router.post("/", crearProducto);

// GET /api/seller/productos/:id
router.get("/:id", obtenerProducto);

// PUT /api/seller/productos/:id
router.put("/:id", actualizarProducto);

// DELETE /api/seller/productos/:id
router.delete("/:id", eliminarProducto);

module.exports = router;