// src/routes/vendedorRoutes.js
"use strict";

const express = require("express");
const router = express.Router();

const { proteger } = require("../middleware/auth");
const {
  crearOMiVendedor,
  iniciarOnboardingStripe,
  obtenerMiVendedor,
  syncStripeStatus,
} = require("../controllers/vendedorController");

// Crear o devolver mi vendedor
router.post("/me", proteger, crearOMiVendedor);

// Obtener mi vendedor
router.get("/me", proteger, obtenerMiVendedor);

// Iniciar onboarding Stripe
router.post("/me/stripe/onboarding", proteger, iniciarOnboardingStripe);

// Sync estado Stripe (para cuando vuelves del onboarding)
router.post("/me/stripe/sync", proteger, syncStripeStatus);

module.exports = router;