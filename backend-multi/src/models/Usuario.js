// ==========================================================
// Usuario.js — Modelo Usuario Enterprise ULTRA (Marketplace Ready)
// ==========================================================

"use strict";

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// ==========================================================
// Constantes
// ==========================================================
const ROLES = ["usuario", "admin", "vendedor"];
const PUSH_PLATFORMS = ["ios", "android", "web"];

function safeStr(v, fallback = "") {
  if (v === null || v === undefined) return fallback;
  return String(v).trim();
}

function normalizeEmail(email) {
  return safeStr(email).toLowerCase();
}

function uniqPushTokens(tokens = []) {
  const seen = new Set();
  const out = [];

  for (const item of tokens) {
    const token = safeStr(item?.token);
    const platform = safeStr(item?.platform);

    if (!token) continue;
    if (!PUSH_PLATFORMS.includes(platform)) continue;
    if (seen.has(token)) continue;

    seen.add(token);
    out.push({
      token,
      platform,
      createdAt: item?.createdAt || new Date(),
    });
  }

  return out;
}

// ==========================================================
// Subschema Push Tokens
// ==========================================================
const PushTokenSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      trim: true,
    },
    platform: {
      type: String,
      enum: PUSH_PLATFORMS,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

// ==========================================================
// Usuario Schema
// ==========================================================
const UsuarioSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },

    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },

    // ======================================================
    // ROLES
    // ======================================================
    rol: {
      type: String,
      enum: ROLES,
      default: "usuario",
      index: true,
    },

    activo: {
      type: Boolean,
      default: true,
      index: true,
    },

    bloqueado: {
      type: Boolean,
      default: false,
      index: true,
    },

    emailVerificado: {
      type: Boolean,
      default: false,
      index: true,
    },

    tokenVersion: {
      type: Number,
      default: 0,
    },

    // ======================================================
    // SEGURIDAD / AUDITORÍA
    // ======================================================
    ultimoLoginAt: {
      type: Date,
      default: null,
      index: true,
    },

    ultimoLoginIp: {
      type: String,
      default: "",
      trim: true,
    },

    failedLoginCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    lockedUntil: {
      type: Date,
      default: null,
      index: true,
    },

    passwordChangedAt: {
      type: Date,
      default: null,
      index: true,
    },

    // ======================================================
    // STRIPE CONNECT (Marketplace)
    // ======================================================
    stripeAccountId: {
      type: String,
      trim: true,
      default: null,
      index: true,
      sparse: true,
    },

    stripeOnboardingComplete: {
      type: Boolean,
      default: false,
      index: true,
    },

    stripeChargesEnabled: {
      type: Boolean,
      default: false,
      index: true,
    },

    stripePayoutsEnabled: {
      type: Boolean,
      default: false,
      index: true,
    },

    // ======================================================
    // PUSH NOTIFICATIONS
    // ======================================================
    pushTokens: {
      type: [PushTokenSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: "__v",
    optimisticConcurrency: true,
  }
);

// ==========================================================
// Pre-validate: normalización
// ==========================================================
UsuarioSchema.pre("validate", function () {
  this.nombre = safeStr(this.nombre);
  this.email = normalizeEmail(this.email);

  if (!ROLES.includes(this.rol)) {
    this.rol = "usuario";
  }

  this.ultimoLoginIp = safeStr(this.ultimoLoginIp);
  this.pushTokens = uniqPushTokens(this.pushTokens);
});

// ==========================================================
// Pre-save: hash password
// ==========================================================
UsuarioSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  this.passwordChangedAt = new Date();
});

// ==========================================================
// Comparar password
// ==========================================================
UsuarioSchema.methods.compararPassword = async function (passwordPlano) {
  if (!this.password) return false;
  return bcrypt.compare(passwordPlano, this.password);
};

// ==========================================================
// Estado de bloqueo
// ==========================================================
UsuarioSchema.methods.estaBloqueadoTemporalmente = function () {
  if (!this.lockedUntil) return false;
  return new Date(this.lockedUntil).getTime() > Date.now();
};

// ==========================================================
// Registrar login exitoso
// ==========================================================
UsuarioSchema.methods.registrarLoginExitoso = function (ip = "") {
  this.ultimoLoginAt = new Date();
  this.ultimoLoginIp = safeStr(ip);
  this.failedLoginCount = 0;
  this.lockedUntil = null;
};

// ==========================================================
// Registrar login fallido
// ==========================================================
UsuarioSchema.methods.registrarLoginFallido = function ({
  maxIntentos = 5,
  bloqueoMinutos = 15,
} = {}) {
  this.failedLoginCount = Number(this.failedLoginCount || 0) + 1;

  if (this.failedLoginCount >= maxIntentos) {
    const lockedUntil = new Date();
    lockedUntil.setMinutes(lockedUntil.getMinutes() + bloqueoMinutos);
    this.lockedUntil = lockedUntil;
  }
};

// ==========================================================
// Ocultar campos sensibles
// ==========================================================
UsuarioSchema.methods.toJSON = function () {
  const obj = this.toObject();

  delete obj.password;
  delete obj.tokenVersion;
  delete obj.failedLoginCount;
  delete obj.lockedUntil;

  return obj;
};

// ==========================================================
// Helpers de roles
// ==========================================================
UsuarioSchema.methods.esAdmin = function () {
  return this.rol === "admin";
};

UsuarioSchema.methods.esVendedor = function () {
  return this.rol === "vendedor";
};

UsuarioSchema.methods.esUsuario = function () {
  return this.rol === "usuario";
};

// ==========================================================
// Push tokens
// ==========================================================
UsuarioSchema.methods.addPushToken = function ({ token, platform }) {
  const cleanToken = safeStr(token);
  const cleanPlatform = safeStr(platform);

  if (!cleanToken) return false;
  if (!PUSH_PLATFORMS.includes(cleanPlatform)) return false;

  const exists = this.pushTokens.some((t) => t.token === cleanToken);
  if (exists) return false;

  this.pushTokens.push({
    token: cleanToken,
    platform: cleanPlatform,
    createdAt: new Date(),
  });

  return true;
};

UsuarioSchema.methods.removePushToken = function (token) {
  const cleanToken = safeStr(token);
  const before = this.pushTokens.length;
  this.pushTokens = this.pushTokens.filter((t) => t.token !== cleanToken);
  return this.pushTokens.length !== before;
};

// ==========================================================
// Índices
// ==========================================================
UsuarioSchema.index({ email: 1 }, { unique: true });
UsuarioSchema.index({ rol: 1, activo: 1 });
UsuarioSchema.index({ stripeAccountId: 1 }, { sparse: true });
UsuarioSchema.index({ createdAt: -1 });
UsuarioSchema.index({ ultimoLoginAt: -1 });

module.exports = mongoose.model("Usuario", UsuarioSchema);