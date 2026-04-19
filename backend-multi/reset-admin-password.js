"use strict";

require("dotenv").config();

const mongoose = require("mongoose");
const Usuario = require("./src/models/Usuario");

async function main() {
  const email = "julian96melendez@gmail.com".toLowerCase().trim();
  const nuevaPassword = "Eduardo1996$$$";

  if (!process.env.MONGO_URI) {
    throw new Error("Falta MONGO_URI en variables de entorno");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const usuario = await Usuario.findOne({ email }).select("+password");

  if (!usuario) {
    throw new Error(`No se encontró usuario con email: ${email}`);
  }

  usuario.password = nuevaPassword;
  usuario.failedLoginCount = 0;
  usuario.lockedUntil = null;

  await usuario.save();

  console.log("✅ Contraseña actualizada correctamente para:", usuario.email);
  console.log("🔐 Nueva contraseña:", nuevaPassword);

  await mongoose.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("❌ Error reseteando contraseña:", err.message);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });