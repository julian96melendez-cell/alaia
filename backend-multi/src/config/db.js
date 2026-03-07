// ========================================================
// db.js — Conexión PRO a MongoDB con Debug detallado
// ========================================================

const mongoose = require('mongoose');

const conectarDB = async () => {
  try {
    console.log('===========================================');
    console.log('🔍 Iniciando conexión a MongoDB...');
    console.log('🔑 MONGO_URI leído del .env:');
    console.log(process.env.MONGO_URI || '❌ NO SE ENCONTRÓ MONGO_URI');
    console.log('===========================================');

    if (!process.env.MONGO_URI) {
      throw new Error('❌ ERROR: No existe MONGO_URI en el archivo .env');
    }

    // Conectar a MongoDB
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log('🔥 MongoDB conectado correctamente');
    console.log('-------------------------------------------');
    console.log('📡 Servidor:', conn.connection.host);
    console.log('📂 Base de datos:', conn.connection.name);
    console.log('🆔 ID de conexión:', conn.connection.id);
    console.log('-------------------------------------------');
    console.log('');
  } catch (error) {
    console.error('❌ ERROR al conectar con MongoDB:');
    console.error(error.message);
    console.log('-------------------------------------------');
    process.exit(1);
  }
};

module.exports = conectarDB;