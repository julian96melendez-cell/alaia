"use client";

import { api } from "@/lib/api";
import { clearCurrentUser, logout, setCurrentUser } from "@/lib/auth";
import type { AuthMeData, Usuario } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type SellerDashboardData = {
  totalProductos?: number;
  totalOrdenes?: number;
  totalIngresos?: number;
  totalPayoutsPendientes?: number;
  totalPayoutsPagados?: number;
};

type AuthResponse = {
  ok: boolean;
  message?: string;
  data?: AuthMeData;
};

function money(n: unknown, currency = "USD") {
  const amount = Number(n || 0);

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: String(currency || "USD").toUpperCase(),
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(15,23,42,.08)",
        borderRadius: 18,
        padding: 20,
        boxShadow: "0 10px 24px rgba(15,23,42,.06)",
        display: "grid",
        gap: 8,
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "rgba(15,23,42,.55)",
          letterSpacing: ".02em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>

      <strong
        style={{
          fontSize: 30,
          lineHeight: 1,
          fontWeight: 900,
          color: "#0f172a",
        }}
      >
        {value}
      </strong>

      <span
        style={{
          fontSize: 13,
          color: "rgba(15,23,42,.6)",
        }}
      >
        {hint}
      </span>
    </div>
  );
}

function ModuleCard({
  title,
  description,
  href,
  action,
}: {
  title: string;
  description: string;
  href: string;
  action: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(15,23,42,.08)",
        borderRadius: 18,
        padding: 22,
        boxShadow: "0 10px 24px rgba(15,23,42,.06)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        minHeight: 200,
      }}
    >
      <div style={{ display: "grid", gap: 8 }}>
        <h2
          style={{
            margin: 0,
            fontSize: 19,
            fontWeight: 900,
            color: "#0f172a",
          }}
        >
          {title}
        </h2>

        <p
          style={{
            margin: 0,
            fontSize: 14,
            color: "rgba(15,23,42,.7)",
            lineHeight: 1.6,
          }}
        >
          {description}
        </p>
      </div>

      <div style={{ marginTop: "auto" }}>
        <Link
          href={href}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "10px 14px",
            borderRadius: 12,
            background: "#0f172a",
            color: "#fff",
            fontSize: 14,
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          {action}
        </Link>
      </div>
    </div>
  );
}

function SellerLogoutButton() {
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    if (loading) return;
    setLoading(true);

    try {
      await logout({
        redirect: false,
        silent: false,
      });

      clearCurrentUser({ silent: true });

      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    } catch (error) {
      console.error("SELLER LOGOUT ERROR:", error);

      clearCurrentUser({ silent: true });

      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      style={{
        padding: "10px 16px",
        borderRadius: 10,
        border: "1px solid #e5e7eb",
        background: "#fff",
        cursor: loading ? "not-allowed" : "pointer",
        fontWeight: 600,
        fontSize: 14,
        opacity: loading ? 0.7 : 1,
        transition: "all 0.2s ease",
      }}
    >
      {loading ? "Cerrando sesión..." : "Cerrar sesión"}
    </button>
  );
}

export default function SellerHome() {
  const router = useRouter();

  const [sellerUser, setSellerUser] = useState<Usuario | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  const [dashboardData, setDashboardData] = useState<SellerDashboardData | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  async function validateSellerSession() {
    setAuthChecking(true);

    try {
      const meRes = await api.get<AuthMeData>("/api/auth/me", {
        autoLogoutOn401: true,
      } as any);

      if (!meRes?.ok) {
        throw new Error(meRes?.message || "No se pudo validar la sesión.");
      }

      const usuario = meRes?.data?.usuario;

      if (!usuario) {
        throw new Error("No se recibió información del usuario.");
      }

      if (usuario.rol !== "vendedor") {
        clearCurrentUser({ silent: true });
        router.replace("/");
        return null;
      }

      if (usuario.sellerStatus && usuario.sellerStatus !== "approved") {
        throw new Error("Tu cuenta de vendedor aún no está aprobada.");
      }

      if (usuario.activo === false) {
        throw new Error("Tu cuenta está inactiva.");
      }

      if (usuario.bloqueado === true) {
        throw new Error("Tu cuenta está bloqueada.");
      }

      setCurrentUser(usuario, {
        event: "session-refresh",
      });

      setSellerUser(usuario);
      return usuario;
    } catch (err: any) {
      setSellerUser(null);
      setDashboardError(err?.message || "No se pudo validar la sesión.");
      clearCurrentUser({ silent: true });
      router.replace("/login");
      return null;
    } finally {
      setAuthChecking(false);
    }
  }

  async function loadDashboard() {
    setLoadingDashboard(true);
    setDashboardError(null);

    try {
      const res = await api.get<SellerDashboardData>("/api/seller/dashboard", {
        autoLogoutOn401: true,
        friendlyErrorMessage: "No se pudo cargar el panel del vendedor.",
      } as any);

      if (!res.ok) {
        throw new Error(
          res.message ||
            "No se pudieron cargar las métricas del panel del vendedor."
        );
      }

      setDashboardData(res.data || {});
    } catch (err: any) {
      setDashboardData({
        totalProductos: 0,
        totalOrdenes: 0,
        totalIngresos: 0,
        totalPayoutsPendientes: 0,
        totalPayoutsPagados: 0,
      });

      setDashboardError(
        err?.message ||
          "Panel cargado con datos iniciales. Falta conectar las métricas del vendedor."
      );
    } finally {
      setLoadingDashboard(false);
    }
  }

  useEffect(() => {
    async function bootstrap() {
      const usuario = await validateSellerSession();
      if (!usuario) return;
      await loadDashboard();
    }

    void bootstrap();
  }, []);

  const dashboard = useMemo(() => {
    return {
      totalProductos: dashboardData?.totalProductos || 0,
      totalOrdenes: dashboardData?.totalOrdenes || 0,
      totalIngresos: dashboardData?.totalIngresos || 0,
      totalPayoutsPendientes: dashboardData?.totalPayoutsPendientes || 0,
      totalPayoutsPagados: dashboardData?.totalPayoutsPagados || 0,
    };
  }, [dashboardData]);

  if (authChecking) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
          color: "#475569",
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        Verificando acceso de vendedor…
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
      }}
    >
      <div
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          padding: 24,
          display: "grid",
          gap: 24,
        }}
      >
        <header
          style={{
            background: "#fff",
            border: "1px solid rgba(15,23,42,.08)",
            borderRadius: 22,
            padding: 24,
            boxShadow: "0 12px 30px rgba(15,23,42,.06)",
            display: "flex",
            justifyContent: "space-between",
            gap: 20,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div style={{ maxWidth: 760 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 999,
                background: "rgba(16,185,129,.10)",
                color: "#047857",
                fontSize: 12,
                fontWeight: 800,
                marginBottom: 14,
              }}
            >
              Panel seguro · Vendedores
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: 34,
                lineHeight: 1.1,
                fontWeight: 900,
                color: "#0f172a",
              }}
            >
              Panel de Vendedor
            </h1>

            <p
              style={{
                marginTop: 10,
                marginBottom: 0,
                fontSize: 15,
                lineHeight: 1.7,
                color: "rgba(15,23,42,.68)",
                maxWidth: 720,
              }}
            >
              Gestiona tus productos, revisa tus ventas, controla tus payouts y
              administra tu operación dentro del marketplace.
            </p>

            {sellerUser ? (
              <p
                style={{
                  marginTop: 12,
                  marginBottom: 0,
                  fontSize: 14,
                  color: "rgba(15,23,42,.62)",
                }}
              >
                Sesión activa como <strong>{sellerUser.nombre}</strong> ·{" "}
                {sellerUser.email}
              </p>
            ) : null}
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => void loadDashboard()}
              disabled={loadingDashboard}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid rgba(15,23,42,.12)",
                background: "#fff",
                color: "#0f172a",
                fontSize: 14,
                fontWeight: 800,
                cursor: loadingDashboard ? "not-allowed" : "pointer",
                opacity: loadingDashboard ? 0.7 : 1,
              }}
            >
              {loadingDashboard ? "Actualizando…" : "Recargar"}
            </button>

            <SellerLogoutButton />
          </div>
        </header>

        {dashboardError ? (
          <div
            style={{
              background: "#fff8e6",
              border: "1px solid #fde68a",
              color: "#92400e",
              padding: 14,
              borderRadius: 12,
              fontWeight: 700,
            }}
          >
            {dashboardError}
          </div>
        ) : null}

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 18,
          }}
        >
          <StatCard
            label="Productos"
            value={loadingDashboard ? "—" : String(dashboard.totalProductos)}
            hint="Productos activos dentro de tu catálogo"
          />
          <StatCard
            label="Órdenes"
            value={loadingDashboard ? "—" : String(dashboard.totalOrdenes)}
            hint="Órdenes registradas para tu operación"
          />
          <StatCard
            label="Ingresos"
            value={loadingDashboard ? "—" : money(dashboard.totalIngresos, "USD")}
            hint="Ingresos acumulados asociados a tus ventas"
          />
          <StatCard
            label="Payouts pendientes"
            value={loadingDashboard ? "—" : String(dashboard.totalPayoutsPendientes)}
            hint="Pagos pendientes de liberar o procesar"
          />
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 18,
          }}
        >
          <ModuleCard
            title="Mis productos"
            description="Gestiona tu catálogo, precios, stock, visibilidad y mantenimiento de productos."
            href="/seller/productos"
            action="Gestionar productos"
          />

          <ModuleCard
            title="Mis órdenes"
            description="Consulta el flujo de tus ventas, estados de pago y estado operativo del fulfillment."
            href="/seller/ordenes"
            action="Ver órdenes"
          />

          <ModuleCard
            title="Payouts"
            description="Revisa payouts pendientes, procesados, completados o con incidencias."
            href="/seller/payouts"
            action="Ver payouts"
          />

          <ModuleCard
            title="Configuración"
            description="Administra datos de tu cuenta, configuración comercial y estado de onboarding."
            href="/seller/configuracion"
            action="Ver configuración"
          />
        </section>

        <footer
          style={{
            marginTop: 8,
            paddingTop: 16,
            borderTop: "1px solid rgba(15,23,42,.08)",
            fontSize: 13,
            color: "rgba(15,23,42,.5)",
          }}
        >
          Área protegida · Acceso exclusivo para vendedores autorizados
        </footer>
      </div>
    </main>
  );
}