// ===========================================================
// authRoutes.js — Rutas de Autenticación (Enterprise Hardened)
// ===========================================================

"use strict";

const express = require("express");
const { body, validationResult } = require("express-validator");
const router = express.Router();

// Controllers
const {
  registrar,
  login,
  refreshToken,
  logout,
} = require("../controllers/authController");

// Middleware de protección con JWT
const { proteger } = require("../middleware/auth");

// ===========================================================
// Helpers
// ===========================================================
function safeString(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function validateRequest(req, res, next) {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return next();
  }

  return res.status(400).json({
    ok: false,
    message: "Error de validación",
    errors: errors.array().map((err) => ({
      field: err.path,
      message: err.msg,
    })),
    reqId: req.reqId || null,
  });
}

// ===========================================================
// VALIDACIONES
// ===========================================================

// Registro
const validarRegistro = [
  body("nombre")
    .customSanitizer((v) => safeString(v))
    .isLength({ min: 2, max: 100 })
    .withMessage("El nombre debe tener entre 2 y 100 caracteres"),

  body("email")
    .customSanitizer((v) => safeString(v).toLowerCase())
    .isEmail()
    .withMessage("Email inválido")
    .isLength({ max: 200 })
    .withMessage("El email es demasiado largo"),

  body("password")
    .isString()
    .withMessage("La contraseña es obligatoria")
    .isLength({ min: 8, max: 200 })
    .withMessage("La contraseña debe tener al menos 8 caracteres"),
];

// Login
const validarLogin = [
  body("email")
    .customSanitizer((v) => safeString(v).toLowerCase())
    .isEmail()
    .withMessage("Email inválido"),

  body("password")
    .isString()
    .withMessage("La contraseña es obligatoria")
    .notEmpty()
    .withMessage("La contraseña es obligatoria"),
];

// Refresh
const validarRefresh = [
  body("refreshToken")
    .optional()
    .customSanitizer((v) => safeString(v)),
];

// ===========================================================
// RUTAS PÚBLICAS
// ===========================================================

// Registrar usuario
// POST /api/auth/registrar
router.post("/registrar", validarRegistro, validateRequest, registrar);

// Iniciar sesión
// POST /api/auth/login
router.post("/login", validarLogin, validateRequest, login);

// Obtener nuevo access token usando refresh token
// POST /api/auth/refresh
// El controller puede leer refreshToken desde body o cookie
router.post("/refresh", validarRefresh, validateRequest, refreshToken);

// ===========================================================
// RUTAS PROTEGIDAS
// ===========================================================

// Obtener datos del usuario autenticado
// GET /api/auth/me
router.get("/me", proteger, (req, res) => {
  const usuario = req.usuario;

  return res.status(200).json({
    ok: true,
    data: {
      id: usuario._id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      activo: usuario.activo,
      bloqueado: usuario.bloqueado,
      emailVerificado: usuario.emailVerificado,
      stripeAccountId: usuario.stripeAccountId || null,
      stripeOnboardingComplete: !!usuario.stripeOnboardingComplete,
      stripeChargesEnabled: !!usuario.stripeChargesEnabled,
      stripePayoutsEnabled: !!usuario.stripePayoutsEnabled,
      createdAt: usuario.createdAt,
      updatedAt: usuario.updatedAt,
    },
    reqId: req.reqId || null,
  });
});

// Cerrar sesión
// POST /api/auth/logout
router.post("/logout", proteger, logout);

// ===========================================================
module.exports = router;