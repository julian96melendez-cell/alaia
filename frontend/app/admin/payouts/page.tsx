"use client";

import { api } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";

type PayoutRow = {
  ordenId: string;
  orderNumber?: number;
  estadoPago: string;
  estadoFulfillment: string;
  payoutPolicy?: string;
  payoutEligibleAt?: string | null;
  payoutReleasedAt?: string | null;
  payoutBlocked?: boolean;
  payoutBlockedReason?: string;
  moneda?: string;
  createdAt?: string;
  updatedAt?: string;
  vendedor?: {
    _id?: string;
    nombre?: string;
    email?: string;
  };
  payout: {
    monto: number;
    status: "pendiente" | "procesando" | "pagado" | "fallido" | "bloqueado";
    stripeAccountId?: string;
    stripeTransferId?: string;
    stripeTransferGroup?: string;
    processingAt?: string | null;
    paidAt?: string | null;
    failedAt?: string | null;
    meta?: any;
  };
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

type PayoutDetail = {
  ordenId: string;
  orderNumber?: number;
  estadoPago: string;
  estadoFulfillment: string;
  payoutPolicy?: string;
  payoutEligibleAt?: string | null;
  payoutReleasedAt?: string | null;
  payoutBlocked?: boolean;
  payoutBlockedReason?: string;
  moneda?: string;
  total?: number;
  comisionTotal?: number;
  ingresoVendedorTotal?: number;
  usuario?: {
    nombre?: string;
    email?: string;
    rol?: string;
  } | null;
  vendedorPayouts?: Array<{
    vendedor?: {
      _id?: string;
      nombre?: string;
      email?: string;
      rol?: string;
    } | string;
    stripeAccountId?: string;
    monto?: number;
    status?: string;
    stripeTransferId?: string;
    stripeTransferGroup?: string;
    processingAt?: string | null;
    paidAt?: string | null;
    failedAt?: string | null;
    meta?: any;
  }>;
  historial?: Array<{
    estado?: string;
    fecha?: string;
    source?: string;
    meta?: any;
  }>;
};

function money(n: unknown, currency = "USD") {
  const amount = Number(n || 0);
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: String(currency || "USD").toUpperCase(),
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function formatDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
}

function statusTone(status?: string) {
  const s = String(status || "").toLowerCase();

  if (s === "pagado") return badgeSuccess;
  if (s === "procesando") return badgeInfo;
  if (s === "pendiente") return badgeWarning;
  if (s === "fallido" || s === "bloqueado") return badgeDanger;

  return badgeNeutral;
}

function payoutStateText(row: PayoutRow) {
  if (row.payoutBlocked) return "Bloqueado";
  return row.payout?.status || "—";
}

function canRetry(row: PayoutRow) {
  if (row.payoutBlocked) return false;
  return ["pendiente", "fallido"].includes(String(row.payout?.status || "").toLowerCase());
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
    <div style={statCard}>
      <div style={statLabel}>{label}</div>
      <div style={statValue}>{value}</div>
      <div style={statHint}>{hint}</div>
    </div>
  );
}

function FilterChip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...chip,
        ...(active ? chipActive : null),
      }}
    >
      {children}
    </button>
  );
}

export default function AdminPayoutsPage() {
  const [loading, setLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);

  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [metrics, setMetrics] = useState<PayoutMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("createdAt_desc");
  const [onlyEligible, setOnlyEligible] = useState(false);
  const [onlyReleased, setOnlyReleased] = useState(false);

  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<PayoutDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  async function loadMetrics() {
    setMetricsLoading(true);
    try {
      const res = await api.get<PayoutMetrics>("/api/admin/payouts/metrics", {
        autoLogoutOn401: true,
      } as any);

      if (!res.ok) {
        setMetrics(null);
        return;
      }

      setMetrics(res.data || null);
    } catch {
      setMetrics(null);
    } finally {
      setMetricsLoading(false);
    }
  }

  async function loadRows(nextPage = page) {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("page", String(nextPage));
      params.set("limit", "20");
      params.set("status", status);
      params.set("sort", sort);
      if (q.trim()) params.set("q", q.trim());
      if (onlyEligible) params.set("onlyEligible", "true");
      if (onlyReleased) params.set("onlyReleased", "true");

      const res = await api.get<PayoutRow[]>(
        `/api/admin/payouts?${params.toString()}`,
        {
          autoLogoutOn401: true,
        } as any
      );

      if (!res.ok) {
        setRows([]);
        setError(res.message || "No se pudieron cargar los payouts");
        return;
      }

      const meta: any = (res as any).meta || (res as any).pagination || null;
      const responseAny: any = res;

      setRows(Array.isArray(res.data) ? res.data : []);
      setPages(
        Number(meta?.pages || responseAny?.meta?.pages || 1) > 0
          ? Number(meta?.pages || responseAny?.meta?.pages || 1)
          : 1
      );
      setPage(nextPage);
    } catch (err: any) {
      setRows([]);
      setError(err?.message || "No se pudieron cargar los payouts");
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(ordenId: string) {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);

    try {
      const res = await api.get<PayoutDetail>(`/api/admin/payouts/${ordenId}`, {
        autoLogoutOn401: true,
      } as any);

      if (!res.ok) {
        setDetail(null);
        return;
      }

      setDetail(res.data || null);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function retryPayout(row: PayoutRow) {
    if (!canRetry(row) || retrying) return;

    const okConfirm = window.confirm(
      `¿Reintentar payout de la orden ${row.orderNumber || row.ordenId}?`
    );
    if (!okConfirm) return;

    setRetrying(row.ordenId);

    try {
      const res = await api.post(
        `/api/admin/payouts/${row.ordenId}/retry`,
        row.vendedor?._id ? { vendedorId: row.vendedor._id } : {},
        {
          autoLogoutOn401: true,
        } as any
      );

      if (!res.ok) {
        setError(res.message || "No se pudo reintentar el payout");
        return;
      }

      await Promise.all([loadRows(page), loadMetrics()]);

      if (detailOpen && detail?.ordenId === row.ordenId) {
        await openDetail(row.ordenId);
      }
    } catch (err: any) {
      setError(err?.message || "No se pudo reintentar el payout");
    } finally {
      setRetrying(null);
    }
  }

  useEffect(() => {
    void loadMetrics();
  }, []);

  useEffect(() => {
    void loadRows(1);
  }, [q, status, sort, onlyEligible, onlyReleased]);

  const summary = useMemo(() => {
    return {
      totalRows: metrics?.totalRows || 0,
      totalMonto: metrics?.totalMonto || 0,
      pendientes: metrics?.pendientes || 0,
      pagados: metrics?.pagados || 0,
      fallidos: metrics?.fallidos || 0,
    };
  }, [metrics]);

  return (
    <main style={layout}>
      <header style={header}>
        <div>
          <h1 style={title}>Admin · Payouts</h1>
          <p style={subtitle}>
            Supervisa payouts retenidos, procesados, fallidos y liberados a vendedores.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => {
              void Promise.all([loadMetrics(), loadRows(page)]);
            }}
            style={buttonOutline}
          >
            Recargar
          </button>
        </div>
      </header>

      <section style={statsGrid}>
        <StatCard
          label="Total payouts"
          value={metricsLoading ? "—" : String(summary.totalRows)}
          hint="Rows por vendedor"
        />
        <StatCard
          label="Monto total"
          value={metricsLoading ? "—" : money(summary.totalMonto, "USD")}
          hint="Suma acumulada"
        />
        <StatCard
          label="Pendientes"
          value={metricsLoading ? "—" : String(summary.pendientes)}
          hint="Esperando liberación"
        />
        <StatCard
          label="Pagados"
          value={metricsLoading ? "—" : String(summary.pagados)}
          hint="Transferencias completadas"
        />
        <StatCard
          label="Fallidos"
          value={metricsLoading ? "—" : String(summary.fallidos)}
          hint="Requieren revisión"
        />
      </section>

      <section style={card}>
        <div style={toolbarTop}>
          <div style={{ display: "grid", gap: 8, flex: 1 }}>
            <div style={sectionTitle}>Filtros</div>

            <div style={searchRow}>
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Buscar por orden, vendedor, email, transferId…"
                style={input}
              />
              <button
                onClick={() => setQ(searchInput)}
                style={buttonPrimary}
              >
                Buscar
              </button>
            </div>
          </div>
        </div>

        <div style={filtersWrap}>
          <div style={filtersBlock}>
            <Label>Estado</Label>
            <div style={chipsRow}>
              {["all", "pendiente", "procesando", "pagado", "fallido", "bloqueado"].map(
                (s) => (
                  <FilterChip
                    key={s}
                    active={status === s}
                    onClick={() => {
                      setStatus(s);
                      setPage(1);
                    }}
                  >
                    {s}
                  </FilterChip>
                )
              )}
            </div>
          </div>

          <div style={filtersBlock}>
            <Label>Vista rápida</Label>
            <div style={chipsRow}>
              <FilterChip
                active={onlyEligible}
                onClick={() => {
                  setOnlyEligible((v) => !v);
                  setPage(1);
                }}
              >
                Solo elegibles
              </FilterChip>

              <FilterChip
                active={onlyReleased}
                onClick={() => {
                  setOnlyReleased((v) => !v);
                  setPage(1);
                }}
              >
                Solo liberados
              </FilterChip>
            </div>
          </div>

          <div style={filtersBlock}>
            <Label>Orden</Label>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              style={select}
            >
              <option value="createdAt_desc">Más recientes</option>
              <option value="createdAt_asc">Más antiguos</option>
              <option value="monto_desc">Monto mayor</option>
              <option value="monto_asc">Monto menor</option>
              <option value="eligibleAt_desc">Elegible más reciente</option>
              <option value="eligibleAt_asc">Elegible más antigua</option>
            </select>
          </div>
        </div>
      </section>

      <section style={card}>
        <div style={sectionHeader}>
          <h2 style={sectionTitle}>Payouts</h2>
          <div style={counter}>{rows.length} en esta página</div>
        </div>

        {loading ? (
          <div style={emptyBox}>Cargando payouts…</div>
        ) : error ? (
          <div style={errorBox}>{error}</div>
        ) : rows.length === 0 ? (
          <div style={emptyBox}>No hay payouts para esos filtros.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {rows.map((row) => (
              <div key={`${row.ordenId}-${row.vendedor?._id || "vendor"}`} style={rowCard}>
                <div style={rowHeader}>
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={badgeNeutral}>
                        Orden #{row.orderNumber || "—"}
                      </span>

                      <span style={statusTone(payoutStateText(row))}>
                        {payoutStateText(row)}
                      </span>

                      {row.payoutReleasedAt ? (
                        <span style={badgeSuccess}>Liberado</span>
                      ) : null}

                      {row.payoutBlocked ? (
                        <span style={badgeDanger}>Bloqueado</span>
                      ) : null}
                    </div>

                    <div style={vendorTitle}>
                      {row.vendedor?.nombre || "Vendedor sin nombre"}
                    </div>

                    <div style={mutedText}>
                      {row.vendedor?.email || "Sin email"} · {row.ordenId}
                    </div>
                  </div>

                  <div style={amountBox}>
                    {money(row.payout?.monto, row.moneda || "USD")}
                  </div>
                </div>

                <div style={rowGrid}>
                  <Info label="Estado pago" value={row.estadoPago} />
                  <Info label="Fulfillment" value={row.estadoFulfillment} />
                  <Info label="Elegible desde" value={formatDate(row.payoutEligibleAt)} />
                  <Info label="Pagado at" value={formatDate(row.payout?.paidAt)} />
                  <Info
                    label="Stripe account"
                    value={row.payout?.stripeAccountId || "—"}
                    mono
                  />
                  <Info
                    label="Transfer ID"
                    value={row.payout?.stripeTransferId || "—"}
                    mono
                  />
                </div>

                {row.payoutBlocked && row.payoutBlockedReason ? (
                  <div style={warnBox}>
                    Bloqueado: {row.payoutBlockedReason}
                  </div>
                ) : null}

                <div style={rowActions}>
                  <button
                    onClick={() => void openDetail(row.ordenId)}
                    style={buttonOutline}
                  >
                    Ver detalle
                  </button>

                  <button
                    onClick={() => void retryPayout(row)}
                    disabled={!canRetry(row) || retrying === row.ordenId}
                    style={{
                      ...buttonPrimary,
                      opacity:
                        !canRetry(row) || retrying === row.ordenId ? 0.55 : 1,
                    }}
                  >
                    {retrying === row.ordenId ? "Reintentando…" : "Reintentar payout"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={pagination}>
          <button
            onClick={() => void loadRows(Math.max(1, page - 1))}
            disabled={page <= 1 || loading}
            style={buttonOutline}
          >
            ← Anterior
          </button>

          <div style={pageText}>
            Página {page} de {pages}
          </div>

          <button
            onClick={() => void loadRows(Math.min(pages, page + 1))}
            disabled={page >= pages || loading}
            style={buttonOutline}
          >
            Siguiente →
          </button>
        </div>
      </section>

      {detailOpen ? (
        <div style={overlay} onClick={() => setDetailOpen(false)}>
          <div style={drawer} onClick={(e) => e.stopPropagation()}>
            <div style={drawerHeader}>
              <div>
                <div style={sectionTitle}>Detalle payout</div>
                <div style={mutedText}>
                  {detail?.orderNumber ? `Orden #${detail.orderNumber}` : "Cargando…"}
                </div>
              </div>

              <button onClick={() => setDetailOpen(false)} style={buttonOutline}>
                Cerrar
              </button>
            </div>

            {detailLoading ? (
              <div style={emptyBox}>Cargando detalle…</div>
            ) : !detail ? (
              <div style={emptyBox}>No se pudo cargar el detalle.</div>
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
                <div style={detailGrid}>
                  <Info label="Orden ID" value={detail.ordenId} mono />
                  <Info label="Estado pago" value={detail.estadoPago} />
                  <Info label="Fulfillment" value={detail.estadoFulfillment} />
                  <Info label="Moneda" value={detail.moneda || "—"} />
                  <Info label="Total orden" value={money(detail.total, detail.moneda || "USD")} />
                  <Info
                    label="Payout eligible"
                    value={formatDate(detail.payoutEligibleAt)}
                  />
                </div>

                {detail.payoutBlocked ? (
                  <div style={errorBox}>
                    Payout bloqueado: {detail.payoutBlockedReason || "Sin motivo"}
                  </div>
                ) : null}

                <div style={subsection}>
                  <div style={sectionTitle}>Vendedor payouts</div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {(detail.vendedorPayouts || []).map((p, idx) => {
                      const vendedor =
                        typeof p.vendedor === "object" ? p.vendedor : null;

                      return (
                        <div key={idx} style={miniCard}>
                          <div style={miniHeader}>
                            <div>
                              <div style={vendorTitle}>
                                {vendedor?.nombre || "Vendedor"}
                              </div>
                              <div style={mutedText}>
                                {vendedor?.email || "Sin email"}
                              </div>
                            </div>

                            <span style={statusTone(p.status)}>{p.status || "—"}</span>
                          </div>

                          <div style={detailGrid}>
                            <Info
                              label="Monto"
                              value={money(p.monto, detail.moneda || "USD")}
                            />
                            <Info label="Stripe account" value={p.stripeAccountId || "—"} mono />
                            <Info label="Transfer ID" value={p.stripeTransferId || "—"} mono />
                            <Info label="Transfer Group" value={p.stripeTransferGroup || "—"} mono />
                            <Info label="Processing" value={formatDate(p.processingAt)} />
                            <Info label="Paid" value={formatDate(p.paidAt)} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={subsection}>
                  <div style={sectionTitle}>Historial reciente</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {(detail.historial || []).slice().reverse().map((h, idx) => (
                      <div key={idx} style={historyRow}>
                        <div style={{ fontWeight: 800 }}>{h.estado || "—"}</div>
                        <div style={mutedText}>{formatDate(h.fecha)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={labelStyle}>{children}</div>;
}

function Info({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <div
        style={{
          ...infoValue,
          fontFamily: mono ? "monospace" : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}

const layout: React.CSSProperties = {
  maxWidth: 1280,
  margin: "0 auto",
  padding: 24,
  display: "grid",
  gap: 20,
};

const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  flexWrap: "wrap",
};

const title: React.CSSProperties = {
  fontSize: 30,
  fontWeight: 900,
  margin: 0,
};

const subtitle: React.CSSProperties = {
  marginTop: 8,
  marginBottom: 0,
  color: "rgba(0,0,0,.65)",
  fontSize: 14,
  lineHeight: 1.6,
};

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(0,0,0,.08)",
  borderRadius: 18,
  padding: 20,
  boxShadow: "0 8px 22px rgba(0,0,0,.05)",
};

const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 14,
};

const statCard: React.CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(0,0,0,.08)",
  borderRadius: 18,
  padding: 18,
  boxShadow: "0 8px 22px rgba(0,0,0,.05)",
  display: "grid",
  gap: 8,
};

const statLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(0,0,0,.55)",
  textTransform: "uppercase",
  letterSpacing: ".03em",
};

const statValue: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 950,
};

const statHint: React.CSSProperties = {
  fontSize: 13,
  color: "rgba(0,0,0,.6)",
};

const toolbarTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  flexWrap: "wrap",
};

const sectionHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
  marginBottom: 14,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
  margin: 0,
};

const searchRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const filtersWrap: React.CSSProperties = {
  display: "grid",
  gap: 14,
  marginTop: 16,
};

const filtersBlock: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const chipsRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const chip: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,.10)",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 13,
};

const chipActive: React.CSSProperties = {
  background: "rgba(0,0,0,.92)",
  color: "#fff",
  border: "1px solid rgba(0,0,0,.92)",
};

const input: React.CSSProperties = {
  flex: 1,
  minWidth: 240,
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,.12)",
};

const select: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,.12)",
  background: "#fff",
  minWidth: 220,
};

const counter: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(0,0,0,.05)",
  fontWeight: 800,
  fontSize: 12,
};

const rowCard: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,.08)",
  borderRadius: 16,
  padding: 16,
  display: "grid",
  gap: 14,
};

const rowHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "flex-start",
};

const amountBox: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 950,
  whiteSpace: "nowrap",
};

const vendorTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 900,
};

const mutedText: React.CSSProperties = {
  fontSize: 13,
  color: "rgba(0,0,0,.58)",
};

const rowGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const rowActions: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const pagination: React.CSSProperties = {
  marginTop: 18,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const pageText: React.CSSProperties = {
  fontWeight: 800,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(0,0,0,.58)",
  marginBottom: 6,
};

const infoValue: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
};

const emptyBox: React.CSSProperties = {
  padding: 18,
  borderRadius: 14,
  background: "rgba(0,0,0,.03)",
  color: "rgba(0,0,0,.68)",
  fontWeight: 700,
};

const warnBox: React.CSSProperties = {
  background: "rgba(200,120,0,.10)",
  border: "1px solid rgba(200,120,0,.20)",
  color: "rgba(160,90,0,.95)",
  padding: 12,
  borderRadius: 12,
  fontWeight: 800,
};

const errorBox: React.CSSProperties = {
  background: "#fff3f3",
  border: "1px solid #ffd3d3",
  color: "#b00020",
  padding: 14,
  borderRadius: 12,
  fontWeight: 800,
};

const buttonPrimary: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "none",
  background: "#111827",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const buttonOutline: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,.12)",
  background: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const badgeNeutral: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  background: "rgba(0,0,0,.05)",
  border: "1px solid rgba(0,0,0,.10)",
};

const badgeSuccess: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  background: "rgba(0,140,60,.08)",
  color: "rgba(0,120,50,.95)",
  border: "1px solid rgba(0,140,60,.18)",
};

const badgeWarning: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  background: "rgba(200,120,0,.10)",
  color: "rgba(160,90,0,.95)",
  border: "1px solid rgba(200,120,0,.20)",
};

const badgeDanger: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  background: "rgba(180,0,20,.08)",
  color: "rgba(160,0,20,.95)",
  border: "1px solid rgba(180,0,20,.18)",
};

const badgeInfo: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  background: "rgba(0,90,200,.08)",
  color: "rgba(0,80,170,.95)",
  border: "1px solid rgba(0,90,200,.18)",
};

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.45)",
  display: "grid",
  placeItems: "center",
  zIndex: 1000,
  padding: 20,
};

const drawer: React.CSSProperties = {
  width: "min(980px, 100%)",
  maxHeight: "90vh",
  overflowY: "auto",
  background: "#fff",
  borderRadius: 18,
  padding: 20,
  boxShadow: "0 20px 50px rgba(0,0,0,.20)",
  display: "grid",
  gap: 16,
};

const drawerHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const detailGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const subsection: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const miniCard: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,.08)",
  borderRadius: 14,
  padding: 14,
  display: "grid",
  gap: 12,
};

const miniHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
};

const historyRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 0",
  borderBottom: "1px solid rgba(0,0,0,.06)",
};