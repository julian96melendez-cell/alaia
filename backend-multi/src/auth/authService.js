// =============================================
// authService.js — Auth Enterprise (Ultra PRO)
// =============================================

const jwt = require('jsonwebtoken');
const Usuario = require('../models/Usuario');

// =============================================
// VALIDAR VARIABLES DE ENTORNO CRÍTICAS
// =============================================
if (!process.env.JWT_SECRET) {
  throw new Error("❌ FALTA JWT_SECRET en tu archivo .env");
}

if (!process.env.JWT_REFRESH_SECRET) {
  throw new Error("❌ FALTA JWT_REFRESH_SECRET en tu archivo .env");
}

// =============================================
// GENERAR ACCESS + REFRESH TOKEN
// =============================================
const generarTokens = (usuario) => {
  const payload = {
    id: usuario._id,
    email: usuario.email,
    rol: usuario.rol,
    tokenVersion: usuario.tokenVersion,
  };

  // Token corto para proteger sesiones
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  });

  // Token largo para refrescar sesiones
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: '7d',
  });

  return { accessToken, refreshToken };
};

// =============================================
// VERIFICAR REFRESH TOKEN
// =============================================
const verificarRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

// =============================================
// BUSCAR USUARIO POR EMAIL
// =============================================
const buscarUsuarioPorEmail = (email) => {
  return Usuario.findOne({ email: email.toLowerCase().trim() });
};

// =============================================
// BUSCAR USUARIO POR ID
// =============================================
const buscarUsuarioPorId = (id) => {
  return Usuario.findById(id);
};

// =============================================
// REVOKE TOKENS: incrementar tokenVersion
// =============================================
const incrementarTokenVersion = async (usuarioId) => {
  return Usuario.findByIdAndUpdate(
    usuarioId,
    { $inc: { tokenVersion: 1 } },
    { new: true }
  );
};

// =============================================
// EXPORTAMOS
// =============================================
module.exports = {
  generarTokens,
  verificarRefreshToken,
  buscarUsuarioPorEmail,
  buscarUsuarioPorId,
  incrementarTokenVersion,
};