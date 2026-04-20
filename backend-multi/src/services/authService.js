"use strict";

const jwt = require("jsonwebtoken");
const Usuario = require("../models/Usuario");

const ACCESS_TOKEN_EXPIRE = process.env.ACCESS_TOKEN_EXPIRE || "15m";
const REFRESH_TOKEN_EXPIRE = process.env.REFRESH_TOKEN_EXPIRE || "7d";
const JWT_ALGORITHM = "HS256";

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

function buildBasePayload(usuario) {
  if (!usuario?._id) {
    throw new Error("Usuario inválido al generar tokens");
  }

  const tokenVersion =
    typeof usuario.tokenVersion === "number" ? usuario.tokenVersion : 0;

  return {
    id: usuario._id.toString(),
    rol: usuario.rol,
    tokenVersion,
  };
}

exports.generarTokens = (usuario) => {
  const jwtSecret = requireEnv("JWT_SECRET");
  const jwtRefreshSecret = requireEnv("JWT_REFRESH_SECRET");

  const basePayload = buildBasePayload(usuario);

  const accessToken = jwt.sign(
    {
      ...basePayload,
      type: "access",
    },
    jwtSecret,
    {
      expiresIn: ACCESS_TOKEN_EXPIRE,
      algorithm: JWT_ALGORITHM,
    }
  );

  const refreshToken = jwt.sign(
    {
      ...basePayload,
      type: "refresh",
    },
    jwtRefreshSecret,
    {
      expiresIn: REFRESH_TOKEN_EXPIRE,
      algorithm: JWT_ALGORITHM,
    }
  );

  return { accessToken, refreshToken };
};

exports.buscarUsuarioPorEmail = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  return Usuario.findOne({ email: normalizedEmail })
    .select("+password +tokenVersion");
};

exports.buscarUsuarioPorId = async (id) => {
  if (!id) return null;

  return Usuario.findById(id).select("+tokenVersion");
};

exports.verificarAccessToken = (token) => {
  if (!token) {
    throw new Error("Access token requerido");
  }

  const jwtSecret = requireEnv("JWT_SECRET");

  const payload = jwt.verify(token, jwtSecret, {
    algorithms: [JWT_ALGORITHM],
  });

  if (payload?.type !== "access") {
    throw new Error("Tipo de token inválido");
  }

  return payload;
};

exports.verificarRefreshToken = (token) => {
  if (!token) {
    throw new Error("Refresh token requerido");
  }

  const jwtRefreshSecret = requireEnv("JWT_REFRESH_SECRET");

  const payload = jwt.verify(token, jwtRefreshSecret, {
    algorithms: [JWT_ALGORITHM],
  });

  if (payload?.type !== "refresh") {
    throw new Error("Tipo de token inválido");
  }

  return payload;
};

exports.incrementarTokenVersion = async (usuarioId) => {
  if (!usuarioId) return null;

  return Usuario.findByIdAndUpdate(
    usuarioId,
    { $inc: { tokenVersion: 1 } },
    { new: true }
  ).select("+tokenVersion");
};