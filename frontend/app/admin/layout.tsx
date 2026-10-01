"use client";

import { apiUrl } from "../../lib/backend";
import { clearCurrentUser, setCurrentUser } from "@/lib/auth";
import type { AuthMeData, Usuario } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type MeResponse = {
  ok: boolean;
  message?: string;
  data?: AuthMeData;
};

function FullPageLoader({ text }: { text: string }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
        color: "#475569",
        fontSize: 14,
        fontWeight: 700,
        padding: 24,
        textAlign: "center",
      }}
    >
      {text}
    </div>
  );
}

function buildAuthMeUrl() { return apiUrl("/api/auth/me"); }

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    async function denyAccess(redirectTo: string) {
      clearCurrentUser({ silent: true });

      if (!mounted) return;

      setAuthorized(false);
      setLoading(false);
      router.replace(redirectTo);
    }

    async function verifyAdminAccess() {
      try {
        const endpoint = buildAuthMeUrl();

        const res = await fetch(endpoint, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });

        const data: MeResponse = await res.json().catch(() => ({
          ok: false,
          message: "Respuesta inválida del servidor",
        }));

        const usuario = data?.data?.usuario as Usuario | undefined;

        if (!res.ok || !data?.ok || !usuario) {
          await denyAccess("/login");
          return;
        }

        if (usuario.rol !== "admin") {
          await denyAccess("/");
          return;
        }

        if (!mounted) return;

        setCurrentUser(usuario, {
          event: "session-refresh",
        });

        setAuthorized(true);
        setLoading(false);
      } catch (error: any) {
        if (error?.name === "AbortError") return;

        console.error("ADMIN VERIFY ERROR:", error);
        await denyAccess("/login");
      }
    }

    void verifyAdminAccess();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [router]);

  if (loading) {
    return <FullPageLoader text="Verificando acceso administrativo…" />;
  }

  if (!authorized) {
    return null;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f7f7f8",
      }}
    >
      {children}
    </div>
  );
}