"use client";

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

function getApiBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    ""
  );
}

function buildAuthMeUrl() {
  const apiUrl = getApiBaseUrl();
  return apiUrl ? `${apiUrl.replace(/\/$/, "")}/api/auth/me` : "/api/auth/me";
}

export default function SellerLayout({
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

    async function verifySellerAccess() {
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

        if (usuario.rol !== "vendedor") {
          await denyAccess("/");
          return;
        }

        // Endurecimiento: solo vendedores aprobados
        if (usuario.sellerStatus && usuario.sellerStatus !== "approved") {
          await denyAccess("/");
          return;
        }

        if (usuario.activo === false || usuario.bloqueado === true) {
          await denyAccess("/login");
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

        console.error("SELLER VERIFY ERROR:", error);
        await denyAccess("/login");
      }
    }

    void verifySellerAccess();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [router]);

  if (loading) {
    return <FullPageLoader text="Verificando acceso de vendedor…" />;
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