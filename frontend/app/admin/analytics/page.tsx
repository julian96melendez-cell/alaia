"use client";

import { OrdersChart, RevenueChart } from "@/components/admin/AnalyticsCharts";
import { api } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";

type OverviewResponse = {
  totalOrdenes: number;
  ingresosBrutos: number;
  totalCostoProveedor: number;
  totalGanancia: number;
  totalComisiones: number;
  totalNetoVendedores: number;
  pagadas: number;
  pendientes: number;
  fallidas: number;
  reembolsadas: number;
  payoutsPendientes: number;
  payoutsPagados: number;
  payoutsFallidos: number;
  payoutsBloqueados: number;
};

type SeriesRow = {
  date: string;
  totalOrdenes: number;
  ingresos: number;
  ganancia: number;
  pagadas: number;
  pendientes: number;
  fallidas: number;
};

type TopProductoRow = {
  productoId?: string;
  nombre: string;
  cantidadVendida: number;
  ingresos: number;
  ganancia: number;
};

type TopVendedorRow = {
  vendedorId?: string;
  nombre: string;
  email: string;
  montoTotal: number;
  payoutsCount: number;
  pagadosCount: number;
  pendientesCount: number;
  fallidosCount: number;
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

function percent(value: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function buildDateLabel(date?: string) {
  if (!date) return "—";

  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";

  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
  });
}

function normalizeOrdersSeries(rows: SeriesRow[] = []) {
  return rows.map((row) => ({
    label: buildDateLabel(row.date),
    value: Number(row.totalOrdenes || 0),
  }));
}

function normalizeRevenueSeries(rows: SeriesRow[] = []) {
  return rows.map((row) => ({
    label: buildDateLabel(row.date),
    value: Number(row.ingresos || 0),
  }));
}

function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneStyles =
    tone === "success"
      ? {
          background: "rgba(0,140,60,.06)",
          border: "1px solid rgba(0,140,60,.14)",
        }
      : tone === "warning"
      ? {
          background: "rgba(200,120,0,.07)",
          border: "1px solid rgba(200,120,0,.16)",
        }
      : tone === "danger"
      ? {
          background: "rgba(180,0,20,.06)",
          border: "1px solid rgba(180,0,20,.14)",
        }
      : {
          background: "#fff",
          border: "1px solid rgba(15,23,42,.08)",
        };

  return (
    <div
      style={{
        ...toneStyles,
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

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
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
        gap: 16,
      }}
    >
      <div style={{ display: "grid", gap: 6 }}>
        <h2
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 900,
            color: "#0f172a",
          }}
        >
          {title}
        </h2>

        {subtitle ? (
          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: "rgba(15,23,42,.65)",
              lineHeight: 1.6,
            }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>

      {children}
    </section>
  );
}

function MiniMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const color =
    tone === "success"
      ? "rgba(0,120,50,.95)"
      : tone === "warning"
      ? "rgba(160,90,0,.95)"
      : tone === "danger"
      ? "rgba(160,0,20,.95)"
      : "#0f172a";

  return (
    <div
      style={{
        padding: 14,
        borderRadius: 14,
        border: "1px solid rgba(15,23,42,.08)",
        background: "rgba(248,250,252,.9)",
        display: "grid",
        gap: 6,
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: "rgba(15,23,42,.55)",
          textTransform: "uppercase",
          letterSpacing: ".02em",
        }}
      >
        {label}
      </span>

      <strong
        style={{
          fontSize: 22,
          fontWeight: 900,
          color,
        }}
      >
        {value}
      </strong>
    </div>
  );
}

function ProgressRow({
  label,
  value,
  total,
  tone = "default",
}: {
  label: string;
  value: number;
  total: number;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const width = total > 0 ? `${Math.max(4, (value / total) * 100)}%` : "0%";

  const color =
    tone === "success"
      ? "linear-gradient(90deg, rgba(0,140,60,.85) 0%, rgba(0,120,50,.95) 100%)"
      : tone === "warning"
      ? "linear-gradient(90deg, rgba(200,120,0,.85) 0%, rgba(160,90,0,.95) 100%)"
      : tone === "danger"
      ? "linear-gradient(90deg, rgba(180,0,20,.85) 0%, rgba(160,0,20,.95) 100%)"
      : "linear-gradient(90deg, #0f172a 0%, #334155 100%)";

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          fontSize: 14,
          fontWeight: 700,
          color: "#0f172a",
        }}
      >
        <span>{label}</span>
        <span>
          {value} · {percent(value, total)}
        </span>
      </div>

      <div
        style={{
          width: "100%",
          height: 12,
          borderRadius: 999,
          background: "rgba(15,23,42,.08)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width,
            height: "100%",
            borderRadius: 999,
            background: color,
          }}
        />
      </div>
    </div>
  );
}

function SummaryItem({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gap: 4,
        padding: "12px 0",
        borderBottom: "1px solid rgba(15,23,42,.08)",
      }}
    >
      <span
        style={{
          fontSize: 14,
          fontWeight: 800,
          color: "#0f172a",
        }}
      >
        {title}
      </span>

      <span
        style={{
          fontSize: 13,
          color: "rgba(15,23,42,.64)",
          lineHeight: 1.6,
        }}
      >
        {subtitle}
      </span>
    </div>
  );
}

function DataTable({
  columns,
  rows,
}: {
  columns: Array<{ key: string; label: string; align?: "left" | "right" }>;
  rows: Array<Record<string, React.ReactNode>>;
}) {
  return (
    <div
      style={{
        width: "100%",
        overflowX: "auto",
        border: "1px solid rgba(15,23,42,.08)",
        borderRadius: 14,
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          minWidth: 640,
          background: "#fff",
        }}
      >
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  textAlign: col.align || "left",
                  fontSize: 12,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: ".02em",
                  color: "rgba(15,23,42,.58)",
                  padding: "14px 16px",
                  background: "rgba(248,250,252,.95)",
                  borderBottom: "1px solid rgba(15,23,42,.08)",
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                style={{
                  padding: 18,
                  fontSize: 14,
                  color: "rgba(15,23,42,.6)",
                }}
              >
                No hay datos disponibles.
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={index}>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      padding: "14px 16px",
                      borderBottom: "1px solid rgba(15,23,42,.08)",
                      fontSize: 14,
                      color: "#0f172a",
                      textAlign: col.align || "left",
                      verticalAlign: "top",
                    }}
                  >
                    {row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

const loadingBox: React.CSSProperties = {
  padding: 16,
  borderRadius: 14,
  background: "rgba(15,23,42,.03)",
  color: "rgba(15,23,42,.6)",
  fontWeight: 700,
};

export default function AdminAnalyticsPage() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [topProductos, setTopProductos] = useState<TopProductoRow[]>([]);
  const [topVendedores, setTopVendedores] = useState<TopVendedorRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadAnalytics() {
    setLoading(true);
    setError(null);

    try {
      const [overviewRes, seriesRes, topProductosRes, topVendedoresRes] =
        await Promise.all([
          api.get<OverviewResponse>("/api/admin/analytics/overview", {
            autoLogoutOn401: true,
          } as any),
          api.get<SeriesRow[]>("/api/admin/analytics/series", {
            autoLogoutOn401: true,
          } as any),
          api.get<TopProductoRow[]>("/api/admin/analytics/top-productos", {
            autoLogoutOn401: true,
          } as any),
          api.get<TopVendedorRow[]>("/api/admin/analytics/top-vendedores", {
            autoLogoutOn401: true,
          } as any),
        ]);

      if (!overviewRes.ok) {
        throw new Error(overviewRes.message || "No se pudo cargar el overview");
      }

      if (!seriesRes.ok) {
        throw new Error(seriesRes.message || "No se pudo cargar la serie");
      }

      if (!topProductosRes.ok) {
        throw new Error(
          topProductosRes.message || "No se pudo cargar top productos"
        );
      }

      if (!topVendedoresRes.ok) {
        throw new Error(
          topVendedoresRes.message || "No se pudo cargar top vendedores"
        );
      }

      setOverview(overviewRes.data || null);
      setSeries(seriesRes.data || []);
      setTopProductos(topProductosRes.data || []);
      setTopVendedores(topVendedoresRes.data || []);
    } catch (err: any) {
      setOverview(null);
      setSeries([]);
      setTopProductos([]);
      setTopVendedores([]);
      setError(err?.message || "No se pudieron cargar los analytics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAnalytics();
  }, []);

  const ordenes = useMemo(
    () => ({
      total: overview?.totalOrdenes || 0,
      pagadas: overview?.pagadas || 0,
      pendientes: overview?.pendientes || 0,
      fallidas: overview?.fallidas || 0,
      reembolsadas: overview?.reembolsadas || 0,
    }),
    [overview]
  );

  const ingresos = useMemo(
    () => ({
      total: overview?.ingresosBrutos || 0,
      ganancia: overview?.totalGanancia || 0,
      costoProveedor: overview?.totalCostoProveedor || 0,
      comisiones: overview?.totalComisiones || 0,
      netoVendedores: overview?.totalNetoVendedores || 0,
    }),
    [overview]
  );

  const payouts = useMemo(
    () => ({
      pendientes: overview?.payoutsPendientes || 0,
      pagados: overview?.payoutsPagados || 0,
      fallidos: overview?.payoutsFallidos || 0,
      bloqueados: overview?.payoutsBloqueados || 0,
      procesando: 0,
    }),
    [overview]
  );

  const ordenesPorDia = useMemo(() => normalizeOrdersSeries(series), [series]);
  const ingresosPorDia = useMemo(() => normalizeRevenueSeries(series), [series]);

  const totalPayoutRows =
    payouts.pendientes +
    payouts.procesando +
    payouts.pagados +
    payouts.fallidos +
    payouts.bloqueados;

  const topProductosRows = useMemo(
    () =>
      topProductos.map((p) => ({
        nombre: p.nombre || "Sin nombre",
        cantidadVendida: String(p.cantidadVendida || 0),
        ingresos: money(p.ingresos, "USD"),
        ganancia: money(p.ganancia, "USD"),
      })),
    [topProductos]
  );

  const topVendedoresRows = useMemo(
    () =>
      topVendedores.map((v) => ({
        nombre: v.nombre || "Sin nombre",
        email: v.email || "—",
        montoTotal: money(v.montoTotal, "USD"),
        payoutsCount: String(v.payoutsCount || 0),
        estado:
          `${v.pagadosCount || 0} pagado(s) · ` +
          `${v.pendientesCount || 0} pendiente(s) · ` +
          `${v.fallidosCount || 0} fallido(s)`,
      })),
    [topVendedores]
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
      }}
    >
      <div
        style={{
          maxWidth: 1320,
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
          <div style={{ maxWidth: 780 }}>
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
              Analytics · Panel Ejecutivo
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
              Analytics Administrativos
            </h1>

            <p
              style={{
                marginTop: 10,
                marginBottom: 0,
                fontSize: 15,
                lineHeight: 1.7,
                color: "rgba(15,23,42,.68)",
                maxWidth: 760,
              }}
            >
              Vista consolidada de órdenes, ingresos, ganancia y comportamiento de payouts
              para supervisar la salud operativa del negocio y del marketplace.
            </p>
          </div>

          <button
            onClick={() => void loadAnalytics()}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(15,23,42,.12)",
              background: "#fff",
              color: "#0f172a",
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {loading ? "Actualizando…" : "Recargar"}
          </button>
        </header>

        {error ? (
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
            {error}
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
            label="Órdenes totales"
            value={loading ? "—" : String(ordenes.total)}
            hint="Volumen completo procesado en el sistema"
          />
          <StatCard
            label="Ingresos"
            value={loading ? "—" : money(ingresos.total, "USD")}
            hint="Suma total consolidada de órdenes"
            tone="success"
          />
          <StatCard
            label="Ganancia"
            value={loading ? "—" : money(ingresos.ganancia, "USD")}
            hint="Ganancia estimada consolidada"
            tone="success"
          />
          <StatCard
            label="Payouts fallidos"
            value={loading ? "—" : String(payouts.fallidos)}
            hint="Transferencias con incidencia o necesidad de revisión"
            tone={payouts.fallidos > 0 ? "danger" : "default"}
          />
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 18,
          }}
        >
          <MiniMetric
            label="Órdenes pagadas"
            value={loading ? "—" : String(ordenes.pagadas)}
            tone="success"
          />
          <MiniMetric
            label="Órdenes pendientes"
            value={loading ? "—" : String(ordenes.pendientes)}
            tone="warning"
          />
          <MiniMetric
            label="Órdenes fallidas"
            value={loading ? "—" : String(ordenes.fallidas)}
            tone={ordenes.fallidas > 0 ? "danger" : "default"}
          />
          <MiniMetric
            label="Órdenes reembolsadas"
            value={loading ? "—" : String(ordenes.reembolsadas)}
            tone="warning"
          />
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
            gap: 18,
          }}
        >
          <Panel
            title="Órdenes por día"
            subtitle="Actividad diaria reciente del sistema"
          >
            {loading ? (
              <div style={loadingBox}>Cargando serie de órdenes…</div>
            ) : (
              <OrdersChart data={ordenesPorDia} />
            )}
          </Panel>

          <Panel
            title="Ingresos por día"
            subtitle="Comportamiento diario de ingresos"
          >
            {loading ? (
              <div style={loadingBox}>Cargando serie de ingresos…</div>
            ) : (
              <RevenueChart data={ingresosPorDia} />
            )}
          </Panel>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
            gap: 18,
          }}
        >
          <Panel
            title="Distribución de órdenes"
            subtitle="Estado actual del flujo comercial"
          >
            {loading ? (
              <div style={loadingBox}>Cargando estados de órdenes…</div>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                <ProgressRow
                  label="Pagadas"
                  value={ordenes.pagadas}
                  total={ordenes.total}
                  tone="success"
                />
                <ProgressRow
                  label="Pendientes"
                  value={ordenes.pendientes}
                  total={ordenes.total}
                  tone="warning"
                />
                <ProgressRow
                  label="Fallidas"
                  value={ordenes.fallidas}
                  total={ordenes.total}
                  tone="danger"
                />
                <ProgressRow
                  label="Reembolsadas"
                  value={ordenes.reembolsadas}
                  total={ordenes.total}
                  tone="warning"
                />
              </div>
            )}
          </Panel>

          <Panel
            title="Distribución de payouts"
            subtitle="Visibilidad operativa del marketplace"
          >
            {loading ? (
              <div style={loadingBox}>Cargando estados de payouts…</div>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                <ProgressRow
                  label="Pendientes"
                  value={payouts.pendientes}
                  total={totalPayoutRows}
                  tone="warning"
                />
                <ProgressRow
                  label="Procesando"
                  value={payouts.procesando}
                  total={totalPayoutRows}
                  tone="default"
                />
                <ProgressRow
                  label="Pagados"
                  value={payouts.pagados}
                  total={totalPayoutRows}
                  tone="success"
                />
                <ProgressRow
                  label="Fallidos"
                  value={payouts.fallidos}
                  total={totalPayoutRows}
                  tone="danger"
                />
                <ProgressRow
                  label="Bloqueados"
                  value={payouts.bloqueados}
                  total={totalPayoutRows}
                  tone="danger"
                />
              </div>
            )}
          </Panel>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
            gap: 18,
          }}
        >
          <Panel
            title="Top productos"
            subtitle="Productos con mejor rendimiento dentro del rango consultado"
          >
            {loading ? (
              <div style={loadingBox}>Cargando top productos…</div>
            ) : (
              <DataTable
                columns={[
                  { key: "nombre", label: "Producto" },
                  { key: "cantidadVendida", label: "Cantidad", align: "right" },
                  { key: "ingresos", label: "Ingresos", align: "right" },
                  { key: "ganancia", label: "Ganancia", align: "right" },
                ]}
                rows={topProductosRows}
              />
            )}
          </Panel>

          <Panel
            title="Top vendedores"
            subtitle="Vendedores más relevantes por volumen de payouts"
          >
            {loading ? (
              <div style={loadingBox}>Cargando top vendedores…</div>
            ) : (
              <DataTable
                columns={[
                  { key: "nombre", label: "Vendedor" },
                  { key: "email", label: "Email" },
                  { key: "montoTotal", label: "Monto total", align: "right" },
                  { key: "payoutsCount", label: "Payouts", align: "right" },
                  { key: "estado", label: "Estado" },
                ]}
                rows={topVendedoresRows}
              />
            )}
          </Panel>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 18,
          }}
        >
          <Panel
            title="Lectura ejecutiva"
            subtitle="Resumen rápido para decisiones operativas"
          >
            <div style={{ display: "grid", gap: 12 }}>
              <SummaryItem
                title="Negocio"
                subtitle={
                  loading
                    ? "Cargando resumen…"
                    : `${ordenes.pagadas} órdenes pagadas y ${money(
                        ingresos.total,
                        "USD"
                      )} en ingresos consolidados.`
                }
              />
              <SummaryItem
                title="Marketplace"
                subtitle={
                  loading
                    ? "Cargando resumen…"
                    : `${payouts.pagados} payout(s) pagados, ${payouts.pendientes} pendiente(s) y ${payouts.fallidos} fallido(s).`
                }
              />
              <SummaryItem
                title="Margen y comisiones"
                subtitle={
                  loading
                    ? "Cargando resumen…"
                    : `Ganancia total ${money(
                        ingresos.ganancia,
                        "USD"
                      )}, comisiones ${money(
                        ingresos.comisiones,
                        "USD"
                      )} y neto vendedores ${money(
                        ingresos.netoVendedores,
                        "USD"
                      )}.`
                }
              />
              <SummaryItem
                title="Riesgo operativo"
                subtitle={
                  loading
                    ? "Cargando resumen…"
                    : payouts.fallidos > 0 || payouts.bloqueados > 0
                    ? `Hay incidencias en payouts: ${payouts.fallidos} fallido(s) y ${payouts.bloqueados} bloqueado(s).`
                    : "Sin alertas relevantes en payouts."
                }
              />
            </div>
          </Panel>

          <Panel
            title="Notas del panel"
            subtitle="Referencias rápidas del estado actual"
          >
            <div style={{ display: "grid", gap: 12 }}>
              <SummaryItem
                title="Fuente de verdad"
                subtitle="Los datos se obtienen desde el backend administrativo y agregaciones reales de MongoDB."
              />
              <SummaryItem
                title="Horizonte reciente"
                subtitle="Las series diarias representan la actividad reciente del sistema según las fechas de creación de órdenes."
              />
              <SummaryItem
                title="Visión marketplace"
                subtitle="Este panel combina ingresos, ganancia, comisiones y payouts para que veas la operación completa."
              />
            </div>
          </Panel>
        </section>
      </div>
    </main>
  );
}