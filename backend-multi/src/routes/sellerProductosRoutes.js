"use strict";

const express = require("express");
const router = express.Router();

// ✅ IMPORTS CORRECTOS (rutas relativas bien hechas)
const { proteger, requireRoles } = require("../middleware/auth");

const {
  listarProductos,
  crearProducto,
  obtenerProducto,
  actualizarProducto,
  eliminarProducto,
} = require("../controllers/sellerProductosController");

// ======================================================
// 🔐 PROTECCIÓN (ADMIN + VENDEDOR)
// ======================================================
router.use(proteger);
router.use(requireRoles("admin", "vendedor"));

// ======================================================
// 📦 RUTAS
// ======================================================
router.get("/", listarProductos);
router.post("/", crearProducto);
router.get("/:id", obtenerProducto);
router.put("/:id", actualizarProducto);
router.delete("/:id", eliminarProducto);

module.exports = router;