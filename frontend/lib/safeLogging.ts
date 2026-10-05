// Keep SDK error objects and authentication/payment payloads out of mobile logs.
function redactText(value: string): string {
  return value
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, "[REDACTED]")
    .replace(/mongodb(?:\+srv)?:\/\/[^\s'"<>]+/gi, "[REDACTED MongoDB URI]")
    .replace(/\b(?:sk|rk)_(?:test|live)_[\w]+|\bwhsec_[\w]+|\b(?:pi|seti)_[\w]+_secret_[\w]+/g, "[REDACTED]")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[REDACTED token]")
    .replace(/Bearer\s+[^\s'",}]+/gi, "Bearer [REDACTED]")
    .replace(/ExponentPushToken\[[^\]]+\]|ExpoPushToken\[[^\]]+\]/g, "[REDACTED push token]")
    .replace(/((?:password|contrase[nñ]a|idToken|accessToken|refreshToken|clientSecret|client_secret|ephemeralKeySecret|private_key|authorization|cookie|token|secret)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,}&]+)/gi, "$1[REDACTED]");
}

function sanitize(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redactText(value);
  if (value instanceof Error) return { name: value.name, code: (value as Error & { code?: unknown }).code };
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitize(item, seen));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    /password|contrase|token|secret|private.?key|service.?account|authorization|cookie|mongo.*(?:uri|url)/i.test(key)
      ? "[REDACTED]" : sanitize(item, seen),
  ]));
}

export function installSafeLogging() {
  const logger = console as Console & { __alaiaSafeLogging?: boolean };
  if (logger.__alaiaSafeLogging) return;
  Object.defineProperty(logger, "__alaiaSafeLogging", { value: true });
  for (const method of ["log", "info", "warn", "error", "debug", "dir"] as const) {
    const original = logger[method].bind(logger);
    logger[method] = (...args: unknown[]) => original(...args.map((arg) => sanitize(arg)));
  }
}
