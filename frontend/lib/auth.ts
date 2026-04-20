// ======================================================
// auth.ts — Frontend Auth Helper (Cookie-Based)
// ======================================================
//
// Diseño final:
// - Sin tokens en localStorage
// - Sin accessToken / refreshToken en JS
// - Estado de sesión basado en cookies HTTP-only + /api/auth/me
// - Sync entre pestañas usando localStorage solo para eventos
// - SSR safe
// - Logout robusto para producción
// ======================================================

type Listener = () => void;

const listeners = new Set<Listener>();

// Claves de sincronización, NO sensibles
const AUTH_EVENT_KEY = "auth:event";
const CURRENT_USER_KEY = "currentUser";

type AuthEventType = "login" | "logout" | "session-refresh";

// ======================================================
// HELPERS
// ======================================================
function isBrowser() {
  return typeof window !== "undefined";
}

function emit() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (err) {
      console.error("auth listener error:", err);
    }
  });
}

function getApiBaseUrl(custom?: string) {
  return (
    custom ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    ""
  ).trim();
}

function buildApiUrl(path: string, customBaseUrl?: string) {
  const base = getApiBaseUrl(customBaseUrl);

  if (!base) return path;

  const normalizedBase = base.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${normalizedBase}${normalizedPath}`;
}

function broadcastAuthEvent(type: AuthEventType) {
  if (!isBrowser()) return;

  try {
    localStorage.setItem(
      AUTH_EVENT_KEY,
      JSON.stringify({
        type,
        ts: Date.now(),
      })
    );
  } catch {
    // noop
  }
}

function clearLocalSessionState() {
  if (!isBrowser()) return;

  try {
    localStorage.removeItem(CURRENT_USER_KEY);
  } catch {
    // noop
  }
}

function writeCurrentUser(user: unknown) {
  if (!isBrowser()) return;

  try {
    if (user === null || user === undefined) {
      localStorage.removeItem(CURRENT_USER_KEY);
    } else {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    }
  } catch {
    // noop
  }
}

// ======================================================
// INIT
// ======================================================
if (isBrowser()) {
  window.addEventListener("storage", (e) => {
    if (e.key === AUTH_EVENT_KEY || e.key === CURRENT_USER_KEY) {
      emit();
    }
  });
}

// ======================================================
// USER CACHE NO SENSIBLE
// ======================================================
export function setCurrentUser(
  user: unknown,
  opts?: { event?: AuthEventType; silent?: boolean }
) {
  writeCurrentUser(user);

  if (opts?.silent) return;

  broadcastAuthEvent(opts?.event || "login");
  emit();
}

export function getCurrentUser<T = unknown>(): T | null {
  if (!isBrowser()) return null;

  try {
    const raw = localStorage.getItem(CURRENT_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function clearCurrentUser(opts?: { silent?: boolean }) {
  clearLocalSessionState();

  if (opts?.silent) return;

  broadcastAuthEvent("logout");
  emit();
}

// ======================================================
// COMPATIBILIDAD
// Estas funciones se dejan para no romper imports viejos,
// pero ya NO manejan tokens.
// ======================================================
export function setTokens(_: { accessToken: string; refreshToken?: string }) {
  // No-op en arquitectura cookie-based
}

export function getToken(): null {
  return null;
}

export function getRefreshToken(): null {
  return null;
}

// ======================================================
// LOGOUT GLOBAL
// ======================================================
export async function logout(opts?: {
  redirect?: boolean;
  silent?: boolean;
  apiBaseUrl?: string;
}) {
  const shouldRedirect = opts?.redirect !== false;
  const silent = opts?.silent === true;

  try {
    const url = buildApiUrl("/api/auth/logout", opts?.apiBaseUrl);

    await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
  } catch (err) {
    if (!silent) {
      console.error("logout error:", err);
    }
  } finally {
    clearLocalSessionState();
    broadcastAuthEvent("logout");
    emit();

    if (shouldRedirect && isBrowser()) {
      window.location.href = "/login";
    }
  }
}

// ======================================================
// REFRESH / EVENTOS DE SESIÓN
// ======================================================
export function notifySessionRefresh() {
  broadcastAuthEvent("session-refresh");
  emit();
}

export function onAuthChange(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ======================================================
// DEBUG
// ======================================================
export function __debugAuth() {
  return {
    mode: "cookie-based",
    apiBaseUrl: getApiBaseUrl(),
    currentUser: getCurrentUser(),
  };
}