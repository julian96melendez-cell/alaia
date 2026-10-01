"use strict";

const util = require("util");

function redactText(value) {
  let text = String(value);
  for (const [key, secret] of Object.entries(process.env)) {
    if (/SECRET|PASSWORD|PASS$|TOKEN|PRIVATE_KEY|SERVICE_ACCOUNT|MONGO.*(?:URI|URL)/i.test(key) && secret) {
      text = text.split(secret).join("[REDACTED]");
    }
  }
  return text
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, "[REDACTED]")
    .replace(/mongodb(?:\+srv)?:\/\/[^\s'"<>]+/gi, "[REDACTED MongoDB URI]")
    .replace(/\b(?:sk|rk)_(?:test|live)_[\w]+|\bwhsec_[\w]+|\b(?:pi|seti)_[\w]+_secret_[\w]+/g, "[REDACTED]")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[REDACTED token]")
    .replace(/Bearer\s+[^\s'",}]+/gi, "Bearer [REDACTED]")
    .replace(/ExponentPushToken\[[^\]]+\]|ExpoPushToken\[[^\]]+\]/g, "[REDACTED push token]")
    .replace(/((?:password|contrase[nñ]a|nuevaPassword|newPassword|idToken|accessToken|refreshToken|clientSecret|client_secret|ephemeralKeySecret|checkoutCorrelation|stripeCorrelation|private_key|authorization|cookie|token|secret)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,}&]+)/gi, "$1[REDACTED]");
}

function sanitize(value, seen = new WeakSet()) {
  if (typeof value === "string") return redactText(value);
  if (value instanceof Error) return { name: value.name, code: value.code };
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitize(item, seen));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    /password|contrase|token|secret|correlation|private.?key|service.?account|authorization|cookie|mongo.*(?:uri|url)/i.test(key)
      ? "[REDACTED]" : sanitize(item, seen),
  ]));
}

function installSafeLogging() {
  if (console.__alaiaSafeLogging) return;
  Object.defineProperty(console, "__alaiaSafeLogging", { value: true });
  for (const method of ["log", "info", "warn", "error", "debug", "dir"]) {
    const original = console[method].bind(console);
    console[method] = (...args) => original(redactText(util.format(...args.map((arg) => sanitize(arg)))));
  }
}

module.exports = { redactText, sanitize, installSafeLogging };
