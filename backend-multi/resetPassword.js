"use strict";
require("dotenv").config();
require("./src/utils/safeLogging").installSafeLogging();
const mongoose = require("mongoose");
const Usuario = require("./src/models/Usuario");

async function main() {
  const email = String(process.env.RESET_PASSWORD_EMAIL || "").trim().toLowerCase();
  const password = process.env.RESET_PASSWORD_NEW_PASSWORD;
  if (!email || !password || password.length < 8 || !process.env.MONGO_URI) {
    throw new Error("Configura MONGO_URI, RESET_PASSWORD_EMAIL y RESET_PASSWORD_NEW_PASSWORD (mínimo 8 caracteres)");
  }
  await mongoose.connect(process.env.MONGO_URI);
  const usuario = await Usuario.findOne({ email }).select("+password");
  if (!usuario) throw new Error("Usuario no encontrado");
  // Usuario's save hook hashes the plaintext once; never pre-hash here.
  usuario.password = password;
  usuario.failedLoginCount = 0;
  usuario.lockedUntil = null;
  await usuario.save();
  console.log("Contraseña actualizada correctamente");
}

main().catch(() => {
  console.error("No se pudo actualizar la contraseña; revisa configuración y usuario");
  process.exitCode = 1;
}).finally(async () => {
  await mongoose.disconnect();
});
