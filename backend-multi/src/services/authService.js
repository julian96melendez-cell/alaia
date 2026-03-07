// =============================================
// authService.js — ENTERPRISE FINAL (PRODUCCIÓN)
// =============================================

const jwt = require("jsonwebtoken");
const Usuario = require("../models/Usuario");

// ==============================
// Configuración de expiración
// ==============================
const ACCESS_TOKEN_EXPIRE = "15m"; // Ultra seguro
const REFRESH_TOKEN_EXPIRE = "7d"; // Estándar enterprise

// ==============================
// GENERAR ACCESS + REFRESH TOKENS
// ==============================
exports.generarTokens = (usuario) => {
  if (!usuario?._id) {
    throw new Error("Usuario inválido al generar tokens");
  }

  const tokenVersion =
    typeof usuario.tokenVersion === "number"
      ? usuario.tokenVersion
      : 0;

  const payload = {
    id: usuario._id.toString(),
    rol: usuario.rol,
    tokenVersion,
  };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRE,
  });

  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRE,
  });

  return { accessToken, refreshToken };
};

// ==============================
// BUSCAR USUARIO POR EMAIL
// 🔥 FIX CRÍTICO: incluir password
// ==============================
exports.buscarUsuarioPorEmail = async (email) => {
  if (!email) return null;

  return Usuario.findOne({ email })
    .select("+password")   // ← CLAVE PARA LOGIN
    .select("+tokenVersion");
};

// ==============================
// BUSCAR USUARIO POR ID
// ==============================
exports.buscarUsuarioPorId = async (id) => {
  if (!id) return null;

  return Usuario.findById(id)
    .select("+tokenVersion");
};

// ==============================
// VERIFICAR REFRESH TOKEN
// ==============================
exports.verificarRefreshToken = (token) => {
  if (!token) {
    throw new Error("Refresh token requerido");
  }

  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

// ==============================
// INVALIDAR REFRESH TOKENS (LOGOUT)
// ==============================
exports.incrementarTokenVersion = async (usuarioId) => {
  if (!usuarioId) return;

  const usuario = await Usuario.findById(usuarioId);
  if (!usuario) return;

  usuario.tokenVersion =
    typeof usuario.tokenVersion === "number"
      ? usuario.tokenVersion + 1
      : 1;

  await usuario.save();
};