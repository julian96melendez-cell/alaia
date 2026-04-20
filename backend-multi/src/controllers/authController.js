"use strict";

const Usuario = require("../models/Usuario");
const catchAsync = require("../utils/catchAsync");
const { success, error } = require("../utils/apiResponse");
const { validationResult } = require("express-validator");

const {
  generarTokens,
  verificarRefreshToken,
  verificarAccessToken,
  buscarUsuarioPorEmail,
  buscarUsuarioPorId,
  incrementarTokenVersion,
} = require("../services/authService");

// ======================================================
// Constantes auth / cookies
// ======================================================
const ACCESS_COOKIE_NAME =
  process.env.ACCESS_COOKIE_NAME || "alaia_access_token";

const REFRESH_COOKIE_NAME =
  process.env.REFRESH_COOKIE_NAME || "alaia_refresh_token";

const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000; // 15 min
const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

// ======================================================
// Helpers
// ======================================================
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
    sellerStatus: usuario.sellerStatus || null,
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
    safeString(req.cookies?.[REFRESH_COOKIE_NAME]) ||
    safeString(req.body?.refreshToken) ||
    ""
  );
}

function getAccessTokenFromRequest(req) {
  const authHeader = safeString(
    req.headers?.authorization || req.headers?.Authorization
  );

  if (authHeader.startsWith("Bearer ")) {
    return safeString(authHeader.slice(7));
  }

  return (
    safeString(req.cookies?.[ACCESS_COOKIE_NAME]) ||
    safeString(req.cookies?.accessToken) ||
    safeString(req.cookies?.token) ||
    ""
  );
}

function getCookieSameSite() {
  const raw = safeString(process.env.COOKIE_SAME_SITE).toLowerCase();

  if (raw === "strict") return "strict";
  if (raw === "none") return "none";
  return "lax";
}

function getCookieSecure() {
  const sameSite = getCookieSameSite();

  if (sameSite === "none") return true;
  return process.env.NODE_ENV === "production";
}

function getCookieDomain() {
  const domain = safeString(process.env.COOKIE_DOMAIN);
  return domain || undefined;
}

function getCookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure: getCookieSecure(),
    sameSite: getCookieSameSite(),
    path: "/",
    domain: getCookieDomain(),
    maxAge: maxAgeMs,
  };
}

function setAuthCookies(res, tokens) {
  res.cookie(
    ACCESS_COOKIE_NAME,
    tokens.accessToken,
    getCookieOptions(ACCESS_TOKEN_MAX_AGE_MS)
  );

  res.cookie(
    REFRESH_COOKIE_NAME,
    tokens.refreshToken,
    getCookieOptions(REFRESH_TOKEN_MAX_AGE_MS)
  );
}

function clearAuthCookies(res) {
  const baseOptions = {
    httpOnly: true,
    secure: getCookieSecure(),
    sameSite: getCookieSameSite(),
    path: "/",
    domain: getCookieDomain(),
  };

  res.clearCookie(ACCESS_COOKIE_NAME, baseOptions);
  res.clearCookie(REFRESH_COOKIE_NAME, baseOptions);
}

function getUserIdFromPayload(payload) {
  return safeString(payload?.id || payload?._id || payload?.userId);
}

async function resolveUsuarioFromRequest(req) {
  // 1) Si ya viene del middleware proteger
  const reqUsuarioId = safeString(req.usuario?._id || req.usuario?.id);
  if (reqUsuarioId) {
    return buscarUsuarioPorId(reqUsuarioId);
  }

  // 2) Si no, intentar por access token
  const accessToken = getAccessTokenFromRequest(req);
  if (accessToken) {
    try {
      const payload = verificarAccessToken(accessToken);
      const userId = getUserIdFromPayload(payload);

      if (userId) {
        return buscarUsuarioPorId(userId);
      }
    } catch (_) {
      // noop
    }
  }

  return null;
}

// ======================================================
// POST /api/auth/registrar
// ======================================================
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
    sellerStatus: null,
  });

  const tokens = generarTokens(usuario);
  setAuthCookies(res, tokens);

  return success(res, {
    statusCode: 201,
    message: "Usuario registrado correctamente",
    data: {
      usuario: pickUsuarioPublico(usuario),
    },
  });
});

// ======================================================
// POST /api/auth/login
// ======================================================
exports.login = catchAsync(async (req, res) => {
  console.log("🔥 LOGIN NUEVO VERSION FINAL");

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

  if (
    typeof usuario.estaBloqueadoTemporalmente === "function" &&
    usuario.estaBloqueadoTemporalmente()
  ) {
    return error(res, {
      statusCode: 403,
      message: "Cuenta bloqueada temporalmente",
    });
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
  setAuthCookies(res, tokens);

  return success(res, {
    message: "Inicio de sesión exitoso",
    data: {
      usuario: pickUsuarioPublico(usuario),
    },
  });
});

// ======================================================
// GET /api/auth/me
// Funciona con middleware proteger o directamente por cookie
// ======================================================
exports.me = catchAsync(async (req, res) => {
  const usuario = await resolveUsuarioFromRequest(req);

  if (!usuario) {
    clearAuthCookies(res);
    return error(res, {
      statusCode: 401,
      message: "No autenticado",
    });
  }

  if (usuario.activo === false || usuario.bloqueado === true) {
    clearAuthCookies(res);
    return cuentaNoDisponible(res);
  }

  return success(res, {
    message: "Sesión válida",
    data: {
      usuario: pickUsuarioPublico(usuario),
    },
  });
});

// ======================================================
// POST /api/auth/refresh
// ======================================================
exports.refreshToken = catchAsync(async (req, res) => {
  if (!validar(req, res)) return;

  const refreshToken = getRefreshTokenFromRequest(req);

  if (!refreshToken) {
    clearAuthCookies(res);
    return error(res, {
      statusCode: 401,
      message: "No autenticado",
    });
  }

  let payload;
  try {
    payload = verificarRefreshToken(refreshToken);
  } catch (_) {
    clearAuthCookies(res);
    return error(res, {
      statusCode: 401,
      message: "Refresh token inválido o expirado",
    });
  }

  const userId = getUserIdFromPayload(payload);

  if (!userId) {
    clearAuthCookies(res);
    return error(res, {
      statusCode: 401,
      message: "Refresh token inválido",
    });
  }

  const usuario = await buscarUsuarioPorId(userId);

  if (!usuario) {
    clearAuthCookies(res);
    return error(res, {
      statusCode: 401,
      message: "Refresh token inválido o expirado",
    });
  }

  if (usuario.activo === false || usuario.bloqueado === true) {
    clearAuthCookies(res);
    return cuentaNoDisponible(res);
  }

  if (
    typeof usuario.estaBloqueadoTemporalmente === "function" &&
    usuario.estaBloqueadoTemporalmente()
  ) {
    clearAuthCookies(res);
    return error(res, {
      statusCode: 403,
      message: "Cuenta bloqueada temporalmente",
    });
  }

  if (
    typeof payload.tokenVersion === "number" &&
    typeof usuario.tokenVersion === "number" &&
    usuario.tokenVersion !== payload.tokenVersion
  ) {
    clearAuthCookies(res);
    return error(res, {
      statusCode: 401,
      message: "Refresh token revocado",
    });
  }

  const tokens = generarTokens(usuario);
  setAuthCookies(res, tokens);

  return success(res, {
    message: "Sesión renovada correctamente",
    data: {
      usuario: pickUsuarioPublico(usuario),
    },
  });
});

// ======================================================
// POST /api/auth/logout
// Funciona con middleware proteger o por refresh cookie fallback
// ======================================================
exports.logout = catchAsync(async (req, res) => {
  let usuarioId = safeString(req.usuario?._id || req.usuario?.id);

  if (!usuarioId) {
    const accessToken = getAccessTokenFromRequest(req);

    if (accessToken) {
      try {
        const payload = verificarAccessToken(accessToken);
        usuarioId = getUserIdFromPayload(payload);
      } catch (_) {
        // noop
      }
    }
  }

  if (!usuarioId) {
    const refreshToken = getRefreshTokenFromRequest(req);

    if (refreshToken) {
      try {
        const payload = verificarRefreshToken(refreshToken);
        usuarioId = getUserIdFromPayload(payload);
      } catch (_) {
        // noop
      }
    }
  }

  if (usuarioId) {
    await incrementarTokenVersion(usuarioId);
  }

  clearAuthCookies(res);

  return success(res, {
    message: "Sesión cerrada correctamente",
  });
});