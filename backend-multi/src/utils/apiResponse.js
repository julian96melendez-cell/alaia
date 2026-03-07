// src/utils/apiResponse.js

// Respuesta de éxito estándar
const success = (res, {
  data = null,
  message = 'OK',
  statusCode = 200,
  meta,
} = {}) => {
  const payload = { ok: true, message, data };
  if (meta) payload.meta = meta;
  return res.status(statusCode).json(payload);
};

// Respuesta de error estándar
const error = (res, {
  message = 'Error interno del servidor',
  statusCode = 500,
  errors,
} = {}) => {
  const payload = { ok: false, message };
  if (errors) payload.errors = errors;
  return res.status(statusCode).json(payload);
};

module.exports = {
  success,
  error,
};