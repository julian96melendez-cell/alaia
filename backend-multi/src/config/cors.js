"use strict";

function getAllowedOrigins(env = process.env) {
  const entries = String(env.CORS_ALLOWED_ORIGINS || env.CLIENT_URL || "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  return new Set(entries.map((value) => {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== value || url.hostname.includes("*") || url.username || url.password) {
      throw new Error("CORS: configura solamente orígenes HTTP(S) explícitos, sin rutas ni credenciales");
    }
    return value;
  }));
}

function createOriginValidator(allowedOrigins) {
  return (origin, callback) => {
    // Native clients and server-to-server requests may legitimately omit Origin.
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    const error = new Error("Origin no permitido por CORS");
    error.statusCode = 403;
    return callback(error);
  };
}

module.exports = { getAllowedOrigins, createOriginValidator };
