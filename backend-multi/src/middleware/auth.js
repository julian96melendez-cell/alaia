// ==========================================================
// auth.js — Middleware de Autenticación Enterprise ULTRA
// ==========================================================

"use strict";

const jwt = require("jsonwebtoken");
const Usuario = require("../models/Usuario");

// ==========================================================
// Helpers respuesta estándar
// ==========================================================
function sendError(res, status, message, reqId = null) {
  return res.status(status).json({
    ok: false,
    message,
    reqId: reqId || null,
  });
}

function send401(res, message = "No autenticado", reqId = null) {
  return sendError(res, 401, message, reqId);
}

function send403(res, message = "Acceso denegado", reqId = null) {
  return sendError(res, 403, message, reqId);
}

// ==========================================================
// Helpers seguridad
// ==========================================================
function safeString(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s === "null" || s === "undefined") return null;
  return s;
}

function getTokenFromAuthorizationHeader(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  const value = safeString(authHeader);

  if (!value) return null;
  if (!value.startsWith("Bearer ")) return null;

  const token = value.slice(7).trim();
  return safeString(token);
}

function getTokenFromCookies(req) {
  return (
    safeString(req.cookies?.accessToken) ||
    safeString(req.cookies?.token) ||
    null
  );
}

function getTokenFromRequest(req) {
  return getTokenFromAuthorizationHeader(req) || getTokenFromCookies(req);
}

function verifyJwt(token) {
  if (!process.env.JWT_SECRET) {
    const err = new Error("JWT_SECRET faltante");
    err.statusCode = 500;
    throw err;
  }

  return jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: ["HS256"],
  });
}

function isTemporaryLocked(usuario) {
  if (!usuario?.lockedUntil) return false;
  return new Date(usuario.lockedUntil).getTime() > Date.now();
}

function hasRole(usuario, allowedRoles = []) {
  if (!usuario?.rol) return false;
  return allowedRoles.includes(usuario.rol);
}

// ==========================================================
// MIDDLEWARE: PROTEGER
// ==========================================================
async function proteger(req, res, next) {
  const reqId = req.reqId || null;

  try {
    const token = getTokenFromRequest(req);

    if (!token) {
      return send401(res, "No autenticado", reqId);
    }

    let decoded;
    try {
      decoded = verifyJwt(token);
    } catch (err) {
      if (err?.name === "TokenExpiredError") {
        return send401(res, "Token expirado", reqId);
      }

      if (err?.statusCode === 500) {
        console.error("❌ Auth config error:", err.message);
        return sendError(res, 500, "Error configuración servidor", reqId);
      }

      return send401(res, "Token inválido", reqId);
    }

    const userId = safeString(decoded?.id || decoded?._id || decoded?.userId);
    if (!userId) {
      return send401(res, "Token inválido", reqId);
    }

    const usuario = await Usuario.findById(userId).select("-password");

    if (!usuario) {
      return send401(res, "Usuario no existe", reqId);
    }

    if (usuario.activo === false) {
      return send403(res, "Cuenta inactiva", reqId);
    }

    if (usuario.bloqueado === true) {
      return send403(res, "Cuenta bloqueada", reqId);
    }

    if (isTemporaryLocked(usuario)) {
      return send403(res, "Cuenta bloqueada temporalmente", reqId);
    }

    if (
      typeof decoded?.tokenVersion === "number" &&
      usuario.tokenVersion !== decoded.tokenVersion
    ) {
      return send401(res, "Sesión revocada", reqId);
    }

    req.usuario = usuario;
    req.usuarioId = String(usuario._id);
    req.auth = {
      token,
      decoded,
    };

    return next();
  } catch (err) {
    console.error("❌ Auth middleware error:", {
      reqId,
      message: err?.message,
    });

    return send401(res, "No autenticado", reqId);
  }
}

// ==========================================================
// MIDDLEWARE: REQUIERE ROLES
// ==========================================================
function requireRoles(...roles) {
  const allowedRoles = roles.flat().filter(Boolean);

  return function roleMiddleware(req, res, next) {
    const reqId = req.reqId || null;

    if (!req.usuario) {
      return send401(res, "No autenticado", reqId);
    }

    if (!allowedRoles.length) {
      return send403(res, "Acceso denegado", reqId);
    }

    if (!hasRole(req.usuario, allowedRoles)) {
      return send403(
        res,
        `Requiere rol: ${allowedRoles.join(", ")}`,
        reqId
      );
    }

    return next();
  };
}

// ==========================================================
// MIDDLEWARE: SOLO ADMIN
// ==========================================================
const soloAdmin = requireRoles("admin");

// ==========================================================
// MIDDLEWARE: SOLO VENDEDOR
// ==========================================================
const soloVendedor = requireRoles("vendedor");

// ==========================================================
// MIDDLEWARE: DUEÑO O ADMIN
// getOwnerIdFn puede ser sync o async
// ==========================================================
function duenoOAdmin(getOwnerIdFn) {
  return async function ownerOrAdminMiddleware(req, res, next) {
    const reqId = req.reqId || null;

    try {
      if (!req.usuario) {
        return send401(res, "No autenticado", reqId);
      }

      if (req.usuario.rol === "admin") {
        return next();
      }

      const ownerId = await getOwnerIdFn(req);

      if (!ownerId) {
        return send403(res, "Acceso denegado", reqId);
      }

      if (String(ownerId) === String(req.usuarioId)) {
        return next();
      }

      return send403(res, "Acceso denegado", reqId);
    } catch (err) {
      console.error("❌ duenoOAdmin error:", {
        reqId,
        message: err?.message,
      });

      return send403(res, "Acceso denegado", reqId);
    }
  };
}

// ==========================================================
// EXPORTS
// ==========================================================
module.exports = {
  proteger,
  soloAdmin,
  soloVendedor,
  requireRoles,
  duenoOAdmin,
};