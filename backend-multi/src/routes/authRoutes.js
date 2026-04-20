"use strict";

const express = require("express");
const { body, validationResult } = require("express-validator");
const router = express.Router();

const {
  registrar,
  login,
  me,
  refreshToken,
  logout,
} = require("../controllers/authController");

const { proteger } = require("../middleware/auth");

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

// Refresh via cookie HTTP-only; body se deja opcional por compatibilidad
const validarRefresh = [
  body("refreshToken")
    .optional()
    .customSanitizer((v) => safeString(v)),
];

router.post("/registrar", validarRegistro, validateRequest, registrar);
router.post("/login", validarLogin, validateRequest, login);
router.get("/me", proteger, me);
router.post("/refresh", validarRefresh, validateRequest, refreshToken);
router.post("/logout", proteger, logout);

module.exports = router;