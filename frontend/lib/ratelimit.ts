import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

function getEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

const redis = new Redis({
  url: getEnv("UPSTASH_REDIS_REST_URL"),
  token: getEnv("UPSTASH_REDIS_REST_TOKEN"),
});

export const loginRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "10 m"),
  analytics: true,
  prefix: "alaia:ratelimit:login",
});

export const logoutRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "10 m"),
  analytics: true,
  prefix: "alaia:ratelimit:logout",
});

export function getClientIp(headers: Headers): string {
  const xForwardedFor = headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const firstIp = xForwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  const xRealIp = headers.get("x-real-ip");
  if (xRealIp) return xRealIp.trim();

  const cfConnectingIp = headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp.trim();

  const trueClientIp = headers.get("true-client-ip");
  if (trueClientIp) return trueClientIp.trim();

  return "unknown";
}

export function getRateLimitHeaders(reset: number) {
  const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));

  return {
    "Cache-Control": "no-store",
    "Retry-After": String(retryAfter),
  };
}