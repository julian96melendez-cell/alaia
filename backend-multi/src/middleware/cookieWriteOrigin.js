"use strict";
const { getAllowedOrigins } = require("../config/cors");
const WRITES = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Credential selection stays with the caller: a Bearer header must not exempt
// refresh, which preferentially consumes the refresh cookie.
function allowCookieWrite(req, res, usesCookie, env = process.env) {
  if (!usesCookie || !WRITES.has(req.method)) return true;
  const origin = req.headers?.origin;
  if (typeof origin === "string" && getAllowedOrigins(env).has(origin)) return true;
  res.status(403).json({ ok: false, code: "COOKIE_WRITE_ORIGIN_FORBIDDEN", message: "Origen no permitido" });
  return false;
}

function protectRefreshCookie(req, res, next) {
  const name = process.env.REFRESH_COOKIE_NAME || "alaia_refresh_token";
  const cookie = req.cookies?.[name];
  const usesCookie = typeof cookie === "string" && cookie.trim().length > 0;
  if (allowCookieWrite(req, res, usesCookie)) next();
}

module.exports = { allowCookieWrite, protectRefreshCookie };
