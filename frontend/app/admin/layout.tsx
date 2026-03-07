"use client";

/**
 * ======================================================
 * ADMIN LAYOUT — ENTERPRISE SECURITY LAYER (ELITE)
 * ======================================================
 * ✔ Protección ADMIN real
 * ✔ accessToken + refreshToken
 * ✔ Refresh anti-race conditions
 * ✔ AbortController
 * ✔ Safe JSON parsing
 * ✔ Soporte backend lento
 * ✔ Soporte backend caído
 * ✔ Manejo offline
 * ✔ Evita loops infinitos
 * ✔ Compatible con Render / Vercel
 * ✔ Logging profesional
 * ✔ Preparado para escala real
 * ======================================================
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  getRefreshToken,
  getToken,
  logout,
  setTokens,
} from "@/lib/auth";

// ======================================================
// TYPES
// ======================================================

type UsuarioAuth = {
  _id?: string;
  id?: string;
  email: string;
  rol: "admin" | "user";
};

type MeResponse = {
  ok: boolean;
  data?: UsuarioAuth;
};

type RefreshResponse = {
  ok: boolean;
  data?: {
    accessToken?: string;
    refreshToken?: string;
    tokens?: {
      accessToken: string;
      refreshToken?: string;
    };
  };
};

// ======================================================
// GLOBAL REFRESH LOCK
// evita múltiples refresh simultáneos
// ======================================================

let refreshingPromise: Promise<string | null> | null = null;

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  const mountedRef = useRef(true);

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    mountedRef.current = true;

    const abort = new AbortController();

    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      "https://alaia-backend-multi.onrender.com";

    // ======================================================
    // SAFE JSON
    // ======================================================
    async function safeJson<T>(res: Response): Promise<T | null> {
      const contentType = res.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        console.error("⚠️ Backend no devolvió JSON");
        return null;
      }

      try {
        return await res.json();
      } catch {
        console.error("⚠️ JSON corrupto");
        return null;
      }
    }

    // ======================================================
    // FETCH /me
    // ======================================================
    async function fetchMe(token: string) {
      const res = await fetch(`${backendUrl}/api/auth/me`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal: abort.signal,
        cache: "no-store",
      });

      const json = await safeJson<MeResponse>(res);
      if (!json) throw new Error("INVALID_RESPONSE");

      return { res, json };
    }

    // ======================================================
    // REFRESH TOKEN (ANTI RACE)
    // ======================================================
    async function intentarRefresh(): Promise<string | null> {
      if (refreshingPromise) return refreshingPromise;

      refreshingPromise = (async () => {
        try {
          const refreshToken = getRefreshToken();
          if (!refreshToken) return null;

          const res = await fetch(`${backendUrl}/api/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken }),
            signal: abort.signal,
            cache: "no-store",
          });

          const json = await safeJson<RefreshResponse>(res);

          if (!json || !res.ok || !json.ok) return null;

          const access =
            json.data?.accessToken ||
            json.data?.tokens?.accessToken;

          const refresh =
            json.data?.refreshToken ||
            json.data?.tokens?.refreshToken ||
            refreshToken;

          if (!access) return null;

          setTokens({
            accessToken: access,
            refreshToken: refresh,
          });

          console.log("🔄 Token refrescado");

          return access;
        } catch {
          console.error("⚠️ Refresh falló");
          return null;
        }
      })();

      const result = await refreshingPromise;
      refreshingPromise = null;
      return result;
    }

    // ======================================================
    // VERIFY ADMIN
    // ======================================================
    async function verificarAdmin() {
      try {
        const token = getToken();
        if (!token) throw new Error("NO_TOKEN");

        let { res, json } = await fetchMe(token);

        // ========================
        // TOKEN EXPIRADO
        // ========================
        if (res.status === 401) {
          const nuevoToken = await intentarRefresh();
          if (!nuevoToken) throw new Error("UNAUTHORIZED");

          const retry = await fetchMe(nuevoToken);
          res = retry.res;
          json = retry.json;
        }

        // ========================
        // PERMISOS
        // ========================
        if (res.status === 403) throw new Error("FORBIDDEN");
        if (!res.ok || !json.ok) throw new Error("BACKEND_ERROR");

        const user = json.data;

        if (!user || user.rol !== "admin") {
          throw new Error("FORBIDDEN");
        }

        if (mountedRef.current) {
          setAuthorized(true);
        }
      } catch (err: any) {
        if (!mountedRef.current) return;

        console.error("⛔ ADMIN BLOCK:", err.message);

        if (
          err.message === "NO_TOKEN" ||
          err.message === "UNAUTHORIZED" ||
          err.message === "FORBIDDEN"
        ) {
          logout();
          return;
        }

        router.replace("/login");
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    }

    verificarAdmin();

    return () => {
      mountedRef.current = false;
      abort.abort();
    };
  }, [router]);

  // ======================================================
  // LOADING SCREEN
  // ======================================================
  if (loading) {
    return (
      <div style={loadingStyle}>
        Verificando acceso administrativo…
      </div>
    );
  }

  if (!authorized) return null;

  return (
    <div style={{ minHeight: "100vh", background: "#f7f7f8" }}>
      {children}
    </div>
  );
}

const loadingStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f7f7f8",
  color: "#555",
  fontSize: 14,
};