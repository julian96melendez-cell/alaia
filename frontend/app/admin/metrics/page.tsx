"use client";

/**
 * ======================================================
 * AdminMetricsPage — Dashboard de Métricas (PRO FINAL)
 * ======================================================
 * ✔ Consume: GET /api/ordenes/admin/metrics
 * ✔ Maneja loading / error / retry
 * ✔ UI clara + KPIs
 * ✔ Sin librerías externas
 * ======================================================
 */

import { api } from "@/lib/api";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Metrics = {
  totalOrdenes: number;
  totalIngresos: number;
  totalCostoProveedor: number;
  totalGanancia: number;
  pagadas: number;
  pendientes: number;
  fallidas: number;
  reembolsadas: number;
};

function money(n: number) {
  const x = Number.isFinite(n) ? n : 0;
  return `$${x.toFixed(2)}`;
}

function StatCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(0,0,0,.08)",
        borderRadius: 16,
        padding: 18,
        boxShadow: "0 6px 18px rgba(0,0,0,.06)",
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 12, color: "rgba(0,0,0,.6)", fontWeight: 800 }}>
        {title}
      </div>
      <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: -0.2 }}>
        {value}
      </div>
      {hint ? (
        <div style={{ fontSize: 12, color: "rgba(0,0,0,.55)" }}>{hint}</div>
      ) : null}
    </div>
  );
}

export default function AdminMetricsPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    const res = await api.get<Metrics>("/api/ordenes/admin/metrics", {
      autoLogoutOn401: true,
      friendlyErrorMessage: "No se pudieron cargar las métricas",
    });

    if (!res.ok || !res.data) {
      setData(null);
      setError(res.message || "Error cargando métricas");
      setLoading(false);
      return;
    }

    setData(res.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const derived = useMemo(() => {
    const m = data;
    if (!m) return null;

    const paidRate =
      m.totalOrdenes > 0 ? (m.pagadas / m.totalOrdenes) * 100 : 0;

    const margin =
      m.totalIngresos > 0 ? (m.totalGanancia / m.totalIngresos) * 100 : 0;

    return {
      paidRate,
      margin,
    };
  }, [data]);

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24, display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 950 }}>Métricas</h1>
          <p style={{ marginTop: 6, color: "rgba(0,0,0,.7)" }}>
            Vista ejecutiva del sistema (ingresos, ganancia, estados).
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={load}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,.12)",
              background: "#fff",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Recargar
          </button>
          <Link
            href="/admin"
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,.12)",
              background: "#fff",
              fontWeight: 900,
              textDecoration: "none",
              color: "rgba(0,0,0,.85)",
            }}
          >
            Volver
          </Link>
        </div>
      </div>

      {loading ? (
        <div
          style={{
            background: "#fff",
            border: "1px solid rgba(0,0,0,.08)",
            borderRadius: 16,
            padding: 18,
          }}
        >
          Cargando métricas…
        </div>
      ) : error ? (
        <div
          style={{
            background: "#fff3f3",
            border: "1px solid #ffd3d3",
            borderRadius: 16,
            padding: 18,
            color: "#b00020",
            fontWeight: 900,
          }}
        >
          ❌ {error}
          <div style={{ marginTop: 10, fontWeight: 600, color: "rgba(176,0,32,.9)" }}>
            Verifica que estás logueado como admin y que el backend esté corriendo.
          </div>
        </div>
      ) : data ? (
        <>
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 14,
            }}
          >
            <StatCard title="Órdenes totales" value={`${data.totalOrdenes}`} />
            <StatCard title="Pagadas" value={`${data.pagadas}`} hint="Orden confirmada" />
            <StatCard title="Pendientes" value={`${data.pendientes}`} hint="Esperando pago" />
            <StatCard title="Fallidas" value={`${data.fallidas}`} />
            <StatCard title="Reembolsadas" value={`${data.reembolsadas}`} />
            <StatCard title="Ingresos" value={money(data.totalIngresos)} />
            <StatCard title="Costo proveedor" value={money(data.totalCostoProveedor)} />
            <StatCard title="Ganancia" value={money(data.totalGanancia)} />
          </section>

          <section
            style={{
              background: "#fff",
              border: "1px solid rgba(0,0,0,.08)",
              borderRadius: 16,
              padding: 18,
              boxShadow: "0 6px 18px rgba(0,0,0,.06)",
              display: "grid",
              gap: 10,
              marginTop: 4,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 950 }}>Indicadores</div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span style={chipStyle}>
                % Pagadas:{" "}
                <b>{derived ? `${derived.paidRate.toFixed(1)}%` : "0%"}</b>
              </span>
              <span style={chipStyle}>
                Margen:{" "}
                <b>{derived ? `${derived.margin.toFixed(1)}%` : "0%"}</b>
              </span>
            </div>

            <div style={{ fontSize: 12, color: "rgba(0,0,0,.55)" }}>
              Estas métricas vienen de tu backend (aggregate). Si quieres, luego agregamos métricas por día/semana.
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}

const chipStyle: React.CSSProperties = {
  display: "inline-flex",
  gap: 6,
  alignItems: "center",
  padding: "8px 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,.08)",
  background: "rgba(0,0,0,.04)",
  fontSize: 13,
  fontWeight: 700,
};