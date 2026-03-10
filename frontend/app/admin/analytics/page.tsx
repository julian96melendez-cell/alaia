"use client";

import { api } from "@/lib/api";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

type AnalyticsRow = {
  fecha: string;
  ingresos: number;
  ordenes: number;
};

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const res = await api.get<AnalyticsRow[]>("/api/admin/analytics", {
        autoLogoutOn401: true,
      } as any);

      if (!res.ok) {
        setData([]);
        setError(res.message || "No se pudieron cargar las métricas.");
        setLoading(false);
        return;
      }

      setData(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      console.error("ANALYTICS PAGE ERROR:", err);
      setData([]);
      setError(err?.message || "Error cargando analytics.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <main style={layout}>
      <div style={header}>
        <h1 style={title}>Analytics</h1>

        <button type="button" onClick={load} style={buttonOutline}>
          Recargar
        </button>
      </div>

      {loading ? (
        <div style={card}>Cargando analytics…</div>
      ) : error ? (
        <div style={errorBox}>{error}</div>
      ) : data.length === 0 ? (
        <div style={card}>No hay datos para mostrar.</div>
      ) : (
        <>
          <section style={card}>
            <h2 style={sectionTitle}>Ingresos por día</h2>

            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="fecha" />
                  <YAxis />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="ingresos"
                    stroke="#111111"
                    strokeWidth={3}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section style={card}>
            <h2 style={sectionTitle}>Órdenes por día</h2>

            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="fecha" />
                  <YAxis />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="ordenes"
                    stroke="#2563eb"
                    strokeWidth={3}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

const layout: CSSProperties = {
  maxWidth: 1100,
  margin: "0 auto",
  padding: 24,
  display: "grid",
  gap: 20,
};

const header: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const title: CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
  margin: 0,
};

const sectionTitle: CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
  margin: "0 0 16px 0",
};

const card: CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(0,0,0,.08)",
  borderRadius: 16,
  padding: 20,
  boxShadow: "0 6px 18px rgba(0,0,0,.06)",
};

const buttonOutline: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,.12)",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 700,
};

const errorBox: CSSProperties = {
  background: "#fff3f3",
  border: "1px solid #ffd3d3",
  padding: 12,
  borderRadius: 12,
  color: "#b00020",
  fontWeight: 700,
};