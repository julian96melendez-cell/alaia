// =============================================
// authService.js — ENTERPRISE FINAL (PRODUCCIÓN)
// =============================================

"use strict";

const jwt = require("jsonwebtoken");
const Usuario = require("../models/Usuario");

// ==============================
// Configuración
// ==============================
const ACCESS_TOKEN_EXPIRE = "15m";
const REFRESH_TOKEN_EXPIRE = "7d";
const JWT_ALGORITHM = "HS256";

// ==============================
// Helpers
// ==============================
function requireEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Falta ${name} en variables de entorno`);
  }
  return String(value).trim();
}

function normalizeEmail(email) {
  if (email === null || email === undefined) return "";
  return String(email).trim().toLowerCase();
}

// ==============================
// GENERAR ACCESS + REFRESH TOKENS
// ==============================
exports.generarTokens = (usuario) => {
  if (!usuario?._id) {
    throw new Error("Usuario inválido al generar tokens");
  }

  const jwtSecret = requireEnv("JWT_SECRET");
  const jwtRefreshSecret = requireEnv("JWT_REFRESH_SECRET");

  const tokenVersion =
    typeof usuario.tokenVersion === "number" ? usuario.tokenVersion : 0;

  const payload = {
    id: usuario._id.toString(),
    rol: usuario.rol,
    tokenVersion,
  };

  const accessToken = jwt.sign(payload, jwtSecret, {
    expiresIn: ACCESS_TOKEN_EXPIRE,
    algorithm: JWT_ALGORITHM,
  });

  const refreshToken = jwt.sign(payload, jwtRefreshSecret, {
    expiresIn: REFRESH_TOKEN_EXPIRE,
    algorithm: JWT_ALGORITHM,
  });

  return { accessToken, refreshToken };
};

// ==============================
// BUSCAR USUARIO POR EMAIL
// Incluye password para login
// ==============================
exports.buscarUsuarioPorEmail = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  return Usuario.findOne({ email: normalizedEmail })
    .select("+password +tokenVersion");
};

// ==============================
// BUSCAR USUARIO POR ID
// ==============================
exports.buscarUsuarioPorId = async (id) => {
  if (!id) return null;

  return Usuario.findById(id).select("+tokenVersion");
};

// ==============================
// VERIFICAR REFRESH TOKEN
// ==============================
exports.verificarRefreshToken = (token) => {
  if (!token) {
    throw new Error("Refresh token requerido");
  }

  const jwtRefreshSecret = requireEnv("JWT_REFRESH_SECRET");

  return jwt.verify(token, jwtRefreshSecret, {
    algorithms: [JWT_ALGORITHM],
  });
};

// ==============================
// INVALIDAR REFRESH TOKENS (LOGOUT)
// ==============================
exports.incrementarTokenVersion = async (usuarioId) => {
  if (!usuarioId) return null;

  return Usuario.findByIdAndUpdate(
    usuarioId,
    { $inc: { tokenVersion: 1 } },
    { new: true }
  ).select("+tokenVersion");
};