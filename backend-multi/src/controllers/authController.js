// =============================================
// controllers/authController.js — ENTERPRISE ULTRA
// =============================================

"use strict";

const Usuario = require("../models/Usuario");
const catchAsync = require("../utils/catchAsync");
const { success, error } = require("../utils/apiResponse");
const { validationResult } = require("express-validator");

const {
  generarTokens,
  verificarRefreshToken,
  buscarUsuarioPorEmail,
  buscarUsuarioPorId,
  incrementarTokenVersion,
} = require("../services/authService");

// =============================================
// Helpers
// =============================================
function safeString(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function normalizarEmail(email) {
  return safeString(email).toLowerCase();
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  return (
    req.ip ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    ""
  );
}

function validar(req, res) {
  const errores = validationResult(req);

  if (!errores.isEmpty()) {
    error(res, {
      statusCode: 400,
      message: "Errores de validación",
      errors: errores.array().map((e) => ({
        campo: e.path || e.param,
        mensaje: e.msg,
      })),
    });
    return false;
  }

  return true;
}

function pickUsuarioPublico(usuario) {
  if (!usuario) return null;

  return {
    id: String(usuario._id),
    nombre: usuario.nombre,
    email: usuario.email,
    rol: usuario.rol,
    activo: usuario.activo,
    bloqueado: usuario.bloqueado,
    emailVerificado: usuario.emailVerificado,
    stripeAccountId: usuario.stripeAccountId || null,
    stripeOnboardingComplete: !!usuario.stripeOnboardingComplete,
    stripeChargesEnabled: !!usuario.stripeChargesEnabled,
    stripePayoutsEnabled: !!usuario.stripePayoutsEnabled,
    createdAt: usuario.createdAt,
    updatedAt: usuario.updatedAt,
  };
}

function credencialesInvalidas(res) {
  return error(res, {
    statusCode: 401,
    message: "Credenciales inválidas",
  });
}

function cuentaNoDisponible(res) {
  return error(res, {
    statusCode: 403,
    message: "Cuenta no disponible",
  });
}

function getRefreshTokenFromRequest(req) {
  return (
    safeString(req.body?.refreshToken) ||
    safeString(req.cookies?.refreshToken) ||
    ""
  );
}

// =============================================
// POST /api/auth/registrar
// =============================================
exports.registrar = catchAsync(async (req, res) => {
  if (!validar(req, res)) return;

  const nombre = safeString(req.body?.nombre);
  const email = normalizarEmail(req.body?.email);
  const password = String(req.body?.password || "");

  if (!nombre || nombre.length < 2) {
    return error(res, {
      statusCode: 400,
      message: "Nombre inválido",
    });
  }

  if (!email) {
    return error(res, {
      statusCode: 400,
      message: "Email inválido",
    });
  }

  if (!password || password.length < 8) {
    return error(res, {
      statusCode: 400,
      message: "Password inválido",
    });
  }

  const existe = await buscarUsuarioPorEmail(email);
  if (existe) {
    return error(res, {
      statusCode: 400,
      message: "No se pudo registrar con esos datos",
    });
  }

  const usuario = await Usuario.create({
    nombre,
    email,
    password,
    rol: "usuario",
    activo: true,
    bloqueado: false,
    emailVerificado: false,
  });

  const tokens = generarTokens(usuario);

  return success(res, {
    statusCode: 201,
    message: "Usuario registrado correctamente",
    data: {
      usuario: pickUsuarioPublico(usuario),
      tokens,
    },
  });
});

// =============================================
// POST /api/auth/login
// =============================================
exports.login = catchAsync(async (req, res) => {
  if (!validar(req, res)) return;

  const email = normalizarEmail(req.body?.email);
  const password = String(req.body?.password || "");
  const ip = getClientIp(req);

  if (!email || !password) {
    return credencialesInvalidas(res);
  }

  const usuario = await buscarUsuarioPorEmail(email);

  if (!usuario) {
    return credencialesInvalidas(res);
  }

  if (usuario.activo === false || usuario.bloqueado === true) {
    return cuentaNoDisponible(res);
  }

  if (typeof usuario.estaBloqueadoTemporalmente === "function") {
    if (usuario.estaBloqueadoTemporalmente()) {
      return error(res, {
        statusCode: 403,
        message: "Cuenta bloqueada temporalmente",
      });
    }
  }

  const esValida = await usuario.compararPassword(password);

  if (!esValida) {
    if (typeof usuario.registrarLoginFallido === "function") {
      usuario.registrarLoginFallido({
        maxIntentos: 5,
        bloqueoMinutos: 15,
      });
      await usuario.save();
    }

    return credencialesInvalidas(res);
  }

  if (typeof usuario.registrarLoginExitoso === "function") {
    usuario.registrarLoginExitoso(ip);
    await usuario.save();
  }

  const tokens = generarTokens(usuario);

  return success(res, {
    message: "Inicio de sesión exitoso",
    data: {
      usuario: pickUsuarioPublico(usuario),
      tokens,
    },
  });
});

// =============================================
// POST /api/auth/refresh
// =============================================
exports.refreshToken = catchAsync(async (req, res) => {
  if (!validar(req, res)) return;

  const refreshToken = getRefreshTokenFromRequest(req);

  if (!refreshToken) {
    return error(res, {
      statusCode: 400,
      message: "refreshToken es obligatorio",
    });
  }

  let payload;
  try {
    payload = verificarRefreshToken(refreshToken);
  } catch (_) {
    return error(res, {
      statusCode: 401,
      message: "Refresh token inválido o expirado",
    });
  }

  const userId = safeString(payload?.id || payload?._id || payload?.userId);

  if (!userId) {
    return error(res, {
      statusCode: 401,
      message: "Refresh token inválido",
    });
  }

  const usuario = await buscarUsuarioPorId(userId);

  if (!usuario) {
    return error(res, {
      statusCode: 401,
      message: "Refresh token inválido o expirado",
    });
  }

  if (usuario.activo === false || usuario.bloqueado === true) {
    return cuentaNoDisponible(res);
  }

  if (typeof usuario.estaBloqueadoTemporalmente === "function") {
    if (usuario.estaBloqueadoTemporalmente()) {
      return error(res, {
        statusCode: 403,
        message: "Cuenta bloqueada temporalmente",
      });
    }
  }

  if (
    typeof payload.tokenVersion === "number" &&
    typeof usuario.tokenVersion === "number" &&
    usuario.tokenVersion !== payload.tokenVersion
  ) {
    return error(res, {
      statusCode: 401,
      message: "Refresh token revocado",
    });
  }

  const tokens = generarTokens(usuario);

  return success(res, {
    message: "Tokens renovados correctamente",
    data: {
      tokens,
    },
  });
});

// =============================================
// POST /api/auth/logout
// =============================================
exports.logout = catchAsync(async (req, res) => {
  const usuarioId = req.usuario?._id?.toString?.() || req.usuario?.id;

  if (!usuarioId) {
    return error(res, {
      statusCode: 401,
      message: "No autenticado",
    });
  }

  await incrementarTokenVersion(usuarioId);

  return success(res, {
    message: "Sesión cerrada correctamente",
  });
});