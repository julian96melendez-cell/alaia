// =============================================
// paymentsRoutes.js — Rutas de pagos (Stripe ENTERPRISE FINAL)
// =============================================

const express = require('express');
const router = express.Router();

const { proteger } = require('../middleware/auth');

const {
  crearSesionDesdeProductos,
  crearSesionDesdeCarrito,
  crearSesionDesdeOrdenId,
  obtenerEstadoPago,
  obtenerEstadoPagoPorSession,
} = require('../payments/stripeController');

// ==================================================
// STRIPE CHECKOUT
// ==================================================

// Checkout desde body.items
// POST /api/pagos/stripe/checkout
router.post('/stripe/checkout', proteger, crearSesionDesdeProductos);

// Checkout desde carrito del usuario autenticado
// POST /api/pagos/stripe/checkout-carrito
router.post('/stripe/checkout-carrito', proteger, crearSesionDesdeCarrito);

// ==================================================
// COBRAR ORDEN EXISTENTE (ENTERPRISE PRO)
// ==================================================
//
// POST /api/pagos/stripe/checkout-orden
// Body: { ordenId: "..." }
// -> Crea sesión Stripe para una orden ya creada
//
router.post('/stripe/checkout-orden', proteger, crearSesionDesdeOrdenId);

// ==================================================
// ESTADO DEL PAGO (IMPORTANTE PARA FRONTEND)
// ==================================================

// Obtener estado de pago por ordenId (usuario autenticado)
// GET /api/pagos/estado/:ordenId
router.get('/estado/:ordenId', proteger, obtenerEstadoPago);

// Obtener estado de pago por session_id (PRO)
// Útil cuando Stripe redirige con ?session_id=...
// GET /api/pagos/estado?session_id=cs_test_...
router.get('/estado', proteger, obtenerEstadoPagoPorSession);

module.exports = router;