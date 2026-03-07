// ==========================================================
// userRoutes.js — Rutas Usuario (ENTERPRISE ULTRA)
// ==========================================================

const express = require("express");
const router = express.Router();

const rateLimit = require("express-rate-limit");

// ==========================================================
// Middleware auth
// ==========================================================
const { proteger, soloAdmin } = require("../middleware/auth");

// ==========================================================
// Controller
// ==========================================================
const {
  guardarPushToken,
} = require("../controllers/userController");

// ==========================================================
// Rate limits (anti-abuso)
// ==========================================================
const pushTokenLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// ==========================================================
// Seguridad global
// ==========================================================
router.use(proteger); 
// 🔒 TODAS las rutas de usuario requieren login

// ==========================================================
// 🔔 PUSH TOKEN
// ==========================================================
// POST /api/users/push-token
router.post("/push-token", pushTokenLimiter, guardarPushToken);

// ==========================================================
// FUTURO (listo para crecer sin romper)
// ==========================================================

// Perfil propio
// router.get("/me", obtenerMiPerfil);
// router.put("/me", actualizarMiPerfil);

// Direcciones
// router.get("/direcciones", obtenerDirecciones);
// router.post("/direcciones", crearDireccion);

// Órdenes del usuario
// router.get("/ordenes", obtenerMisOrdenes);

// Vendedor (futuro)
// router.get("/seller/dashboard", esVendedor, dashboardVendedor);

// Admin
// router.get("/admin/users", soloAdmin, listarUsuarios);

// ==========================================================
module.exports = router;