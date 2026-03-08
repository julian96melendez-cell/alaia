"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

    async function verify() {
      try {
        const res = await fetch("/api/session-me", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        const data = await res.json();

        if (!res.ok || !data.ok) {
          router.replace("/login");
          return;
        }

        if (!data.user?.admin) {
          router.replace("/login");
          return;
        }

        if (mounted) {
          setAuthorized(true);
        }
      } catch (error) {
        console.error("ADMIN VERIFY ERROR:", error);
        router.replace("/login");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    verify();

    return () => {
      mounted = false;
    };
  }, [router]);

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