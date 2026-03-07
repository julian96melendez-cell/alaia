// ======================================================
// auth.ts — ENTERPRISE ULTRA (Frontend)
// ======================================================
// ✔ Token cache en memoria
// ✔ Sync entre pestañas
// ✔ Eventos globales
// ✔ Anti race conditions
// ✔ Preparado para cookies futuras
// ✔ SSR safe
// ======================================================

type Tokens = {
  accessToken: string;
  refreshToken?: string;
};

const ACCESS_KEY = "accessToken";
const REFRESH_KEY = "refreshToken";

// Cache en memoria (MUY importante para performance)
let memoryAccessToken: string | null = null;
let memoryRefreshToken: string | null = null;

// Listeners de sesión
type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((fn) => fn());
}

// ======================================================
// HELPERS
// ======================================================
function isBrowser() {
  return typeof window !== "undefined";
}

function readStorage() {
  if (!isBrowser()) return;

  memoryAccessToken = localStorage.getItem(ACCESS_KEY);
  memoryRefreshToken = localStorage.getItem(REFRESH_KEY);
}

function writeStorage(access?: string | null, refresh?: string | null) {
  if (!isBrowser()) return;

  if (access) localStorage.setItem(ACCESS_KEY, access);
  else localStorage.removeItem(ACCESS_KEY);

  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  else localStorage.removeItem(REFRESH_KEY);
}

// ======================================================
// INIT
// ======================================================
if (isBrowser()) {
  readStorage();

  // Sync entre pestañas
  window.addEventListener("storage", (e) => {
    if (e.key === ACCESS_KEY || e.key === REFRESH_KEY) {
      readStorage();
      emit();
    }
  });
}

// ======================================================
// SET TOKENS
// ======================================================
export function setTokens(tokens: Tokens) {
  if (!tokens?.accessToken) return;

  memoryAccessToken = tokens.accessToken;
  memoryRefreshToken = tokens.refreshToken ?? null;

  writeStorage(memoryAccessToken, memoryRefreshToken);
  emit();
}

// ======================================================
// GET TOKEN (ULTRA RÁPIDO)
// ======================================================
export function getToken(): string | null {
  if (memoryAccessToken) return memoryAccessToken;

  if (!isBrowser()) return null;

  memoryAccessToken = localStorage.getItem(ACCESS_KEY);
  return memoryAccessToken;
}

export function getRefreshToken(): string | null {
  if (memoryRefreshToken) return memoryRefreshToken;

  if (!isBrowser()) return null;

  memoryRefreshToken = localStorage.getItem(REFRESH_KEY);
  return memoryRefreshToken;
}

// ======================================================
// LOGOUT GLOBAL
// ======================================================
export function logout(opts?: { redirect?: boolean }) {
  memoryAccessToken = null;
  memoryRefreshToken = null;

  if (isBrowser()) {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }

  emit();

  if (opts?.redirect !== false && isBrowser()) {
    window.location.href = "/login";
  }
}

// ======================================================
// SUBSCRIBE A CAMBIOS DE SESIÓN
// ======================================================
export function onAuthChange(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ======================================================
// DEBUG (solo dev)
// ======================================================
export function __debugAuth() {
  return {
    memoryAccessToken,
    memoryRefreshToken,
  };
}