// src/models/Vendedor.js
"use strict";

const mongoose = require("mongoose");

/**
 * Vendedor.js — Marketplace Híbrido (Stripe Connect Ready) — ULTRA SECURE
 * -----------------------------------------------------------------------
 * ✔ Compatible con tu sistema actual
 * ✔ Blindaje antifraude payouts
 * ✔ Validaciones KYC reales
 * ✔ Bloqueo automático si Stripe no está listo
 * ✔ Comisión por vendedor opcional
 */

const VENDEDOR_ESTADOS = Object.freeze([
  "pendiente",
  "verificando",
  "activo",
  "suspendido",
]);

const VendedorSchema = new mongoose.Schema(
  {
    usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
      unique: true,
      index: true,
    },

    esPropietarioPlataforma: { type: Boolean, default: false, index: true },

    // ================================
    // STRIPE CONNECT
    // ================================
    stripeAccountId: { type: String, default: "", trim: true, index: true },

    stripeAccountType: {
      type: String,
      enum: ["express", "standard"],
      default: "express",
      index: true,
    },

    // Estado interno
    estado: {
      type: String,
      enum: VENDEDOR_ESTADOS,
      default: "pendiente",
      index: true,
    },

    // Stripe capabilities
    chargesEnabled: { type: Boolean, default: false, index: true },
    payoutsEnabled: { type: Boolean, default: false, index: true },
    detailsSubmitted: { type: Boolean, default: false, index: true },

    // Comisión personalizada
    comisionPorcentaje: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },

    // Datos públicos
    tiendaNombre: { type: String, default: "", trim: true, index: true },
    tiendaSlug: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
      index: true,
    },
    telefono: { type: String, default: "", trim: true },
    pais: { type: String, default: "", trim: true },

    // Seguridad
    puedeVender: { type: Boolean, default: true, index: true },
    puedeRetirar: { type: Boolean, default: true, index: true },

    // Auditoría
    ultimoPayoutAt: { type: Date, default: null, index: true },
    ultimoErrorPayout: { type: String, default: "" },

    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, versionKey: "__v" }
);

// ======================================================
// INDEXES
// ======================================================
VendedorSchema.index({ tiendaNombre: "text", tiendaSlug: "text" });
// Activa esta línea solo si cada tienda debe tener slug único real:
// VendedorSchema.index({ tiendaSlug: 1 }, { unique: true, sparse: true });

// ======================================================
// HELPERS DE SEGURIDAD
// ======================================================
VendedorSchema.methods.estaActivoParaVentas = function () {
  if (!this.puedeVender) return false;
  if (this.estado !== "activo") return false;
  if (!this.stripeAccountId) return false;
  if (!this.chargesEnabled) return false;
  if (!this.detailsSubmitted) return false;
  return true;
};

VendedorSchema.methods.puedeRecibirPayout = function () {
  if (!this.puedeRetirar) return false;
  if (this.estado !== "activo") return false;
  if (!this.stripeAccountId) return false;
  if (!this.payoutsEnabled) return false;
  if (!this.detailsSubmitted) return false;
  return true;
};

// ======================================================
// HARDENING AUTOMÁTICO
// ======================================================
VendedorSchema.pre("save", function (next) {
  if (!this.stripeAccountId) {
    this.chargesEnabled = false;
    this.payoutsEnabled = false;

    if (this.estado !== "suspendido") {
      this.estado = "pendiente";
    }
  }

  if (!this.detailsSubmitted) {
    this.chargesEnabled = false;
    this.payoutsEnabled = false;

    if (this.estado === "activo") {
      this.estado = "verificando";
    }
  }

  if (this.estado === "suspendido") {
    this.puedeVender = false;
    this.puedeRetirar = false;
  }

  next();
});

module.exports = mongoose.model("Vendedor", VendedorSchema);