// ==========================================================
// auth.js — Middleware de Autenticación Enterprise ULTRA
// ==========================================================

const jwt = require("jsonwebtoken");
const Usuario = require("../models/Usuario");

// ==========================================================
// Helpers de respuesta estándar
// ==========================================================
const send401 = (res, message = "No autenticado") =>
  res.status(401).json({ ok: false, message });

const send403 = (res, message = "Acceso denegado") =>
  res.status(403).json({ ok: false, message });

// ==========================================================
// Helpers seguridad
// ==========================================================
const safeString = (v) =>
  typeof v === "string" && v !== "null" && v !== "undefined" ? v : null;

const getTokenFromRequest = (req) => {
  // 1. Header Authorization
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }

  // 2. Cookie segura (si decides usar cookies después)
  if (req.cookies?.accessToken) {
    return req.cookies.accessToken;
  }

  return null;
};

// ==========================================================
// MIDDLEWARE: PROTEGER
// ==========================================================
const proteger = async (req, res, next) => {
  try {
    if (!process.env.JWT_SECRET) {
      console.error("❌ JWT_SECRET faltante");
      return send401(res, "Error configuración servidor");
    }

    const token = safeString(getTokenFromRequest(req));

    if (!token) {
      return send401(res, "No autenticado");
    }

    // ======================================================
    // Verificar JWT con opciones seguras
    // ======================================================
    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ["HS256"],
      });
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return send401(res, "Token expirado");
      }
      return send401(res, "Token inválido");
    }

    if (!decoded?.id) {
      return send401(res, "Token inválido");
    }

    // ======================================================
    // Buscar usuario en BD
    // ======================================================
    const usuario = await Usuario.findById(decoded.id).select("-password");

    if (!usuario) {
      return send401(res, "Usuario no existe");
    }

    // ======================================================
    // Verificación de revocación
    // ======================================================
    if (
      typeof decoded.tokenVersion === "number" &&
      usuario.tokenVersion !== decoded.tokenVersion
    ) {
      return send401(res, "Sesión revocada");
    }

    // ======================================================
    // Verificación de bloqueo de cuenta
    // ======================================================
    if (usuario.bloqueado === true) {
      return send403(res, "Cuenta bloqueada");
    }

    // ======================================================
    // Verificación opcional de email
    // ======================================================
    if (usuario.emailVerificado === false) {
      // puedes activar esto cuando quieras
      // return send403(res, "Debes verificar tu email");
    }

    // ======================================================
    // Adjuntar usuario
    // ======================================================
    req.usuario = usuario;
    req.usuarioId = usuario._id.toString();

    next();
  } catch (err) {
    console.error("❌ Auth middleware error:", err.message);
    return send401(res);
  }
};

// ==========================================================
// MIDDLEWARE: SOLO ADMIN
// ==========================================================
const soloAdmin = (req, res, next) => {
  if (!req.usuario) {
    return send401(res);
  }

  if (req.usuario.rol !== "admin") {
    return send403(res, "Requiere rol admin");
  }

  next();
};

// ==========================================================
// MIDDLEWARE: DUEÑO O ADMIN
// ==========================================================
const duenoOAdmin = (getOwnerIdFn) => {
  return async (req, res, next) => {
    try {
      const ownerId = await getOwnerIdFn(req);

      if (!ownerId) {
        return send403(res);
      }

      if (
        req.usuario.rol === "admin" ||
        ownerId.toString() === req.usuarioId
      ) {
        return next();
      }

      return send403(res);
    } catch {
      return send403(res);
    }
  };
};

// ==========================================================
module.exports = {
  proteger,
  soloAdmin,
  duenoOAdmin,
};