// =============================================
// controllers/authController.js — ENTERPRISE ULTRA (COPY/PASTE)
// =============================================

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

// ---------------------------------------------
// Helpers
// ---------------------------------------------
const mapRolFrontend = (rol) => {
  if (!rol) return "user";
  if (rol === "usuario") return "user";
  return rol;
};

const normalizarEmail = (email) => {
  if (email === null || email === undefined) return "";
  return String(email).trim().toLowerCase();
};

const validar = (req, res) => {
  const errores = validationResult(req);

  if (!errores.isEmpty()) {
    error(res, {
      statusCode: 400,
      message: "Errores de validación",
      errors: errores.array().map((e) => ({
        campo: e.param,
        mensaje: e.msg,
      })),
    });
    return false;
  }

  return true;
};

const pickUsuarioPublico = (usuario) => {
  if (!usuario) return null;

  return {
    id: String(usuario._id),
    nombre: usuario.nombre,
    email: usuario.email,
    rol: mapRolFrontend(usuario.rol),
  };
};

// Mensaje único para no permitir “enumeración”
const credencialesInvalidas = (res) =>
  error(res, { statusCode: 401, message: "Credenciales inválidas" });

// Comprueba flags de cuenta
const cuentaNoDisponible = (res) =>
  error(res, { statusCode: 403, message: "Cuenta no disponible" });

// =============================================
// POST /api/auth/registrar
// =============================================
exports.registrar = catchAsync(async (req, res) => {
  if (!validar(req, res)) return;

  const nombre = String(req.body?.nombre || "").trim();
  const email = normalizarEmail(req.body?.email);
  const password = String(req.body?.password || "");

  // Validaciones defensivas (aunque uses express-validator)
  if (!nombre || nombre.length < 2) {
    return error(res, { statusCode: 400, message: "Nombre inválido" });
  }
  if (!email) {
    return error(res, { statusCode: 400, message: "Email inválido" });
  }
  if (!password || password.length < 8) {
    return error(res, { statusCode: 400, message: "Password inválido" });
  }

  // 1) Validar existencia (sin filtrar datos)
  const existe = await buscarUsuarioPorEmail(email);
  if (existe) {
    // Mensaje genérico para no confirmar si existe o no (seguridad)
    return error(res, {
      statusCode: 400,
      message: "No se pudo registrar con esos datos",
    });
  }

  // 2) Crear usuario
  const usuario = await Usuario.create({
    nombre,
    email,
    password,
    rol: "usuario",
  });

  // 3) Generar tokens
  const tokens = generarTokens(usuario);

  // 4) Respuesta
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

  if (!email || !password) return credencialesInvalidas(res);

  // 1) Buscar usuario
  // IMPORTANTE: si tu schema tiene password select:false,
  // tu authService.buscarUsuarioPorEmail debe hacer .select("+password")
  const usuario = await buscarUsuarioPorEmail(email);

  if (!usuario) return credencialesInvalidas(res);

  // 1.1) Cuenta activa/bloqueada (si tienes esos campos)
  if (usuario.activo === false || usuario.bloqueado === true) {
    return cuentaNoDisponible(res);
  }

  // 2) Validar password
  const esValida = await usuario.compararPassword(password);
  if (!esValida) return credencialesInvalidas(res);

  // 3) Tokens
  const tokens = generarTokens(usuario);

  // 4) Respuesta
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

  const refreshToken = String(req.body?.refreshToken || "").trim();

  if (!refreshToken) {
    return error(res, {
      statusCode: 400,
      message: "refreshToken es obligatorio",
    });
  }

  // 1) Validar refresh token
  let payload;
  try {
    payload = verificarRefreshToken(refreshToken);
  } catch (_) {
    return error(res, {
      statusCode: 401,
      message: "Refresh token inválido o expirado",
    });
  }

  if (!payload?.id) {
    return error(res, { statusCode: 401, message: "Refresh token inválido" });
  }

  // 2) Buscar usuario
  const usuario = await buscarUsuarioPorId(payload.id);
  if (!usuario) {
    return error(res, {
      statusCode: 401,
      message: "Refresh token inválido o expirado",
    });
  }

  // 2.1) Cuenta activa/bloqueada
  if (usuario.activo === false || usuario.bloqueado === true) {
    return cuentaNoDisponible(res);
  }

  // 3) Revocación por tokenVersion
  if (
    typeof payload.tokenVersion === "number" &&
    typeof usuario.tokenVersion === "number" &&
    usuario.tokenVersion !== payload.tokenVersion
  ) {
    return error(res, { statusCode: 401, message: "Refresh token revocado" });
  }

  // 4) Generar nuevos tokens
  const tokens = generarTokens(usuario);

  return success(res, {
    message: "Tokens renovados correctamente",
    data: { tokens },
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

  // Revoca refresh tokens incrementando tokenVersion
  await incrementarTokenVersion(usuarioId);

  return success(res, {
    message: "Sesión cerrada correctamente",
  });
});