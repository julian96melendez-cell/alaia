import AdminLogoutButton from "@/components/AdminLogoutButton";
import Link from "next/link";

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

export default function AdminHome() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
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
              órdenes, pagos, logística y módulos críticos del sistema con una
              estructura preparada para escalar.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
            }}
          >
            <AdminLogoutButton />
          </div>
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 18,
          }}
        >
          <StatCard
            label="Órdenes"
            value="—"
            hint="Preparado para conectar con tus métricas reales"
          />
          <StatCard
            label="Pagos pendientes"
            value="—"
            hint="Pendiente de enlazar con órdenes y Stripe"
          />
          <StatCard
            label="Productos activos"
            value="—"
            hint="Listo para integrarse con catálogo"
          />
          <StatCard
            label="Sesiones admin"
            value="Seguras"
            hint="Autenticación protegida y auditada"
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
            description="Consulta, filtra y administra todas las órdenes del sistema, incluyendo pagos, estados y flujo operativo."
            href="/admin/ordenes"
            action="Gestionar órdenes"
          />

          <ModuleCard
            title="Pagos"
            description="Monitorea el estado de los pagos, conciliaciones y operaciones conectadas al flujo comercial."
            href="/admin/ordenes"
            action="Ver pagos"
          />

          <ModuleCard
            title="Fulfillment"
            description="Gestiona procesamiento logístico, envíos, entregas y trazabilidad operativa."
            href="/admin/ordenes"
            action="Ver fulfillment"
          />

          <ModuleCard
            title="Métricas"
            description="KPIs, ingresos, conversión y rendimiento general del sistema administrativo y comercial."
            href="#"
            action="Ver métricas"
            disabled
          />

          <ModuleCard
            title="Usuarios"
            description="Gestión avanzada de usuarios, privilegios, roles administrativos y actividad reciente."
            href="#"
            action="Gestionar usuarios"
            disabled
          />

          <ModuleCard
            title="Productos"
            description="Administración de catálogo, visibilidad, edición de productos y mantenimiento del inventario."
            href="/productos"
            action="Ver productos"
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
                subtitle="Protegida con sesión segura, middleware y validación de administrador"
              />
              <MiniListItem
                title="Rate limiting"
                subtitle="Activo para endurecer login y reducir abuso automatizado"
              />
              <MiniListItem
                title="Anti-bot"
                subtitle="Protección integrada para reforzar accesos y reducir intentos maliciosos"
              />
              <MiniListItem
                title="Auditoría"
                subtitle="Base preparada para registrar sesiones administrativas"
              />
            </div>
          </InfoPanel>

          <InfoPanel title="Próximos módulos">
            <div style={{ display: "grid", gap: 12 }}>
              <MiniListItem
                title="Dashboard con métricas reales"
                subtitle="Totales, pendientes, conversión y actividad reciente"
              />
              <MiniListItem
                title="Tabla de últimas órdenes"
                subtitle="Visualización rápida de operaciones recientes"
              />
              <MiniListItem
                title="Sesiones administrativas"
                subtitle="Historial de accesos con IP, navegador y fecha"
              />
              <MiniListItem
                title="Gestión avanzada de catálogo"
                subtitle="Crear, editar, activar y desactivar productos"
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