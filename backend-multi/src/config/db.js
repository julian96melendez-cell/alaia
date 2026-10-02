"use strict";
const mongoose = require("mongoose");

async function conectarDB() {
  if (!process.env.MONGO_URI) throw new Error("Falta MONGO_URI");
  console.log("Iniciando conexión a MongoDB");
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      autoIndex: false,
      autoCreate: false,
    });
    console.log("MongoDB conectado correctamente");
  } catch {
    throw new Error("No se pudo conectar a MongoDB; revisa la configuración y disponibilidad");
  }
}
module.exports = conectarDB;
