"use client";

/**
 * AdminGuard — ENTERPRISE SECURITY LAYER
 * - Protege rutas Admin por rol
 * - Maneja accessToken + refreshToken
 * - Refresh automático anti-race
 * - Manejo backend caído y respuestas no JSON
 * - Logout automático en 401/403
 * - Evita loops (no renderiza children si no está autorizado)
 */

import { getRefreshToken, getToken, logout, setTokens } from "@/lib/auth";
import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";

type UsuarioAuth = {
  _id?: string;
  id?: string;
  email: string;
  rol: "admin" | "user";
};

type MeResponse = {
  ok: boolean;
  data?: UsuarioAuth;
  message?: string;
};

type RefreshResponse = {
  ok: boolean;
  data?: {
    // OJO: tu backend puede devolver tokens dentro de data.tokens.
    // Aquí soportamos ambos formatos de forma segura.
    accessToken?: string;
    refreshToken?: string;
    tokens?: {
      accessToken: string;
      refreshToken?: string;
    };
  };
  message?: string;
};

type AdminGuardProps = {
  children: React.ReactNode;
  loadingFallback?: React.ReactNode;
};

let refreshingPromise: Promise<string | null> | null = null;

function resolveBackendUrl() {
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "https://alaia-backend-multi.onrender.com"
  );
}

async function safeJson<T>(
  res: Response
): Promise<{ okJson: boolean; json?: T }> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return { okJson: false };

  try {
    const json = (await res.json()) as T;
    return { okJson: true, json };
  } catch {
    return { okJson: false };
  }
}

export default function AdminGuard({
  children,
  loadingFallback,
}: AdminGuardProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  // evita setState luego de unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const backendUrl = resolveBackendUrl();
    const abort = new AbortController();

    async function fetchMe(token: string) {
      const res = await fetch(`${backendUrl}/api/auth/me`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal: abort.signal,
        cache: "no-store",
      });

      const parsed = await safeJson<MeResponse>(res);
      if (!parsed.okJson || !parsed.json) throw new Error("INVALID_RESPONSE");

      return { res, json: parsed.json };
    }

    async function refreshToken(): Promise<string | null> {
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

          const parsed = await safeJson<RefreshResponse>(res);
          if (!parsed.okJson || !parsed.json) return null;

          if (!res.ok || !parsed.json.ok) return null;

          const data = parsed.json.data;
          const access =
            data?.accessToken || data?.tokens?.accessToken || null;
          const refresh =
            data?.refreshToken || data?.tokens?.refreshToken || refreshToken;

          if (!access) return null;

          setTokens({ accessToken: access, refreshToken: refresh });
          return access;
        } catch {
          return null;
        }
      })();

      const result = await refreshingPromise;
      refreshingPromise = null;
      return result;
    }

    async function verifyAdmin() {
      try {
        const token = getToken();
        if (!token) throw new Error("NO_TOKEN");

        let { res, json } = await fetchMe(token);

        if (res.status === 401) {
          const newToken = await refreshToken();
          if (!newToken) throw new Error("UNAUTHORIZED");
          const retry = await fetchMe(newToken);
          res = retry.res;
          json = retry.json;
        }

        if (res.status === 403) throw new Error("FORBIDDEN");
        if (!res.ok || !json.ok) throw new Error("BACKEND_ERROR");

        const user = json.data;
        if (!user || user.rol !== "admin") throw new Error("FORBIDDEN");

        if (mountedRef.current) {
          setAuthorized(true);
        }
      } catch (err: any) {
        if (!mountedRef.current) return;

        const msg = err?.message || "UNKNOWN";
        console.error("⛔ AdminGuard blocked:", msg);

        if (msg === "NO_TOKEN" || msg === "UNAUTHORIZED" || msg === "FORBIDDEN") {
          logout(); // redirige a /login
          return;
        }

        router.replace("/login");
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    }

    verifyAdmin();

    return () => abort.abort();
  }, [router]);

  if (loading) {
    return (
      <>
        {loadingFallback ?? (
          <div
            style={{
              minHeight: "100vh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#f7f7f8",
              color: "#555",
              fontSize: 14,
            }}
          >
            Verificando permisos de administrador…
          </div>
        )}
      </>
    );
  }

  if (!authorized) return null;
  return <>{children}</>;
}