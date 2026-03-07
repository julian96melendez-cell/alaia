// ======================================================
// api.ts — HTTP Client Enterprise (Next.js / Frontend)
// FIX DEFINITIVO:
// - Soporta backend { ok, message, data, meta }
// - Soporta backend legacy (array directo)
// - Auto refresh JWT (401 jwt expired)
// - Retry inteligente
// - Timeout seguro
// ======================================================

import { getRefreshToken, getToken, logout, setTokens } from "./auth";
import type { ApiResponse } from "./types";

/**
 * CONFIG
 */
const DEFAULT_TIMEOUT_MS = 20_000;
const RETRY_COUNT = 2;
const RETRY_BASE_DELAY_MS = 400;

/**
 * Backend URL
 */
function getBackendBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    ""
  );
}

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

function joinUrl(base: string, path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (!base) return path;
  if (base.endsWith("/") && path.startsWith("/")) return base.slice(0, -1) + path;
  if (!base.endsWith("/") && !path.startsWith("/")) return base + "/" + path;
  return base + path;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeJsonParse(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * ======================================================
 * NORMALIZADOR ENTERPRISE (FIX)
 *
 * Caso 1 (Backend enterprise):
 * { ok:true, message:"", data:[...], meta:{...} }
 *
 * Caso 2 (Backend legacy / express simple):
 * [ ... ]
 *
 * Caso 3 (Backend devuelve string/html):
 * "<!DOCTYPE html>..."
 * ======================================================
 */
function normalizeResponse<T>(
  httpOk: boolean,
  status: number,
  payload: any,
  fallbackMessage?: string
): ApiResponse<T> {
  // ✅ Caso ideal: backend enterprise
  if (payload && typeof payload === "object" && typeof payload.ok === "boolean") {
    return payload as ApiResponse<T>;
  }

  // ✅ Caso legacy: backend devuelve array u objeto sin ok
  // En este caso lo envolvemos como { ok, data }
  const message =
    (payload && typeof payload === "object" && payload.message) ||
    fallbackMessage ||
    (httpOk ? "OK" : `Error HTTP ${status}`);

  return {
    ok: httpOk,
    message,
    data: payload as T,
  };
}

/**
 * 🔥 FIX EXTRA:
 * Si el backend manda:
 * { ok:true, data:{ ok:true, data:[...] } }
 * o sea "doble envoltura", la desarmamos.
 */
function unwrapDoubleEnvelope<T>(res: ApiResponse<any>): ApiResponse<T> {
  const inner = res?.data;

  if (
    inner &&
    typeof inner === "object" &&
    typeof inner.ok === "boolean" &&
    "data" in inner
  ) {
    return {
      ok: inner.ok,
      message: inner.message || res.message,
      data: inner.data as T,
      meta: inner.meta,
    };
  }

  return res as ApiResponse<T>;
}

/**
 * Decide si reintentar
 */
function shouldRetry(err: unknown, status?: number): boolean {
  const msg = (err as any)?.message || "";
  const name = (err as any)?.name || "";

  if (name === "AbortError") return true;
  if (msg.toLowerCase().includes("network")) return true;
  if (msg.toLowerCase().includes("failed to fetch")) return true;

  if (typeof status === "number" && status >= 500) return true;
  return false;
}

/**
 * Headers estándar
 */
function buildHeaders(custom?: HeadersInit): Headers {
  const headers = new Headers(custom || {});
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const token = getToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return headers;
}

type RequestOptions = RequestInit & {
  timeoutMs?: number;
  retryCount?: number;

  autoLogoutOn401?: boolean;
  friendlyErrorMessage?: string;

  disableAutoRefresh?: boolean;
};

// ======================================================
// 🔥 AUTO REFRESH TOKEN (LOCK GLOBAL)
// ======================================================
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  try {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;

    const base = getBackendBaseUrl();
    const url = joinUrl(base, "/api/auth/refresh");

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    const text = await res.text();
    const json = text ? safeJsonParse(text) : null;

    let normalized = normalizeResponse<any>(res.ok, res.status, json ?? text);
    normalized = unwrapDoubleEnvelope<any>(normalized);

    const newAccess = normalized?.data?.tokens?.accessToken;
    const newRefresh = normalized?.data?.tokens?.refreshToken;

    if (!normalized.ok || !newAccess) return false;

    setTokens({
      accessToken: newAccess,
      refreshToken: newRefresh || refreshToken,
    });

    return true;
  } catch {
    return false;
  }
}

function isJwtExpiredMessage(msg: string) {
  const m = (msg || "").toLowerCase();
  return (
    m.includes("jwt expired") ||
    m.includes("token expired") ||
    m.includes("expirado") ||
    m.includes("no autenticado")
  );
}

// ======================================================
// Core request (sin retry)
// ======================================================
async function coreRequest<T>(
  path: string,
  opts: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const base = getBackendBaseUrl();
  const url = joinUrl(base, path);

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const autoLogoutOn401 = opts.autoLogoutOn401 ?? true;
  const disableAutoRefresh = opts.disableAutoRefresh ?? false;

  const method = (opts.method || "GET").toUpperCase();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const headers = buildHeaders(opts.headers);

  if (isDev()) console.log(`[api] ${method} ${url}`);

  try {
    const res = await fetch(url, {
      ...opts,
      method,
      headers,
      signal: controller.signal,
      cache: "no-store",
    });

    const status = res.status;

    const text = await res.text();
    const json = text ? safeJsonParse(text) : null;

    let normalized = normalizeResponse<T>(
      res.ok,
      status,
      json ?? text,
      opts.friendlyErrorMessage
    );

    // 🔥 FIX: desarmar doble envoltura si ocurre
    normalized = unwrapDoubleEnvelope<T>(normalized);

    // ======================================================
    // 🔥 401 => Intentar refresh + retry 1 vez
    // ======================================================
    if (status === 401 && !disableAutoRefresh) {
      const msg = normalized.message || "";

      if (isJwtExpiredMessage(msg)) {
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken().finally(() => {
            refreshPromise = null;
          });
        }

        const refreshed = await refreshPromise;

        if (refreshed) {
          const retryHeaders = buildHeaders(opts.headers);

          const retryRes = await fetch(url, {
            ...opts,
            method,
            headers: retryHeaders,
            signal: controller.signal,
            cache: "no-store",
          });

          const retryText = await retryRes.text();
          const retryJson = retryText ? safeJsonParse(retryText) : null;

          let retryNormalized = normalizeResponse<T>(
            retryRes.ok,
            retryRes.status,
            retryJson ?? retryText,
            opts.friendlyErrorMessage
          );

          retryNormalized = unwrapDoubleEnvelope<T>(retryNormalized);

          return retryNormalized;
        }
      }

      if (autoLogoutOn401 && getToken()) logout();

      return {
        ok: false,
        message: normalized.message || "No autenticado",
        data: normalized.data,
      };
    }

    if (status === 403) {
      return {
        ok: false,
        message: normalized.message || "No autorizado",
        data: normalized.data,
      };
    }

    return normalized;
  } catch (err: any) {
    const isAbort = err?.name === "AbortError";

    return {
      ok: false,
      message: isAbort
        ? "Timeout: el servidor tardó demasiado en responder"
        : opts.friendlyErrorMessage || err?.message || "Error de red",
      data: undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ======================================================
// Wrapper con retry/backoff
// ======================================================
async function requestWithRetry<T>(
  path: string,
  opts: RequestOptions = {}
): Promise<ApiResponse<T>> {
  let attempt = 0;

  while (true) {
    const res = await coreRequest<T>(path, opts);

    if (res.ok) return res;

    const msg = (res.message || "").toLowerCase();

    const looksLikeAuth =
      msg.includes("no autentic") ||
      msg.includes("unauthor") ||
      msg.includes("jwt") ||
      msg.includes("forbidden") ||
      msg.includes("403") ||
      msg.includes("401");

    const looksLikeNotFound =
      msg.includes("404") || msg.includes("not found") || msg.includes("no encontrado");

    const canRetry = attempt < (opts.retryCount ?? RETRY_COUNT);

    if (!canRetry || looksLikeAuth || looksLikeNotFound) {
      return res;
    }

    const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);

    if (isDev()) console.log(`[api] retry ${attempt + 1}/${opts.retryCount ?? RETRY_COUNT} in ${delay}ms`);

    await sleep(delay);
    attempt += 1;
  }
}

// ======================================================
// Public API
// ======================================================
export const api = {
  get<T>(path: string, opts?: RequestOptions) {
    return requestWithRetry<T>(path, { ...opts, method: "GET" });
  },
  post<T>(path: string, body?: any, opts?: RequestOptions) {
    return requestWithRetry<T>(path, {
      ...opts,
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },
  put<T>(path: string, body?: any, opts?: RequestOptions) {
    return requestWithRetry<T>(path, {
      ...opts,
      method: "PUT",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },
  patch<T>(path: string, body?: any, opts?: RequestOptions) {
    return requestWithRetry<T>(path, {
      ...opts,
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },
  del<T>(path: string, opts?: RequestOptions) {
    return requestWithRetry<T>(path, { ...opts, method: "DELETE" });
  },
};