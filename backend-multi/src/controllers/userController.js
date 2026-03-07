// ==========================================================
// userController.js — Controlador de Usuario (ENTERPRISE)
// ==========================================================

const Usuario = require("../models/Usuario");

// ==========================================================
// Guardar / actualizar push token del usuario
// ==========================================================
// POST /api/users/push-token
// 🔐 Requiere auth (proteger)
// ==========================================================
const guardarPushToken = async (req, res) => {
  try {
    const usuarioId = req.usuario._id;
    const { pushToken, device } = req.body;

    if (!pushToken) {
      return res.status(400).json({
        ok: false,
        message: "pushToken es requerido",
      });
    }

    // Actualizamos solo los campos necesarios
    await Usuario.findByIdAndUpdate(usuarioId, {
      pushToken,
      pushDevice: device || null,
    });

    return res.json({
      ok: true,
      message: "Push token guardado correctamente",
    });
  } catch (err) {
    console.error("❌ Error guardando push token:", err);

    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor",
    });
  }
};

module.exports = {
  guardarPushToken,
};