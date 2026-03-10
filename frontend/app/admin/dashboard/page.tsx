"use client";

import { api } from "@/lib/api";
import { useEffect, useState } from "react";

/**
 * ======================================================
 * AdminDashboardPage
 * ======================================================
 * ✔ KPIs del negocio
 * ✔ Recarga manual
 * ✔ UI tipo panel profesional
 * ✔ Preparado para métricas reales
 * ======================================================
 */

type Metrics = {
  totalOrdenes: number;
  totalIngresos: number;
  totalGanancia: number;
  pagadas: number;
  pendientes: number;
  fallidas: number;
  reembolsadas: number;
};

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  async function loadMetrics() {
    setLoading(true);
    setError(null);

    const res = await api.get<Metrics>("/api/admin/metrics", {
      autoLogoutOn401: true,
    });

    if (!res.ok) {
      setError(res.message || "Error cargando métricas");
      setMetrics(null);
      setLoading(false);
      return;
    }

    setMetrics(res.data || null);
    setLoading(false);
  }

  useEffect(() => {
    loadMetrics();
  }, []);

  return (
    <main style={layout}>
      <div style={header}>
        <h1 style={title}>Dashboard</h1>

        <button onClick={loadMetrics} style={buttonOutline}>
          Recargar
        </button>
      </div>

      {loading ? (
        <div>Cargando métricas…</div>
      ) : error ? (
        <div style={errorBox}>{error}</div>
      ) : metrics ? (
        <section style={grid}>
          <MetricCard label="Órdenes totales" value={metrics.totalOrdenes} />

          <MetricCard label="Órdenes pagadas" value={metrics.pagadas} />

          <MetricCard label="Órdenes pendientes" value={metrics.pendientes} />

          <MetricCard label="Órdenes fallidas" value={metrics.fallidas} />

          <MetricCard label="Reembolsadas" value={metrics.reembolsadas} />

          <MetricCard
            label="Ingresos totales"
            value={`$${metrics.totalIngresos.toFixed(2)}`}
          />

          <MetricCard
            label="Ganancia estimada"
            value={`$${metrics.totalGanancia.toFixed(2)}`}
          />
        </section>
      ) : (
        <div>No hay datos.</div>
      )}
    </main>
  );
}

/**
 * Tarjeta KPI
 */

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div style={card}>
      <div style={metricValue}>{value}</div>
      <div style={metricLabel}>{label}</div>
    </div>
  );
}

/**
 * Styles
 */

const layout: React.CSSProperties = {
  maxWidth: 1000,
  margin: "0 auto",
  padding: 24,
  display: "grid",
  gap: 20,
};

const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const title: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))",
  gap: 16,
};

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(0,0,0,.08)",
  borderRadius: 16,
  padding: 20,
  display: "grid",
  gap: 8,
  textAlign: "center",
};

const metricValue: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
};

const metricLabel: React.CSSProperties = {
  fontSize: 14,
  opacity: 0.7,
};

const buttonOutline: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,.12)",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 700,
};

const errorBox: React.CSSProperties = {
  background: "#fff3f3",
  border: "1px solid #ffd3d3",
  padding: 12,
  borderRadius: 12,
  color: "#b00020",
  fontWeight: 700,
};