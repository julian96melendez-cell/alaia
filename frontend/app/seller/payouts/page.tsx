"use client";

import { api } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";

type Payout = {
  _id?: string;
  ordenId?: string;
  monto?: number;
  status?: "pendiente" | "procesando" | "pagado" | "fallido" | "bloqueado";
  createdAt?: string;
};

function money(n: unknown, currency = "USD") {
  const amount = Number(n || 0);

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount);
  } catch {
    return `$${amount}`;
  }
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-ES");
}

function Badge({ status }: { status?: string }) {
  let bg = "#e2e8f0";
  let color = "#334155";

  if (status === "pagado") {
    bg = "#dcfce7";
    color = "#166534";
  }

  if (status === "pendiente") {
    bg = "#fef9c3";
    color = "#854d0e";
  }

  if (status === "procesando") {
    bg = "#e0f2fe";
    color = "#075985";
  }

  if (status === "fallido") {
    bg = "#fee2e2";
    color = "#991b1b";
  }

  if (status === "bloqueado") {
    bg = "#f1f5f9";
    color = "#475569";
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
      {status || "—"}
    </span>
  );
}

export default function SellerPayoutsPage() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadPayouts() {
    setLoading(true);
    setError(null);

    try {
      // Endpoint esperado:
      // GET /api/seller/payouts
      const res = await api.get<Payout[]>("/api/seller/payouts", {
        autoLogoutOn401: true,
      } as any);

      if (!res.ok) {
        throw new Error(res.message || "Error cargando payouts");
      }

      setPayouts(res.data || []);
    } catch (err: any) {
      setPayouts([]);
      setError(
        err?.message ||
          "Pantalla lista, pero el endpoint de payouts aún no está conectado."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPayouts();
  }, []);

  const stats = useMemo(() => {
    return {
      total: payouts.length,
      pendientes: payouts.filter((p) => p.status === "pendiente").length,
      procesando: payouts.filter((p) => p.status === "procesando").length,
      pagados: payouts.filter((p) => p.status === "pagado").length,
      fallidos: payouts.filter((p) => p.status === "fallido").length,
      bloqueados: payouts.filter((p) => p.status === "bloqueado").length,
      totalMonto: payouts.reduce((acc, p) => acc + Number(p.monto || 0), 0),
    };
  }, [payouts]);

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
          <h1 style={{ margin: 0 }}>Mis payouts</h1>
          <p style={{ color: "#64748b" }}>
            Controla tus ingresos y pagos procesados por Stripe
          </p>

          <button onClick={() => loadPayouts()}>
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

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          <Stat label="Total" value={stats.total} />
          <Stat label="Pendientes" value={stats.pendientes} />
          <Stat label="Procesando" value={stats.procesando} />
          <Stat label="Pagados" value={stats.pagados} />
          <Stat label="Fallidos" value={stats.fallidos} />
          <Stat label="Bloqueados" value={stats.bloqueados} />
          <Stat label="Total $" value={money(stats.totalMonto)} />
        </section>

        {loading ? (
          <div>Cargando payouts…</div>
        ) : payouts.length === 0 ? (
          <div>No tienes payouts todavía</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {payouts.map((p) => (
              <div
                key={p._id}
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
                  <strong>Payout #{p._id?.slice(-6)}</strong>
                  <span>{formatDate(p.createdAt)}</span>
                </div>

                <Badge status={p.status} />

                <strong>{money(p.monto)}</strong>

                {p.ordenId && (
                  <span style={{ fontSize: 13, color: "#64748b" }}>
                    Orden: #{p.ordenId.slice(-6)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
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
      <strong style={{ fontSize: 18 }}>{value}</strong>
    </div>
  );
}