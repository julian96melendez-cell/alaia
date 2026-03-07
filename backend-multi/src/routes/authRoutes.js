// ===========================================================
// authRoutes.js — Rutas de Autenticación
// ===========================================================

const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

// Controllers
const {
  registrar,
  login,
  refreshToken,
  logout,
} = require('../controllers/authController');

// Middleware de protección con JWT
const { proteger } = require('../middleware/auth');

// ===========================================================
// VALIDACIONES
// ===========================================================

// Validar registro
const validarRegistro = [
  body('nombre')
    .notEmpty()
    .withMessage('El nombre es obligatorio'),

  body('email')
    .isEmail()
    .withMessage('Email inválido'),

  body('password')
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener al menos 6 caracteres'),
];

// Validar login
const validarLogin = [
  body('email')
    .isEmail()
    .withMessage('Email inválido'),

  body('password')
    .notEmpty()
    .withMessage('La contraseña es obligatoria'),
];

// Validar refresh token
const validarRefresh = [
  body('refreshToken')
    .notEmpty()
    .withMessage('El refresh token es obligatorio'),
];

// ===========================================================
// RUTAS PÚBLICAS
// ===========================================================

// Registrar usuario
// POST /api/auth/registrar
router.post('/registrar', validarRegistro, registrar);

// Iniciar sesión
// POST /api/auth/login
router.post('/login', validarLogin, login);

// Obtener nuevo access token usando refresh token
// POST /api/auth/refresh
router.post('/refresh', validarRefresh, refreshToken);

// ===========================================================
// RUTAS PROTEGIDAS
// ===========================================================

// Obtener datos del usuario autenticado
// GET /api/auth/me
router.get('/me', proteger, (req, res) => {
  const usuario = req.usuario;

  return res.json({
    ok: true,
    data: {
      id: usuario._id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      createdAt: usuario.createdAt,
    },
  });
});

// Cerrar sesión
// POST /api/auth/logout
router.post('/logout', proteger, logout);

// ===========================================================
module.exports = router;