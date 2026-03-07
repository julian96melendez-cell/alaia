// =============================================
// errorHandler.js – Middleware Global de Errores
// Profesional, robusto y compatible con producción
// =============================================

module.exports = (err, req, res, next) => {
  console.error("🔥 ERROR INTERNO DEL SERVIDOR:");
  console.error(err);

  // =============================================
  // 1️⃣ Errores de validación de Mongoose
  // =============================================
  if (err.name === "ValidationError") {
    const mensajes = Object.values(err.errors).map((e) => e.message);

    return res.status(400).json({
      status: "error",
      mensaje: "Error de validación",
      errores: mensajes,
    });
  }

  // =============================================
  // 2️⃣ Errores por IDs no válidos (CastError)
  // =============================================
  if (err.name === "CastError") {
    return res.status(400).json({
      status: "error",
      mensaje: "ID proporcionado no es válido",
    });
  }

  // =============================================
  // 3️⃣ Errores de JWT
  // =============================================
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      status: "error",
      mensaje: "Token inválido",
    });
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      status: "error",
      mensaje: "Token expirado",
    });
  }

  // =============================================
  // 4️⃣ Errores personalizados con statusCode
  // =============================================
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      status: "error",
      mensaje: err.message || "Error en la solicitud",
    });
  }

  // =============================================
  // 5️⃣ Error genérico para cualquier otra cosa
  // =============================================
  return res.status(500).json({
    status: "error",
    mensaje: "Error interno del servidor",
  });
};