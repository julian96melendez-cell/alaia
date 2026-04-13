// src/utils/apiResponse.js

"use strict";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function buildBasePayload(ok, message) {
  return {
    ok,
    message: typeof message === "string" && message.trim()
      ? message.trim()
      : ok
      ? "OK"
      : "Error interno del servidor",
  };
}

// =============================================
// Respuesta de éxito estándar
// =============================================
function success(
  res,
  {
    data,
    message = "OK",
    statusCode = 200,
    meta,
    reqId,
  } = {}
) {
  const payload = buildBasePayload(true, message);

  if (data !== undefined) {
    payload.data = data;
  }

  if (meta !== undefined && meta !== null) {
    payload.meta = meta;
  }

  if (reqId) {
    payload.reqId = reqId;
  }

  return res.status(statusCode).json(payload);
}

// =============================================
// Respuesta de error estándar
// =============================================
function error(
  res,
  {
    message = "Error interno del servidor",
    statusCode = 500,
    errors,
    details,
    meta,
    reqId,
  } = {}
) {
  const payload = buildBasePayload(false, message);

  if (errors !== undefined) {
    payload.errors = errors;
  }

  if (details !== undefined) {
    payload.details = details;
  }

  if (meta !== undefined && meta !== null) {
    payload.meta = meta;
  }

  if (reqId) {
    payload.reqId = reqId;
  }

  return res.status(statusCode).json(payload);
}

module.exports = {
  success,
  error,
};