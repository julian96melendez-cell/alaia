"use client";

import { api } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";

type Orden = {
  _id: string;
  total: number;
  moneda?: string;
  estadoPago: string;
  estadoFulfillment: string;
  createdAt: string;
};

function money(n: unknown, currency = "USD") {
  const amount = Number(n || 0);

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: String(currency || "USD").toUpperCase(),
    }).format(amount);
  } catch {
    return `$${amount}`;
  }
}

function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleDateString("es-ES");
}

function Badge({ value }: { value: string }) {
  let bg = "#e2e8f0";
  let color = "#334155";

  if (value === "pagado") {
    bg = "#dcfce7";
    color = "#166534";
  }

  if (value === "pendiente") {
    bg = "#fef9c3";
    color = "#854d0e";
  }

  if (value === "fallido") {
    bg = "#fee2e2";
    color = "#991b1b";
  }

  if (value === "entregado") {
    bg = "#dcfce7";
    color = "#166534";
  }

  return (
    <span
      style={{
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        background: bg,
        color,
      }}
    >
      {value}
    </span>
  );
}

export default function SellerOrdenesPage() {
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadOrdenes() {
    setLoading(true);
    setError(null);

    try {
      // Endpoint futuro:
      // GET /api/seller/ordenes
      const res = await api.get<Orden[]>("/api/seller/ordenes", {
        autoLogoutOn401: true,
      } as any);

      if (!res.ok) {
        throw new Error(res.message || "Error cargando órdenes");
      }

      setOrdenes(res.data || []);
    } catch (err: any) {
      setOrdenes([]);
      setError(
        err?.message ||
          "Pantalla lista, pero el endpoint de órdenes aún no está conectado."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrdenes();
  }, []);

  const stats = useMemo(() => {
    return {
      total: ordenes.length,
      pagadas: ordenes.filter((o) => o.estadoPago === "pagado").length,
      pendientes: ordenes.filter((o) => o.estadoPago === "pendiente").length,
    };
  }, [ordenes]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f1f5f9",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gap: 24 }}>
        <header
          style={{
            background: "#fff",
            padding: 24,
            borderRadius: 20,
            border: "1px solid #e5e7eb",
          }}
        >
          <h1 style={{ margin: 0 }}>Mis órdenes</h1>
          <p style={{ color: "#64748b" }}>
            Revisa tus ventas y estado de pagos
          </p>

          <button onClick={() => loadOrdenes()}>
            {loading ? "Actualizando…" : "Recargar"}
          </button>
        </header>

        {error && (
          <div
            style={{
              background: "#fff3cd",
              padding: 12,
              borderRadius: 10,
              color: "#92400e",
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        )}

        <section style={{ display: "flex", gap: 16 }}>
          <Stat label="Total" value={stats.total} />
          <Stat label="Pagadas" value={stats.pagadas} />
          <Stat label="Pendientes" value={stats.pendientes} />
        </section>

        {loading ? (
          <div>Cargando órdenes…</div>
        ) : ordenes.length === 0 ? (
          <div>No hay órdenes todavía</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {ordenes.map((o) => (
              <div
                key={o._id}
                style={{
                  background: "#fff",
                  padding: 16,
                  borderRadius: 14,
                  border: "1px solid #e5e7eb",
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>Orden #{o._id.slice(-6)}</strong>
                  <span>{formatDate(o.createdAt)}</span>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <Badge value={o.estadoPago} />
                  <Badge value={o.estadoFulfillment} />
                </div>

                <div>
                  <strong>{money(o.total, o.moneda)}</strong>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        background: "#fff",
        padding: 16,
        borderRadius: 12,
        border: "1px solid #e5e7eb",
      }}
    >
      <div style={{ fontSize: 12, color: "#64748b" }}>{label}</div>
      <strong style={{ fontSize: 20 }}>{value}</strong>
    </div>
  );
}