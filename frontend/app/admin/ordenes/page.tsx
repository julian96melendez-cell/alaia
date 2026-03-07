"use client";

/**
 * ======================================================
 * AdminOrdenesPage — ENTERPRISE MAX (FINAL)
 * ======================================================
 * ✅ Server-side pagination + filters + sort + search
 * ✅ Debounced search (pro)
 * ✅ Auto refresh toggle
 * ✅ Admin metrics (/metrics)
 * ✅ Update estadoPago + estadoFulfillment (PUT admin)
 * ✅ Optimistic UI + rollback
 * ✅ AbortController anti memory leak
 * ✅ Export CSV
 * ✅ UX pro: skeletons + banners + badges + actions
 * ======================================================
 */

import { api } from "@/lib/api";
import type { Orden } from "@/lib/types";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

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

type ListMeta = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

type AdminListResponse<T> = {
  ok: boolean;
  message?: string;
  data?: T;
  meta?: ListMeta;
};

type AdminMetricsResponse = {
  ok: boolean;
  message?: string;
  data?: Metrics;
};

type UpdateEstadoBody = {
  estadoPago?: "pendiente" | "pagado" | "fallido" | "reembolsado";
  estadoFulfillment?: "pendiente" | "procesando" | "enviado" | "entregado" | "cancelado";
};

const PAGO_OPTS = ["pendiente", "pagado", "fallido", "reembolsado"] as const;
const FUL_OPTS = ["pendiente", "procesando", "enviado", "entregado", "cancelado"] as const;

function safeLower(v: any) {
  return String(v || "").trim().toLowerCase();
}

function money(n: any) {
  const x = Number(n || 0);
  return Number.isFinite(x) ? x.toFixed(2) : "0.00";
}

function fmtNumber(n: any) {
  const x = Number(n || 0);
  return Number.isFinite(x) ? x.toLocaleString() : "0";
}

function getPagoTone(estadoPago: string) {
  const s = safeLower(estadoPago);
  if (s === "pagado") return "success";
  if (s === "pendiente") return "warning";
  if (s === "fallido") return "danger";
  return "neutral";
}

function getFulTone(estado: string) {
  const s = safeLower(estado);
  if (s === "entregado") return "success";
  if (s === "procesando" || s === "enviado") return "warning";
  if (s === "cancelado") return "danger";
  return "neutral";
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const styles: Record<string, React.CSSProperties> = {
    neutral: {
      border: "1px solid rgba(0,0,0,.10)",
      background: "rgba(0,0,0,.03)",
      color: "rgba(0,0,0,.80)",
    },
    success: {
      border: "1px solid rgba(0,140,60,.18)",
      background: "rgba(0,140,60,.08)",
      color: "rgba(0,120,50,.95)",
    },
    warning: {
      border: "1px solid rgba(200,120,0,.20)",
      background: "rgba(200,120,0,.10)",
      color: "rgba(160,90,0,.95)",
    },
    danger: {
      border: "1px solid rgba(180,0,20,.20)",
      background: "rgba(180,0,20,.08)",
      color: "rgba(160,0,20,.95)",
    },
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 900,
        ...(styles[tone] || styles.neutral),
      }}
    >
      {children}
    </span>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,.08)",
        borderRadius: 16,
        padding: 18,
        background: "white",
        boxShadow: "0 6px 18px rgba(0,0,0,.06)",
      }}
    >
      {children}
    </div>
  );
}

function Button({
  children,
  onClick,
  disabled,
  variant = "secondary",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  const base: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,.12)",
    fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "transform .08s ease",
    userSelect: "none",
    whiteSpace: "nowrap",
  };

  const styles: Record<string, React.CSSProperties> = {
    secondary: { background: "white", color: "rgba(0,0,0,.90)" },
    primary: {
      background: disabled ? "rgba(0,0,0,.10)" : "rgba(0,0,0,.90)",
      color: disabled ? "rgba(0,0,0,.55)" : "white",
    },
    danger: {
      background: disabled ? "rgba(180,0,20,.08)" : "rgba(180,0,20,.90)",
      color: "white",
      border: "1px solid rgba(180,0,20,.22)",
    },
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ ...base, ...(styles[variant] || styles.secondary) }}
    >
      {children}
    </button>
  );
}

function SkeletonRow() {
  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,.08)",
        borderRadius: 14,
        padding: 14,
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ height: 12, width: 220, background: "rgba(0,0,0,.06)", borderRadius: 6 }} />
        <div style={{ height: 28, width: 120, background: "rgba(0,0,0,.06)", borderRadius: 999 }} />
        <div style={{ height: 28, width: 140, background: "rgba(0,0,0,.06)", borderRadius: 999 }} />
        <div style={{ height: 28, width: 90, background: "rgba(0,0,0,.06)", borderRadius: 999 }} />
      </div>
      <div style={{ height: 10, width: 320, background: "rgba(0,0,0,.05)", borderRadius: 6 }} />
      <div style={{ height: 38, width: 260, background: "rgba(0,0,0,.05)", borderRadius: 12 }} />
    </div>
  );
}

function buildCsv(ordenes: Orden[]) {
  const headers = [
    "id",
    "usuario_nombre",
    "usuario_email",
    "estadoPago",
    "estadoFulfillment",
    "total",
    "createdAt",
  ];

  const rows = ordenes.map((o) => {
    const usuarioNombre = typeof o.usuario === "object" ? (o.usuario?.nombre || "") : "";
    const usuarioEmail = typeof o.usuario === "object" ? (o.usuario?.email || "") : "";
    const createdAt = (o as any).createdAt || "";
    return [
      o._id,
      usuarioNombre,
      usuarioEmail,
      String(o.estadoPago || ""),
      String(o.estadoFulfillment || ""),
      String(o.total ?? ""),
      String(createdAt),
    ];
  });

  const esc = (v: any) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replaceAll('"', '""')}"`;
    }
    return s;
  };

  return [headers.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AdminOrdenesPage() {
  // ===== list state
  const [loading, setLoading] = useState(true);
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [meta, setMeta] = useState<ListMeta>({ page: 1, limit: 20, total: 0, pages: 1 });
  const [error, setError] = useState<string | null>(null);

  // ===== metrics
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

  // ===== query controls
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState(""); // debounced
  const [estadoPago, setEstadoPago] = useState<string>("all");
  const [estadoFulfillment, setEstadoFulfillment] = useState<string>("all");
  const [sort, setSort] = useState<string>("createdAt_desc");

  // ===== auto refresh
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [autoRefreshSec, setAutoRefreshSec] = useState(20);

  // ===== updating single order
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const lastSnapshotRef = useRef<Map<string, Orden>>(new Map());

  // ===== aborting
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);

  function cancelInFlight() {
    try {
      abortRef.current?.abort();
    } catch {}
    abortRef.current = new AbortController();
    return abortRef.current.signal;
  }

  async function loadList(next?: Partial<ListMeta>) {
    const page = next?.page ?? meta.page;
    const limit = next?.limit ?? meta.limit;

    setLoading(true);
    setError(null);

    const signal = cancelInFlight();

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    params.set("sort", sort);

    if (q.trim()) params.set("q", q.trim());
    if (estadoPago !== "all") params.set("estadoPago", estadoPago);
    if (estadoFulfillment !== "all") params.set("estadoFulfillment", estadoFulfillment);

    const res = await api.get<Orden[]>(
      `/api/ordenes/admin?${params.toString()}`,
      {
        autoLogoutOn401: true,
        friendlyErrorMessage: "No se pudieron cargar las órdenes (admin).",
        signal,
      } as any
    );

    if (!res.ok) {
      setOrdenes([]);
      setMeta((m) => ({ ...m, page, limit, total: 0, pages: 1 }));
      setError(res.message || "Error cargando órdenes");
      setLoading(false);
      return;
    }

    // Si tu api.get devuelve { data, meta } en res (depende de tu wrapper),
    // intentamos leer meta si existe. Si no existe, dejamos lo que tengamos.
    const maybeMeta = (res as any).meta as ListMeta | undefined;

    setOrdenes(res.data || []);
    if (maybeMeta?.page) setMeta(maybeMeta);
    else setMeta((m) => ({ ...m, page, limit }));

    // guardamos snapshot para rollback por id
    const map = new Map<string, Orden>();
    (res.data || []).forEach((o) => map.set(o._id, o));
    lastSnapshotRef.current = map;

    setLoading(false);
  }

  async function loadMetrics() {
    setMetricsLoading(true);
    const signal = cancelInFlight();

    const res = await api.get<Metrics>("/api/ordenes/admin/metrics", {
      autoLogoutOn401: true,
      friendlyErrorMessage: "No se pudieron cargar las métricas (admin).",
      signal,
    } as any);

    if (!res.ok) {
      setMetrics(null);
      setMetricsLoading(false);
      return;
    }

    setMetrics(res.data || null);
    setMetricsLoading(false);
  }

  // ===== initial load
  useEffect(() => {
    loadMetrics();
    loadList({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== debounce qInput -> q
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQ(qInput.trim());
    }, 450);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [qInput]);

  // ===== when filters change -> reload from page 1
  useEffect(() => {
    loadList({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, estadoPago, estadoFulfillment, sort]);

  // ===== auto refresh
  useEffect(() => {
    if (!autoRefresh) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }

    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      loadList();
      loadMetrics();
    }, Math.max(8, autoRefreshSec) * 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, autoRefreshSec]);

  async function updateEstado(ordenId: string, body: UpdateEstadoBody) {
    if (!ordenId) return;
    if (updatingId) return;

    // snapshot para rollback
    const snap = lastSnapshotRef.current.get(ordenId);

    setUpdatingId(ordenId);
    setError(null);

    // optimistic UI
    setOrdenes((prev) =>
      prev.map((o) =>
        o._id === ordenId
          ? ({
              ...o,
              estadoPago: body.estadoPago ?? o.estadoPago,
              estadoFulfillment: body.estadoFulfillment ?? o.estadoFulfillment,
            } as any)
          : o
      )
    );

    const res = await api.put<Orden>(
      `/api/ordenes/admin/${ordenId}/estado`,
      body,
      {
        autoLogoutOn401: true,
        friendlyErrorMessage: "No se pudo actualizar el estado de la orden.",
      }
    );

    if (!res.ok) {
      // rollback
      if (snap) {
        setOrdenes((prev) => prev.map((o) => (o._id === ordenId ? snap : o)));
      }
      setError(res.message || "Error actualizando estado.");
      setUpdatingId(null);
      return;
    }

    // refrescar list + metrics (sin romper)
    await loadList();
    await loadMetrics();
    setUpdatingId(null);
  }

  const showingRange = useMemo(() => {
    const start = (meta.page - 1) * meta.limit + 1;
    const end = Math.min(meta.page * meta.limit, meta.total || meta.page * meta.limit);
    if (meta.total === 0) return "0";
    return `${start}-${end}`;
  }, [meta.page, meta.limit, meta.total]);

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24, display: "grid", gap: 14 }}>
      {/* ===== HEADER + METRICS */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>Órdenes — Admin (Enterprise)</h1>
            <p style={{ marginTop: 6, color: "rgba(0,0,0,.65)" }}>
              Panel profesional con filtros server-side, métricas y cambios de estado con auditoría.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 900 }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto-refresh
            </label>

            <select
              value={autoRefreshSec}
              onChange={(e) => setAutoRefreshSec(Number(e.target.value))}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,.12)",
                background: "white",
                fontWeight: 900,
              }}
              disabled={!autoRefresh}
            >
              {[10, 15, 20, 30, 45, 60].map((n) => (
                <option key={n} value={n}>
                  cada {n}s
                </option>
              ))}
            </select>

            <Button
              onClick={() => {
                loadList();
                loadMetrics();
              }}
              disabled={loading}
              variant="secondary"
            >
              {loading ? "Cargando…" : "Recargar"}
            </Button>

            <Button
              onClick={() => {
                const csv = buildCsv(ordenes);
                downloadTextFile(`ordenes_admin_${Date.now()}.csv`, csv);
              }}
              disabled={ordenes.length === 0}
              variant="secondary"
            >
              Export CSV
            </Button>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {metricsLoading ? (
            <>
              <Badge>Total: …</Badge>
              <Badge tone="success">Pagadas: …</Badge>
              <Badge tone="warning">Pendientes: …</Badge>
              <Badge tone="danger">Fallidas: …</Badge>
              <Badge>Reembolsadas: …</Badge>
            </>
          ) : metrics ? (
            <>
              <Badge>Total: {fmtNumber(metrics.totalOrdenes)}</Badge>
              <Badge tone="success">Pagadas: {fmtNumber(metrics.pagadas)}</Badge>
              <Badge tone="warning">Pendientes: {fmtNumber(metrics.pendientes)}</Badge>
              <Badge tone="danger">Fallidas: {fmtNumber(metrics.fallidas)}</Badge>
              <Badge>Reembolsadas: {fmtNumber(metrics.reembolsadas)}</Badge>
              <Badge>Ingresos: ${money(metrics.totalIngresos)}</Badge>
              <Badge>Ganancia: ${money(metrics.totalGanancia)}</Badge>
            </>
          ) : (
            <Badge>Sin métricas</Badge>
          )}
        </div>

        {/* ===== FILTER BAR */}
        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "1fr 180px 200px 180px",
            gap: 10,
          }}
        >
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Buscar por ID / nombre / email…"
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,.12)",
              outline: "none",
            }}
          />

          <select
            value={estadoPago}
            onChange={(e) => setEstadoPago(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,.12)",
              background: "white",
              fontWeight: 900,
            }}
          >
            <option value="all">Pago: todos</option>
            {PAGO_OPTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={estadoFulfillment}
            onChange={(e) => setEstadoFulfillment(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,.12)",
              background: "white",
              fontWeight: 900,
            }}
          >
            <option value="all">Fulfillment: todos</option>
            {FUL_OPTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,.12)",
              background: "white",
              fontWeight: 900,
            }}
          >
            <option value="createdAt_desc">Más nuevas</option>
            <option value="createdAt_asc">Más antiguas</option>
            <option value="total_desc">Total ↓</option>
            <option value="total_asc">Total ↑</option>
            <option value="paidAt_desc">Pago ↓</option>
            <option value="paidAt_asc">Pago ↑</option>
          </select>
        </div>

        {/* ===== ERROR BANNER */}
        {error ? (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 12,
              background: "rgba(180,0,20,.06)",
              border: "1px solid rgba(180,0,20,.18)",
              color: "rgba(140,0,20,.95)",
              fontWeight: 900,
            }}
          >
            ❌ {error}
            <div style={{ marginTop: 6, fontWeight: 800, color: "rgba(0,0,0,.65)" }}>
              Si aparece <b>jwt expired</b>, vuelve a iniciar sesión.
            </div>
          </div>
        ) : null}
      </Card>

      {/* ===== LIST */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 950 }}>
            Mostrando: <span style={{ fontFamily: "monospace" }}>{showingRange}</span>{" "}
            de <span style={{ fontFamily: "monospace" }}>{fmtNumber(meta.total)}</span>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={meta.limit}
              onChange={(e) => {
                const nextLimit = Number(e.target.value);
                setMeta((m) => ({ ...m, limit: nextLimit, page: 1 }));
                loadList({ page: 1, limit: nextLimit });
              }}
              style={{
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,.12)",
                background: "white",
                fontWeight: 900,
              }}
            >
              {[10, 20, 30, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}/pág
                </option>
              ))}
            </select>

            <Button
              onClick={() => loadList({ page: Math.max(1, meta.page - 1) })}
              disabled={loading || meta.page <= 1}
              variant="secondary"
            >
              ← Anterior
            </Button>

            <Badge>
              Página {meta.page} / {Math.max(1, meta.pages || 1)}
            </Badge>

            <Button
              onClick={() => loadList({ page: Math.min(meta.pages || 1, meta.page + 1) })}
              disabled={loading || meta.page >= (meta.pages || 1)}
              variant="secondary"
            >
              Siguiente →
            </Button>
          </div>
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          {loading ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : ordenes.length === 0 ? (
            <div style={{ color: "rgba(0,0,0,.65)", fontWeight: 800 }}>
              No hay órdenes con esos filtros.
            </div>
          ) : (
            ordenes.map((o) => {
              const pago = safeLower(o.estadoPago);
              const fulfillment = safeLower(o.estadoFulfillment);

              const userNombre = typeof o.usuario === "object" ? (o.usuario?.nombre || "—") : "—";
              const userEmail = typeof o.usuario === "object" ? (o.usuario?.email || "—") : "—";

              const isUpdating = updatingId === o._id;

              return (
                <div
                  key={o._id}
                  style={{
                    border: "1px solid rgba(0,0,0,.08)",
                    borderRadius: 14,
                    padding: 14,
                    display: "grid",
                    gap: 10,
                    opacity: isUpdating ? 0.75 : 1,
                  }}
                >
                  {/* top line */}
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 950 }}>
                      Orden:{" "}
                      <span style={{ fontWeight: 800, fontFamily: "monospace" }}>{o._id}</span>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Badge tone={getPagoTone(pago)}>Pago: {pago || "—"}</Badge>
                      <Badge tone={getFulTone(fulfillment)}>Envío: {fulfillment || "—"}</Badge>
                      <Badge>Total: ${money((o as any).total)}</Badge>
                    </div>
                  </div>

                  {/* user */}
                  <div style={{ color: "rgba(0,0,0,.7)", fontSize: 13 }}>
                    Usuario: <b>{userNombre}</b>{" "}
                    <span style={{ color: "rgba(0,0,0,.55)" }}>({userEmail})</span>
                  </div>

                  {/* actions */}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <Link
                      href={`/admin/ordenes/${o._id}`}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(0,0,0,.12)",
                        background: "white",
                        textDecoration: "none",
                        fontWeight: 900,
                        color: "rgba(0,0,0,.85)",
                      }}
                    >
                      Ver detalle
                    </Link>

                    <Link
                      href={`/orden/${o._id}`}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(0,0,0,.12)",
                        background: "white",
                        textDecoration: "none",
                        fontWeight: 900,
                        color: "rgba(0,0,0,.85)",
                      }}
                    >
                      Ver cliente
                    </Link>

                    {/* inline status editors */}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ display: "grid", gap: 4 }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(0,0,0,.55)" }}>estadoPago</div>
                        <select
                          value={pago || "pendiente"}
                          disabled={isUpdating}
                          onChange={(e) =>
                            updateEstado(o._id, { estadoPago: e.target.value as any })
                          }
                          style={{
                            padding: "8px 10px",
                            borderRadius: 12,
                            border: "1px solid rgba(0,0,0,.12)",
                            background: "white",
                            fontWeight: 900,
                          }}
                        >
                          {PAGO_OPTS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div style={{ display: "grid", gap: 4 }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(0,0,0,.55)" }}>
                          estadoFulfillment
                        </div>
                        <select
                          value={fulfillment || "pendiente"}
                          disabled={isUpdating}
                          onChange={(e) =>
                            updateEstado(o._id, { estadoFulfillment: e.target.value as any })
                          }
                          style={{
                            padding: "8px 10px",
                            borderRadius: 12,
                            border: "1px solid rgba(0,0,0,.12)",
                            background: "white",
                            fontWeight: 900,
                          }}
                        >
                          {FUL_OPTS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>

                      {isUpdating ? (
                        <Badge>Actualizando…</Badge>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </main>
  );
}