// ======================================================
// api.ts — HTTP Client Enterprise (Cookie-Based Auth)
// ======================================================
//
// Diseño final:
// - Basado en cookies HTTP-only
// - Siempre usa credentials: "include"
// - Soporta backend { ok, message, data, meta }
// - Soporta payload legacy
// - Auto refresh en 401 si la sesión puede renovarse
// - Retry inteligente
// - Timeout seguro
// - Sin tokens en localStorage / JS
// ======================================================

import { logout } from "./auth";
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
  ).trim();
}

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

function joinUrl(base: string, path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (!base) return path;

  const cleanBase = base.replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  return `${cleanBase}${cleanPath}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJsonParse(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Normalizador de respuestas
 */
function normalizeResponse<T>(
  httpOk: boolean,
  status: number,
  payload: any,
  fallbackMessage?: string
): ApiResponse<T> {
  if (payload && typeof payload === "object" && typeof payload.ok === "boolean") {
    return payload as ApiResponse<T>;
  }

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
 * Si el backend accidentalmente devuelve doble envoltura:
 * { ok:true, data:{ ok:true, data:... } }
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
      errors: inner.errors,
    };
  }

  return res as ApiResponse<T>;
}

/**
 * Decide si reintentar
 */
function shouldRetryMessage(message: string): boolean {
  const msg = (message || "").toLowerCase();

  return (
    msg.includes("network") ||
    msg.includes("failed to fetch") ||
    msg.includes("timeout") ||
    msg.includes("fetch") ||
    msg.includes("temporarily unavailable") ||
    msg.includes("temporarily") ||
    msg.includes("servidor") ||
    msg.includes("error de red")
  );
}

function isBodyFormData(body: unknown): body is FormData {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

/**
 * Headers estándar
 * Nota: no añadimos Authorization porque la auth vive en cookies HTTP-only
 */
function buildHeaders(custom?: HeadersInit, body?: BodyInit | null): Headers {
  const headers = new Headers(custom || {});

  // No forzar Content-Type en FormData.
  // El navegador lo define con boundary automáticamente.
  if (!isBodyFormData(body) && body !== undefined && body !== null) {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
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
// AUTO REFRESH (cookie-based)
// ======================================================
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  try {
    const base = getBackendBaseUrl();
    const url = joinUrl(base, "/api/auth/refresh");

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      cache: "no-store",
    });

    const text = await res.text();
    const json = text ? safeJsonParse(text) : null;

    let normalized = normalizeResponse<any>(res.ok, res.status, json ?? text);
    normalized = unwrapDoubleEnvelope<any>(normalized);

    return !!normalized.ok;
  } catch {
    return false;
  }
}

function looksLikeAuthError(status: number, message: string): boolean {
  const msg = (message || "").toLowerCase();

  if (status === 401 || status === 403) return true;

  return (
    msg.includes("no autentic") ||
    msg.includes("unauthorized") ||
    msg.includes("unauthorised") ||
    msg.includes("token inválido") ||
    msg.includes("token invalido") ||
    msg.includes("token expirado") ||
    msg.includes("expirado") ||
    msg.includes("sesión revocada") ||
    msg.includes("sesion revocada") ||
    msg.includes("no autorizado")
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
  const requestBody = opts.body;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const headers = buildHeaders(opts.headers, requestBody);

  if (isDev()) {
    console.log(`[api] ${method} ${url}`);
  }

  try {
    const res = await fetch(url, {
      ...opts,
      method,
      headers,
      body: requestBody,
      signal: controller.signal,
      cache: "no-store",
      credentials: "include",
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

    normalized = unwrapDoubleEnvelope<T>(normalized);

    // ======================================================
    // 401 => Intentar refresh + retry 1 vez
    // ======================================================
    if (status === 401 && !disableAutoRefresh) {
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }

      const refreshed = await refreshPromise;

      if (refreshed) {
        const retryHeaders = buildHeaders(opts.headers, requestBody);

        const retryRes = await fetch(url, {
          ...opts,
          method,
          headers: retryHeaders,
          body: requestBody,
          signal: controller.signal,
          cache: "no-store",
          credentials: "include",
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

        if (
          !retryNormalized.ok &&
          looksLikeAuthError(retryRes.status, retryNormalized.message || "") &&
          autoLogoutOn401
        ) {
          await logout({ silent: true, redirect: false });
        }

        return retryNormalized;
      }

      if (autoLogoutOn401) {
        await logout({ silent: true, redirect: false });
      }

      return {
        ok: false,
        message: normalized.message || "No autenticado",
        data: normalized.data,
        meta: normalized.meta,
        errors: normalized.errors,
      };
    }

    if (!normalized.ok && looksLikeAuthError(status, normalized.message || "")) {
      if (autoLogoutOn401) {
        await logout({ silent: true, redirect: false });
      }
    }

    if (status === 403) {
      return {
        ok: false,
        message: normalized.message || "No autorizado",
        data: normalized.data,
        meta: normalized.meta,
        errors: normalized.errors,
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
      msg.includes("forbidden") ||
      msg.includes("403") ||
      msg.includes("401") ||
      msg.includes("token") ||
      msg.includes("no autorizado");

    const looksLikeNotFound =
      msg.includes("404") ||
      msg.includes("not found") ||
      msg.includes("no encontrado");

    const canRetry = attempt < (opts.retryCount ?? RETRY_COUNT);
    const retryableMessage = shouldRetryMessage(res.message || "");

    if (!canRetry || looksLikeAuth || looksLikeNotFound || !retryableMessage) {
      return res;
    }

    const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);

    if (isDev()) {
      console.log(
        `[api] retry ${attempt + 1}/${opts.retryCount ?? RETRY_COUNT} in ${delay}ms`
      );
    }

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
      body: isBodyFormData(body)
        ? body
        : body !== undefined
        ? JSON.stringify(body)
        : undefined,
    });
  },

  put<T>(path: string, body?: any, opts?: RequestOptions) {
    return requestWithRetry<T>(path, {
      ...opts,
      method: "PUT",
      body: isBodyFormData(body)
        ? body
        : body !== undefined
        ? JSON.stringify(body)
        : undefined,
    });
  },

  patch<T>(path: string, body?: any, opts?: RequestOptions) {
    return requestWithRetry<T>(path, {
      ...opts,
      method: "PATCH",
      body: isBodyFormData(body)
        ? body
        : body !== undefined
        ? JSON.stringify(body)
        : undefined,
    });
  },

  del<T>(path: string, opts?: RequestOptions) {
    return requestWithRetry<T>(path, { ...opts, method: "DELETE" });
  },
};