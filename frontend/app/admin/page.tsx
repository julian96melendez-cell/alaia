"use client";

import AdminLogoutButton from "@/components/AdminLogoutButton";
import { api } from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type UserRole = "admin" | "vendedor" | "usuario";

type AuthUser = {
  id: string;
  nombre: string;
  email: string;
  rol: UserRole;
  activo?: boolean;
  bloqueado?: boolean;
  emailVerificado?: boolean;
  sellerStatus?: "pending" | "approved" | "suspended" | null;
};

type AuthMeResponse = {
  ok: boolean;
  message?: string;
  data?: {
    usuario?: AuthUser;
  };
};

type OrdenMetrics = {
  totalOrdenes: number;
  totalIngresos: number;
  totalCostoProveedor: number;
  totalGanancia: number;
  pagadas: number;
  pendientes: number;
  fallidas: number;
  reembolsadas: number;
};

type PayoutMetrics = {
  totalRows: number;
  totalMonto: number;
  pendientes: number;
  procesando: number;
  pagados: number;
  fallidos: number;
  bloqueados: number;
  totalPendienteMonto: number;
  totalPagadoMonto: number;
  totalFallidoMonto: number;
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
  disabled,
}: {
  title: string;
  description: string;
  href: string;
  action: string;
  disabled?: boolean;
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
        minHeight: 220,
        opacity: disabled ? 0.55 : 1,
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
        {disabled ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "10px 14px",
              borderRadius: 12,
              background: "rgba(15,23,42,.08)",
              color: "rgba(15,23,42,.45)",
              fontSize: 14,
              fontWeight: 800,
            }}
          >
            Próximamente
          </span>
        ) : (
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
        )}
      </div>
    </div>
  );
}

function InfoPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: "#fff",
        border: "1px solid rgba(15,23,42,.08)",
        borderRadius: 18,
        padding: 22,
        boxShadow: "0 10px 24px rgba(15,23,42,.06)",
        display: "grid",
        gap: 14,
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: 18,
          fontWeight: 900,
          color: "#0f172a",
        }}
      >
        {title}
      </h3>

      {children}
    </section>
  );
}

function MiniListItem({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        padding: "12px 0",
        borderBottom: "1px solid rgba(15,23,42,.08)",
      }}
    >
      <div style={{ display: "grid", gap: 4 }}>
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "#0f172a",
          }}
        >
          {title}
        </span>

        <span
          style={{
            fontSize: 13,
            color: "rgba(15,23,42,.6)",
          }}
        >
          {subtitle}
        </span>
      </div>
    </div>
  );
}

function FullPageMessage({
  title,
  description,
  loading = false,
}: {
  title: string;
  description: string;
  loading?: boolean;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 520,
          background: "#fff",
          border: "1px solid rgba(15,23,42,.08)",
          borderRadius: 22,
          padding: 28,
          boxShadow: "0 12px 30px rgba(15,23,42,.06)",
          display: "grid",
          gap: 12,
          textAlign: "center",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 28,
            lineHeight: 1.1,
            fontWeight: 900,
            color: "#0f172a",
          }}
        >
          {title}
        </h1>

        <p
          style={{
            margin: 0,
            fontSize: 15,
            lineHeight: 1.7,
            color: "rgba(15,23,42,.68)",
          }}
        >
          {description}
        </p>

        {loading ? (
          <div
            style={{
              marginTop: 8,
              fontSize: 14,
              fontWeight: 800,
              color: "#4338ca",
            }}
          >
            Cargando…
          </div>
        ) : null}
      </section>
    </main>
  );
}

export default function AdminHome() {
  const router = useRouter();

  const [authChecking, setAuthChecking] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [adminUser, setAdminUser] = useState<AuthUser | null>(null);

  const [ordenMetrics, setOrdenMetrics] = useState<OrdenMetrics | null>(null);
  const [payoutMetrics, setPayoutMetrics] = useState<PayoutMetrics | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  async function validateAdminSession() {
    setAuthChecking(true);
    setAuthError(null);

    try {
      const meRes = await api.get<AuthMeResponse["data"]>("/api/auth/me", {
        autoLogoutOn401: true,
      } as any);

      if (!meRes?.ok) {
        throw new Error(meRes?.message || "No se pudo validar la sesión.");
      }

      const usuario = meRes?.data?.usuario;

      if (!usuario) {
        throw new Error("No se recibió información del usuario autenticado.");
      }

      if (usuario.rol !== "admin") {
        localStorage.removeItem("currentUser");
        router.replace("/");
        return null;
      }

      localStorage.setItem("currentUser", JSON.stringify(usuario));
      setAdminUser(usuario);
      return usuario;
    } catch (err: any) {
      localStorage.removeItem("currentUser");
      setAdminUser(null);
      setAuthError(err?.message || "No se pudo validar la sesión.");
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
      const [ordenesRes, payoutsRes] = await Promise.all([
        api.get<OrdenMetrics>("/api/ordenes/admin/metrics", {
          autoLogoutOn401: true,
        } as any),
        api.get<PayoutMetrics>("/api/admin/payouts/metrics", {
          autoLogoutOn401: true,
        } as any),
      ]);

      if (!ordenesRes.ok) {
        throw new Error(
          ordenesRes.message || "No se pudieron cargar las métricas de órdenes"
        );
      }

      if (!payoutsRes.ok) {
        throw new Error(
          payoutsRes.message || "No se pudieron cargar las métricas de payouts"
        );
      }

      setOrdenMetrics(ordenesRes.data || null);
      setPayoutMetrics(payoutsRes.data || null);
    } catch (err: any) {
      setDashboardError(err?.message || "No se pudo cargar el dashboard");
      setOrdenMetrics(null);
      setPayoutMetrics(null);
    } finally {
      setLoadingDashboard(false);
    }
  }

  async function bootstrap() {
    const usuario = await validateAdminSession();
    if (!usuario) return;
    await loadDashboard();
  }

  useEffect(() => {
    void bootstrap();
  }, []);

  const dashboard = useMemo(() => {
    return {
      totalOrdenes: ordenMetrics?.totalOrdenes || 0,
      ordenesPendientes: ordenMetrics?.pendientes || 0,
      ordenesPagadas: ordenMetrics?.pagadas || 0,
      ingresos: ordenMetrics?.totalIngresos || 0,

      payoutsPendientes: payoutMetrics?.pendientes || 0,
      payoutsPagados: payoutMetrics?.pagados || 0,
      payoutsFallidos: payoutMetrics?.fallidos || 0,
      payoutsMontoPendiente: payoutMetrics?.totalPendienteMonto || 0,
    };
  }, [ordenMetrics, payoutMetrics]);

  if (authChecking) {
    return (
      <FullPageMessage
        title="Validando acceso"
        description="Estamos comprobando tu sesión administrativa y los permisos de acceso."
        loading
      />
    );
  }

  if (authError && !adminUser) {
    return (
      <FullPageMessage
        title="Acceso restringido"
        description={authError}
      />
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
                background: "rgba(79,70,229,.08)",
                color: "#4338ca",
                fontSize: 12,
                fontWeight: 800,
                marginBottom: 14,
              }}
            >
              Panel seguro · Administradores
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
              Panel de Administración
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
              Centro de control operativo de Alaia. Desde aquí puedes supervisar
              órdenes, pagos, payouts, catálogo, usuarios, seguridad y módulos críticos
              del sistema con una estructura preparada para escalar.
            </p>

            {adminUser ? (
              <p
                style={{
                  marginTop: 12,
                  marginBottom: 0,
                  fontSize: 14,
                  color: "rgba(15,23,42,.62)",
                }}
              >
                Sesión activa como <strong>{adminUser.nombre}</strong> · {adminUser.email}
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

            <AdminLogoutButton />
          </div>
        </header>

        {dashboardError ? (
          <div
            style={{
              background: "#fff3f3",
              border: "1px solid #ffd3d3",
              color: "#b00020",
              padding: 14,
              borderRadius: 12,
              fontWeight: 800,
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
            label="Órdenes"
            value={loadingDashboard ? "—" : String(dashboard.totalOrdenes)}
            hint="Total acumulado de órdenes en el sistema"
          />
          <StatCard
            label="Pendientes"
            value={loadingDashboard ? "—" : String(dashboard.ordenesPendientes)}
            hint="Órdenes que aún no han completado el flujo de pago"
          />
          <StatCard
            label="Payouts pendientes"
            value={loadingDashboard ? "—" : String(dashboard.payoutsPendientes)}
            hint="Pagos a vendedores aún retenidos o pendientes de liberar"
          />
          <StatCard
            label="Monto retenido"
            value={loadingDashboard ? "—" : money(dashboard.payoutsMontoPendiente, "USD")}
            hint="Volumen pendiente de payout en vendedores"
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
            title="Órdenes"
            description="Consulta, filtra y administra órdenes, pagos, estados y flujo operativo del sistema."
            href="/admin/ordenes"
            action="Gestionar órdenes"
          />

          <ModuleCard
            title="Fulfillment"
            description="Gestiona procesamiento logístico, tracking, transportistas, entregas y trazabilidad."
            href="/admin/fulfillment"
            action="Ver fulfillment"
          />

          <ModuleCard
            title="Payouts"
            description="Supervisa payouts a vendedores, estados retenidos, fallidos, bloqueados y transferencias Stripe Connect."
            href="/admin/payouts"
            action="Ver payouts"
          />

          <ModuleCard
            title="Productos"
            description="Administra catálogo, visibilidad, stock, SKU, precios y mantenimiento de productos."
            href="/admin/productos"
            action="Gestionar productos"
          />

          <ModuleCard
            title="Usuarios"
            description="Gestión de usuarios, roles administrativos, activación y control de acceso."
            href="/admin/usuarios"
            action="Gestionar usuarios"
          />

          <ModuleCard
            title="Seguridad"
            description="Revisión de sesiones administrativas, alertas y actividad sospechosa del sistema."
            href="/admin/security"
            action="Ver seguridad"
          />

          <ModuleCard
            title="Analytics"
            description="Métricas, ingresos, órdenes por día y visualización del rendimiento del negocio."
            href="/admin/analytics"
            action="Ver analytics"
          />
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 18,
          }}
        >
          <InfoPanel title="Estado del sistema">
            <div style={{ display: "grid", gap: 12 }}>
              <MiniListItem
                title="Autenticación"
                subtitle="Protegida con sesión segura, middleware, validación de administrador y recuperación de acceso"
              />
              <MiniListItem
                title="Rate limiting"
                subtitle="Activo para endurecer login y reducir abuso automatizado"
              />
              <MiniListItem
                title="Payouts marketplace"
                subtitle={
                  loadingDashboard
                    ? "Cargando estado operativo de payouts…"
                    : dashboard.payoutsFallidos > 0
                    ? `Hay ${dashboard.payoutsFallidos} payout(s) fallido(s) que requieren revisión`
                    : dashboard.payoutsPendientes > 0
                    ? `${dashboard.payoutsPendientes} payout(s) pendiente(s) en flujo normal`
                    : "Sin incidencias relevantes en payouts"
                }
              />
              <MiniListItem
                title="Auditoría"
                subtitle="Sesiones administrativas y monitoreo de accesos preparados para revisión"
              />
            </div>
          </InfoPanel>

          <InfoPanel title="Resumen operativo">
            <div style={{ display: "grid", gap: 12 }}>
              <MiniListItem
                title="Órdenes pagadas"
                subtitle={
                  loadingDashboard
                    ? "Cargando métricas…"
                    : `${dashboard.ordenesPagadas} orden(es) marcadas como pagadas`
                }
              />
              <MiniListItem
                title="Ingresos acumulados"
                subtitle={
                  loadingDashboard
                    ? "Cargando métricas…"
                    : `${money(dashboard.ingresos, "USD")} acumulados en órdenes`
                }
              />
              <MiniListItem
                title="Payouts pagados"
                subtitle={
                  loadingDashboard
                    ? "Cargando métricas…"
                    : `${dashboard.payoutsPagados} payout(s) completados correctamente`
                }
              />
              <MiniListItem
                title="Payouts fallidos"
                subtitle={
                  loadingDashboard
                    ? "Cargando métricas…"
                    : `${dashboard.payoutsFallidos} payout(s) con necesidad de revisión o reintento`
                }
              />
            </div>
          </InfoPanel>
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
          Área protegida · Acceso exclusivo para administradores autorizados
        </footer>
      </div>
    </main>
  );
}