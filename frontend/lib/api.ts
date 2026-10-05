import { apiUrl } from "./backend";
import { logout } from "./auth";
import type { ApiResponse } from "./types";

type Result<T> = ApiResponse<T> & { status?: number; code?: string };
type RequestOptions = RequestInit & {
  timeoutMs?: number;
  retryCount?: number;
  autoLogoutOn401?: boolean;
  friendlyErrorMessage?: string;
  disableAutoRefresh?: boolean;
};
const DEFAULT_TIMEOUT_MS = 20_000;
const RETRY_COUNT = 2;
function isBodyFormData(body: unknown): body is FormData {
  return typeof FormData !== "undefined" && body instanceof FormData;
}
function normalize<T>(status: number, payload: unknown): Result<T> {
  const value = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const inner = value.data && typeof value.data === "object" ? value.data as Record<string, unknown> : null;
  const envelope = inner && typeof inner.ok === "boolean" && "data" in inner ? inner : value;
  const ok = status >= 200 && status < 300 && envelope.ok !== false;
  const code = typeof envelope.code === "string" ? envelope.code : undefined;
  const fixedMessage = status === 401 ? "No autenticado" : status === 403 ? "Acceso denegado" :
    status === 410 ? "Función temporalmente no disponible" :
    status === 503 && code === "FINANCIAL_OPERATIONS_DISABLED" ? "Operaciones financieras temporalmente no disponibles" : null;
  return {
    ...envelope,
    ok,
    status,
    code,
    message: fixedMessage || (typeof envelope.message === "string" ? envelope.message : `HTTP ${status}`),
    data: ("data" in envelope ? envelope.data : payload) as T,
  } as Result<T>;
}
async function send<T>(path: string, opts: RequestOptions): Promise<Result<T>> {
  const { timeoutMs, retryCount, autoLogoutOn401, friendlyErrorMessage, disableAutoRefresh, ...request } = opts;
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal?.addEventListener("abort", abort, { once: true });
  if (request.signal?.aborted) abort();
  const timeout = setTimeout(abort, timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const headers = new Headers(request.headers);
    if (request.body != null && !isBodyFormData(request.body) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(apiUrl(path), { ...request, headers, credentials: "include", cache: "no-store", signal: controller.signal });
    const payload = await response.json().catch(() => null);
    return normalize<T>(response.status, payload);
  } catch {
    return { ok: false, status: 0, message: controller.signal.aborted ? "Solicitud interrumpida o tiempo agotado" : "Error de red" };
  } finally {
    clearTimeout(timeout);
    request.signal?.removeEventListener("abort", abort);
  }
}
let refreshPromise: Promise<boolean> | null = null;
async function requestWithRetry<T>(path: string, opts: RequestOptions = {}): Promise<Result<T>> {
  const method = (opts.method || "GET").toUpperCase();
  const readOnly = method === "GET" || method === "HEAD";
  let refreshed = false;
  let attempt = 0;
  while (true) {
    const result = await send<T>(path, opts);
    if (opts.signal?.aborted) return result;
    if (result.status === 401 && readOnly && !opts.disableAutoRefresh && !refreshed) {
      refreshed = true;
      if (!refreshPromise) {
        refreshPromise = send<unknown>("/api/auth/refresh", { method: "POST", retryCount: 0 })
          .then(response => response.ok).finally(() => { refreshPromise = null; });
      }
      if (await refreshPromise) continue;
    }
    if (result.status === 401 && opts.autoLogoutOn401 !== false) {
      await logout({ silent: true, redirect: false });
    }
    // Un 403 nunca es una señal de sesión inválida. Las escrituras nunca se repiten.
    const retryable = result.status === 0 || [502, 503, 504].includes(result.status || 0);
    if (!readOnly || !retryable || result.code === "FINANCIAL_OPERATIONS_DISABLED" ||
        attempt >= (opts.retryCount ?? RETRY_COUNT)) return result;
    await new Promise(resolve => setTimeout(resolve, 400 * 2 ** attempt++));
  }
}

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