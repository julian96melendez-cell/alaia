import Link from "next/link";

/**
 * ======================================================
 * AdminHome — Dashboard principal (ENTERPRISE FINAL)
 * ======================================================
 * ✔ Panel central del sistema administrativo
 * ✔ Escalable (métricas, KPIs, módulos futuros)
 * ✔ UI profesional y clara
 * ✔ 100% compatible con AdminLayout
 * ✔ Sin dependencias externas
 * ✔ Archivo FINAL (no requiere cambios posteriores)
 * ======================================================
 */

/* ======================================================
   UI Components (locales, estables)
====================================================== */

function Card({
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
        border: "1px solid rgba(0,0,0,.08)",
        borderRadius: 16,
        padding: 20,
        boxShadow: "0 6px 18px rgba(0,0,0,.06)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 18,
          fontWeight: 900,
        }}
      >
        {title}
      </h2>

      <p
        style={{
          margin: 0,
          fontSize: 14,
          color: "rgba(0,0,0,.7)",
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>

      <div style={{ marginTop: "auto" }}>
        {disabled ? (
          <span
            style={{
              display: "inline-block",
              padding: "10px 14px",
              borderRadius: 12,
              background: "rgba(0,0,0,.1)",
              fontWeight: 800,
              fontSize: 14,
              color: "rgba(0,0,0,.4)",
            }}
          >
            Próximamente
          </span>
        ) : (
          <Link
            href={href}
            style={{
              display: "inline-block",
              padding: "10px 14px",
              borderRadius: 12,
              background: "rgba(0,0,0,.9)",
              color: "#fff",
              fontWeight: 800,
              fontSize: 14,
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

/* ======================================================
   PAGE
====================================================== */

export default function AdminHome() {
  return (
    <main
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: 24,
        display: "grid",
        gap: 24,
      }}
    >
      {/* =====================
          Header
      ====================== */}
      <header>
        <h1
          style={{
            margin: 0,
            fontSize: 30,
            fontWeight: 900,
          }}
        >
          Panel de Administración
        </h1>

        <p
          style={{
            marginTop: 8,
            fontSize: 15,
            color: "rgba(0,0,0,.7)",
            maxWidth: 700,
          }}
        >
          Centro de control del sistema. Desde aquí puedes administrar órdenes,
          pagos, estados logísticos y operaciones críticas de la plataforma.
        </p>
      </header>

      {/* =====================
          Módulos principales
      ====================== */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 18,
        }}
      >
        <Card
          title="Órdenes"
          description="Consulta, filtra y administra todas las órdenes del sistema, incluyendo pagos y estados."
          href="/admin/ordenes"
          action="Gestionar órdenes"
        />

        <Card
          title="Pagos"
          description="Monitorea el estado de los pagos, conciliaciones y operaciones con Stripe."
          href="/admin/ordenes"
          action="Ver pagos"
        />

        <Card
          title="Fulfillment"
          description="Control de envíos, procesamiento logístico y entregas."
          href="/admin/ordenes"
          action="Ver fulfillment"
        />

        {/* Listos para expansión futura */}
        <Card
          title="Métricas"
          description="KPIs, ingresos, conversiones y rendimiento del sistema."
          href="#"
          action="Ver métricas"
          disabled
        />

        <Card
          title="Usuarios"
          description="Gestión avanzada de usuarios, roles y accesos."
          href="#"
          action="Gestionar usuarios"
          disabled
        />
      </section>

      {/* =====================
          Footer informativo
      ====================== */}
      <footer
        style={{
          marginTop: 30,
          paddingTop: 14,
          borderTop: "1px solid rgba(0,0,0,.08)",
          fontSize: 13,
          color: "rgba(0,0,0,.5)",
        }}
      >
        Área protegida · Acceso exclusivo para administradores autorizados
      </footer>
    </main>
  );
}