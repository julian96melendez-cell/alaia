"use strict";

const express = require("express");
const router = express.Router();

const {
  listarProductos,
  crearProducto,
  obtenerProducto,
  actualizarProducto,
  eliminarProducto,
} = require("../controllers/sellerProductosController");

// 👇 SI TIENES MIDDLEWARE DE AUTH
const { proteger } = require("../middlewares/authMiddleware");

// ======================================================
// RUTAS
// ======================================================

router.get("/", proteger, listarProductos);
router.post("/", proteger, crearProducto);

router.get("/:id", proteger, obtenerProducto);
router.put("/:id", proteger, actualizarProducto);
router.delete("/:id", proteger, eliminarProducto);

module.exports = router;