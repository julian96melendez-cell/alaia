// ==========================================================
// Usuario.js — Modelo Usuario Enterprise ULTRA (Marketplace Ready)
// ==========================================================

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

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
      enum: ["ios", "android", "web"],
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
      unique: true,
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
    // 🔥 ROLES (Marketplace preparado)
    // ======================================================
    rol: {
      type: String,
      enum: ["usuario", "admin", "vendedor"],
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
    // 🔥 STRIPE CONNECT (Marketplace)
    // ======================================================
    stripeAccountId: {
      type: String,
      trim: true,
      default: null,
      index: true,
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
    },

    // 🔔 PUSH NOTIFICATIONS
    pushTokens: {
      type: [PushTokenSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// ==========================================================
// 🔐 Pre-save: normalización + hash
// ==========================================================
UsuarioSchema.pre("save", async function () {
  if (this.email) {
    this.email = this.email.toLowerCase().trim();
  }

  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

// ==========================================================
// 🔐 Comparar password
// ==========================================================
UsuarioSchema.methods.compararPassword = async function (passwordPlano) {
  if (!this.password) return false;
  return bcrypt.compare(passwordPlano, this.password);
};

// ==========================================================
// 🔐 Ocultar campos sensibles
// ==========================================================
UsuarioSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.tokenVersion;
  return obj;
};

// ==========================================================
// 👑 Helpers de roles
// ==========================================================
UsuarioSchema.methods.esAdmin = function () {
  return this.rol === "admin";
};

UsuarioSchema.methods.esVendedor = function () {
  return this.rol === "vendedor";
};

// ==========================================================
// 🔔 Añadir push token (evita duplicados)
// ==========================================================
UsuarioSchema.methods.addPushToken = function ({ token, platform }) {
  if (!token) return;

  const exists = this.pushTokens.some((t) => t.token === token);
  if (!exists) {
    this.pushTokens.push({ token, platform });
  }
};

// ==========================================================
// 🔔 Eliminar push token
// ==========================================================
UsuarioSchema.methods.removePushToken = function (token) {
  this.pushTokens = this.pushTokens.filter((t) => t.token !== token);
};

// ==========================================================
// Índices compuestos importantes
// ==========================================================
UsuarioSchema.index({ email: 1 }, { unique: true });
UsuarioSchema.index({ rol: 1, activo: 1 });
UsuarioSchema.index({ stripeAccountId: 1 });

module.exports = mongoose.model("Usuario", UsuarioSchema);