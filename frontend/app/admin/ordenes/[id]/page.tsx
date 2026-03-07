"use client";

/**
 * ======================================================
 * AdminOrdenDetallePage — ENTERPRISE / PRO ULTRA (MAX)
 * ======================================================
 * ✔ GET /api/ordenes/admin/:id
 * ✔ PUT /api/ordenes/admin/:id/estado
 * ✔ Auditoría admin-ready
 * ✔ UX clara + estados seguros
 * ✔ Timeline profesional (HISTORIAL + tags)
 * ✔ Next.js App Router SAFE
 *
 * ++ ULTRA:
 * ✔ AbortController anti-memory leak
 * ✔ Retry inteligente (fallos temporales)
 * ✔ Optimistic UI + rollback seguro
 * ✔ Confirmación para cambios peligrosos
 * ✔ Lock anti doble submit + race safe
 * ✔ Diff visual de cambios
 * ✔ Copy actions (ID / Stripe session)
 * ✔ Keyboard shortcut Cmd/Ctrl+S
 * ✔ Normalización de estados
 * ✔ Skeleton loading profesional
 * ======================================================
 */

import { api } from "@/lib/api";
import type { Orden, OrdenItem } from "@/lib/types";
import { useParams, useRouter } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";

/* ======================================================
   Constantes
====================================================== */
const ESTADOS_PAGO = ["pendiente", "pagado", "fallido", "reembolsado"] as const;

const ESTADOS_FULFILLMENT = [
  "pendiente",
  "procesando",
  "enviado",
  "entregado",
  "cancelado",
] as const;

type EstadoPago = (typeof ESTADOS_PAGO)[number];
type EstadoFulfillment = (typeof ESTADOS_FULFILLMENT)[number];

/* ======================================================
   Helpers enterprise
====================================================== */
function safeLower(v: unknown) {
  return String(v ?? "").trim().toLowerCase();
}

function normalizePago(v: unknown): EstadoPago {
  const s = safeLower(v);
  if ((ESTADOS_PAGO as readonly string[]).includes(s)) return s as EstadoPago;
  return "pendiente";
}

function normalizeFulfillment(v: unknown): EstadoFulfillment {
  const s = safeLower(v);
  if ((ESTADOS_FULFILLMENT as readonly string[]).includes(s))
    return s as EstadoFulfillment;
  return "pendiente";
}

function money(n: unknown) {
  const x = Number(n ?? 0);
  return Number.isFinite(x) ? x.toFixed(2) : "0.00";
}

function isDangerChangePago(from: EstadoPago, to: EstadoPago) {
  if (to === "fallido") return true;
  if (from === "pagado" && to === "reembolsado") return true;
  return false;
}

function isDangerChangeFul(from: EstadoFulfillment, to: EstadoFulfillment) {
  if (to === "cancelado") return true;
  if (from === "entregado" && to !== "entregado") return true;
  return false;
}

function formatDateTime(d: any) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Retry conservador: para fallos temporales.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  {
    tries = 2,
    delayMs = 500,
  }: {
    tries?: number;
    delayMs?: number;
  } = {}
): Promise<T> {
  let lastErr: any = null;
  for (let i = 0; i <= tries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      if (i < tries) {
        await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
      }
    }
  }
  throw lastErr;
}

/* ======================================================
   Tones (badges)
====================================================== */
type Tone = "neutral" | "success" | "warning" | "danger";

function tonePago(p: EstadoPago): Tone {
  if (p === "pagado") return "success";
  if (p === "pendiente") return "warning";
  if (p === "fallido") return "danger";
  return "neutral"; // reembolsado
}

function toneFul(f: EstadoFulfillment): Tone {
  if (f === "entregado") return "success";
  if (f === "procesando" || f === "enviado") return "warning";
  if (f === "cancelado") return "danger";
  return "neutral";
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  const styles: Record<Tone, React.CSSProperties> = {
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
        fontWeight: 950,
        ...(styles[tone] || styles.neutral),
      }}
    >
      {children}
    </span>
  );
}

/* ======================================================
   Page
====================================================== */
export default function AdminOrdenDetallePage() {
  const params = useParams();
  const router = useRouter();

  const ordenId = typeof params?.id === "string" ? params.id : null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    type: "ok" | "warn" | "err";
    msg: string;
  } | null>(null);

  const [orden, setOrden] = useState<Orden | null>(null);

  const [estadoPago, setEstadoPago] = useState<EstadoPago>("pendiente");
  const [estadoFulfillment, setEstadoFulfillment] =
    useState<EstadoFulfillment>("pendiente");

  const abortRef = useRef<AbortController | null>(null);
  const savingRef = useRef(false);

  // Toast auto-hide
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  /* ======================================================
     Load orden (abort + retry)
  ====================================================== */
  async function load(opts?: { silent?: boolean }) {
    if (!ordenId) return;

    if (!opts?.silent) setLoading(true);
    setError(null);

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const localAbort = abortRef.current;

    try {
      const res = await withRetry(
        async () => {
          return await api.get<Orden>(`/api/ordenes/admin/${ordenId}`, {
            autoLogoutOn401: true,
            friendlyErrorMessage: "No se pudo cargar la orden",
            // si tu api.ts soporta signal, lo toma; si no, lo ignora
            signal: (localAbort.signal as any) ?? undefined,
          } as any);
        },
        { tries: 2, delayMs: 450 }
      );

      if (localAbort.signal.aborted) return;

      if (!res.ok || !res.data) {
        setOrden(null);
        setError(res.message || "Error cargando la orden");
        setLoading(false);
        return;
      }

      const o: any = res.data;

      const pagoNorm = normalizePago(o.estadoPago);
      const fulNorm = normalizeFulfillment(o.estadoFulfillment);

      setOrden(res.data);
      setEstadoPago(pagoNorm);
      setEstadoFulfillment(fulNorm);
    } catch (e: any) {
      if (localAbort.signal.aborted) return;
      setOrden(null);
      setError(e?.message || "Error cargando la orden");
    } finally {
      if (!localAbort.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenId]);

  // Shortcut Cmd/Ctrl+S => Guardar
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isSave =
        (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s";
      if (!isSave) return;
      e.preventDefault();
      saveEstado();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orden, estadoPago, estadoFulfillment, saving]);

  /* ======================================================
     Computed
  ====================================================== */
  const totalItems = useMemo(() => {
    if (!orden?.items?.length) return 0;
    return orden.items.reduce(
      (acc, it: OrdenItem) => acc + Number(it.cantidad || 0),
      0
    );
  }, [orden]);

  const estadoPagoActual = useMemo(
    () => normalizePago(orden?.estadoPago),
    [orden]
  );
  const estadoFulActual = useMemo(
    () => normalizeFulfillment(orden?.estadoFulfillment),
    [orden]
  );

  const hasChanges = useMemo(() => {
    if (!orden) return false;
    return (
      normalizePago(estadoPago) !== estadoPagoActual ||
      normalizeFulfillment(estadoFulfillment) !== estadoFulActual
    );
  }, [orden, estadoPago, estadoFulfillment, estadoPagoActual, estadoFulActual]);

  const changesPreview = useMemo(() => {
    if (!orden) return [];
    const out: {
      label: string;
      from: string;
      to: string;
      danger?: boolean;
    }[] = [];

    const fromPago = estadoPagoActual;
    const toPago = normalizePago(estadoPago);
    if (fromPago !== toPago) {
      out.push({
        label: "Pago",
        from: fromPago,
        to: toPago,
        danger: isDangerChangePago(fromPago, toPago),
      });
    }

    const fromFul = estadoFulActual;
    const toFul = normalizeFulfillment(estadoFulfillment);
    if (fromFul !== toFul) {
      out.push({
        label: "Fulfillment",
        from: fromFul,
        to: toFul,
        danger: isDangerChangeFul(fromFul, toFul),
      });
    }

    return out;
  }, [
    orden,
    estadoPago,
    estadoFulfillment,
    estadoPagoActual,
    estadoFulActual,
  ]);

  /* ======================================================
     Save estados — optimistic + confirm + rollback
  ====================================================== */
  async function saveEstado() {
    if (!orden) return;

    if (!hasChanges) {
      setToast({ type: "warn", msg: "No hay cambios para guardar." });
      return;
    }

    if (savingRef.current || saving) return;

    const nextPago = normalizePago(estadoPago);
    const nextFul = normalizeFulfillment(estadoFulfillment);

    const dangerous =
      isDangerChangePago(estadoPagoActual, nextPago) ||
      isDangerChangeFul(estadoFulActual, nextFul);

    if (dangerous) {
      const ok = window.confirm(
        "⚠️ Cambio sensible.\n\nEsto puede afectar pagos, envíos y auditoría.\n¿Confirmas aplicar el cambio?"
      );
      if (!ok) return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);

    const payload: Record<string, string> = {};
    if (estadoPagoActual !== nextPago) payload.estadoPago = nextPago;
    if (estadoFulActual !== nextFul) payload.estadoFulfillment = nextFul;

    const prevOrden = orden;
    const optimisticOrden: any = {
      ...orden,
      estadoPago: payload.estadoPago ?? orden.estadoPago,
      estadoFulfillment: payload.estadoFulfillment ?? orden.estadoFulfillment,
    };
    setOrden(optimisticOrden);

    try {
      const res = await api.put<Orden>(
        `/api/ordenes/admin/${orden._id}/estado`,
        payload,
        {
          autoLogoutOn401: true,
          friendlyErrorMessage: "No se pudo actualizar el estado",
        }
      );

      if (!res.ok) {
        setOrden(prevOrden);
        setError(res.message || "Error actualizando estado");
        return;
      }

      setToast({ type: "ok", msg: "✅ Cambios guardados." });
      await load({ silent: true });
    } catch (e: any) {
      setOrden(prevOrden);
      setError(e?.message || "Error actualizando estado");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  /* ======================================================
     Timeline formatting
  ====================================================== */
  const timeline = useMemo(() => {
    const h = (orden as any)?.historial;
    if (!Array.isArray(h)) return [];
    return [...h].slice().reverse();
  }, [orden]);

  /* ======================================================
     Render
  ====================================================== */
  return (
    <main style={layout}>
      {/* Toast */}
      {toast ? (
        <div style={toastStyle(toast.type)}>{toast.msg}</div>
      ) : null}

      {/* Header */}
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <button onClick={() => router.back()} style={btnOutline}>
          ← Volver
        </button>

        <button onClick={() => load()} style={btnOutline} disabled={loading}>
          {loading ? "Cargando…" : "Recargar"}
        </button>

        {orden?._id ? (
          <span style={chip}>
            Orden{" "}
            <b style={{ fontFamily: "monospace" }}>{String(orden._id)}</b>
          </span>
        ) : null}

        {orden?._id ? (
          <button
            style={btnOutlineSmall}
            onClick={async () => {
              const ok = await copyToClipboard(String(orden._id));
              setToast(
                ok
                  ? { type: "ok", msg: "ID copiado ✅" }
                  : { type: "err", msg: "No se pudo copiar." }
              );
            }}
          >
            Copiar ID
          </button>
        ) : null}

        {orden?.stripeSessionId ? (
          <button
            style={btnOutlineSmall}
            onClick={async () => {
              const ok = await copyToClipboard(String(orden.stripeSessionId));
              setToast(
                ok
                  ? { type: "ok", msg: "Stripe session copiada ✅" }
                  : { type: "err", msg: "No se pudo copiar." }
              );
            }}
          >
            Copiar Stripe
          </button>
        ) : null}
      </div>

      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 950 }}>
        Detalle de Orden
      </h1>

      {loading ? (
        <Card>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </Card>
      ) : error ? (
        <Card danger>
          <b>❌ {error}</b>
          <div style={{ marginTop: 8, opacity: 0.8, fontWeight: 800 }}>
            Consejo: revisa el endpoint{" "}
            <span style={{ fontFamily: "monospace" }}>
              /api/ordenes/admin/:id
            </span>{" "}
            y logs del backend si esto ocurre tras deploy.
          </div>
        </Card>
      ) : orden ? (
        <>
          {/* Resumen */}
          <Card>
            <Grid2>
              <Info label="ID" value={String(orden._id)} mono />
              <Info
                label="Pago"
                value={normalizePago(orden.estadoPago)}
                badge
                tone={tonePago(normalizePago(orden.estadoPago))}
              />
              <Info
                label="Fulfillment"
                value={normalizeFulfillment(orden.estadoFulfillment)}
                badge
                tone={toneFul(normalizeFulfillment(orden.estadoFulfillment))}
              />
              <Info label="Total" value={`$${money(orden.total)}`} strong />
              <Info label="Items" value={totalItems} />
              <Info
                label="Stripe Session"
                value={orden.stripeSessionId || "—"}
                mono
                small
              />
            </Grid2>
          </Card>

          {/* Acciones */}
          <Card>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontWeight: 950 }}>Acciones admin</div>
              <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>
                Atajo:{" "}
                <span style={{ fontFamily: "monospace" }}>
                  Ctrl/Cmd + S
                </span>{" "}
                para guardar
              </div>
            </div>

            <Grid2 style={{ marginTop: 12 }}>
              <div>
                <Label>Estado de pago</Label>
                <select
                  value={estadoPago}
                  onChange={(e) => setEstadoPago(normalizePago(e.target.value))}
                  style={select}
                >
                  {ESTADOS_PAGO.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Estado fulfillment</Label>
                <select
                  value={estadoFulfillment}
                  onChange={(e) =>
                    setEstadoFulfillment(normalizeFulfillment(e.target.value))
                  }
                  style={select}
                >
                  {ESTADOS_FULFILLMENT.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </Grid2>

            {/* Diff visual */}
            {hasChanges ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 950, marginBottom: 6 }}>
                  Cambios pendientes
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  {changesPreview.map((c) => (
                    <div
                      key={c.label}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(0,0,0,.10)",
                        background: c.danger
                          ? "rgba(180,0,20,.06)"
                          : "rgba(0,0,0,.03)",
                        display: "flex",
                        gap: 10,
                        flexWrap: "wrap",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ fontWeight: 950 }}>{c.label}</div>
                      <div style={{ fontFamily: "monospace", fontWeight: 900 }}>
                        {c.from} → {c.to}{" "}
                        {c.danger ? (
                          <span style={{ color: "rgba(160,0,20,.95)" }}>
                            ⚠️
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 12, opacity: 0.7, fontWeight: 900 }}>
                No hay cambios pendientes.
              </div>
            )}

            <div
              style={{
                marginTop: 12,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={saveEstado}
                disabled={!hasChanges || saving}
                style={{
                  ...btnPrimary,
                  opacity: !hasChanges || saving ? 0.5 : 1,
                }}
              >
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>

              <a
                href={`/pago-exitoso?ordenId=${encodeURIComponent(
                  String(orden._id)
                )}`}
                style={{ ...btnOutline, textDecoration: "none" }}
              >
                Ver público
              </a>
            </div>
          </Card>

          {/* Productos */}
          <Card>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontWeight: 950 }}>Productos</div>
              <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>
                Total items: {totalItems}
              </div>
            </div>

            <HeaderRow />

            {Array.isArray(orden.items) && orden.items.length ? (
              orden.items.map((it, idx) => {
                const cantidad = Number(it.cantidad || 0);
                const precio = Number(
                  (it as any).precioUnitario ?? (it as any).precio ?? 0
                );
                const subtotal =
                  Number((it as any).subtotal) ||
                  (Number.isFinite(precio) ? precio : 0) *
                    (Number.isFinite(cantidad) ? cantidad : 0);

                return (
                  <Row
                    key={`${idx}-${String(it.nombre ?? "item")}`}
                    nombre={String(it.nombre ?? "—")}
                    cantidad={cantidad}
                    precio={precio}
                    subtotal={subtotal}
                  />
                );
              })
            ) : (
              <div style={{ padding: "12px 0", opacity: 0.7, fontWeight: 900 }}>
                No hay items en esta orden.
              </div>
            )}
          </Card>

          {/* ================= HISTORIAL / TIMELINE ================= */}
          <Card>
            <div style={{ fontWeight: 950, marginBottom: 10 }}>
              Historial de la orden
            </div>

            {!timeline.length ? (
              <div style={{ opacity: 0.65, fontWeight: 900 }}>
                No hay eventos registrados.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {timeline.map((h: any, idx: number) => {
                  const estado = String(h?.estado ?? "—");
                  const meta = h?.meta ?? null;

                  const kind = classifyHistorial(estado);
                  const tag = kindTag(kind);

                  return (
                    <div
                      key={`${idx}-${estado}-${String(h?.fecha ?? idx)}`}
                      style={{
                        border: "1px solid rgba(0,0,0,.08)",
                        borderRadius: 14,
                        padding: 12,
                        background: "white",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            flexWrap: "wrap",
                          }}
                        >
                          <span style={tag.style}>{tag.label}</span>
                          <div style={{ fontWeight: 950 }}>{estado}</div>
                        </div>

                        <div
                          style={{
                            fontSize: 12,
                            opacity: 0.75,
                            fontWeight: 900,
                          }}
                        >
                          {formatDateTime(h?.fecha)}
                        </div>
                      </div>

                      {meta ? (
                        <details style={{ marginTop: 10 }}>
                          <summary
                            style={{
                              cursor: "pointer",
                              fontWeight: 950,
                              opacity: 0.85,
                            }}
                          >
                            Ver detalles
                          </summary>
                          <pre
                            style={{
                              marginTop: 10,
                              fontSize: 12,
                              background: "rgba(0,0,0,.04)",
                              padding: 12,
                              borderRadius: 10,
                              overflowX: "auto",
                            }}
                          >
                            {JSON.stringify(meta, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      ) : null}
    </main>
  );
}

/* ======================================================
   Timeline tagger
====================================================== */
type HistKind = "timeline" | "admin" | "email" | "system" | "unknown";

function classifyHistorial(estado: string): HistKind {
  const s = safeLower(estado);
  if (s.startsWith("timeline_")) return "timeline";
  if (s.startsWith("admin_") || s === "admin_update") return "admin";
  if (s.startsWith("email_")) return "email";
  if (s.includes("stripe") || s.includes("webhook") || s.includes("system"))
    return "system";
  return "unknown";
}

function kindTag(kind: HistKind) {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 950,
    border: "1px solid rgba(0,0,0,.10)",
    background: "rgba(0,0,0,.03)",
    color: "rgba(0,0,0,.75)",
  };

  if (kind === "timeline") {
    return {
      label: "TIMELINE",
      style: {
        ...base,
        border: "1px solid rgba(0,120,220,.20)",
        background: "rgba(0,120,220,.08)",
        color: "rgba(0,90,180,.95)",
      },
    };
  }

  if (kind === "admin") {
    return {
      label: "ADMIN",
      style: {
        ...base,
        border: "1px solid rgba(0,0,0,.18)",
        background: "rgba(0,0,0,.06)",
        color: "rgba(0,0,0,.90)",
      },
    };
  }

  if (kind === "email") {
    return {
      label: "EMAIL",
      style: {
        ...base,
        border: "1px solid rgba(140,60,0,.20)",
        background: "rgba(140,60,0,.08)",
        color: "rgba(120,50,0,.95)",
      },
    };
  }

  if (kind === "system") {
    return {
      label: "SYSTEM",
      style: {
        ...base,
        border: "1px solid rgba(120,0,220,.20)",
        background: "rgba(120,0,220,.08)",
        color: "rgba(90,0,180,.95)",
      },
    };
  }

  return {
    label: "INFO",
    style: base,
  };
}

/* ======================================================
   UI helpers
====================================================== */

const layout: React.CSSProperties = {
  maxWidth: 1100,
  margin: "0 auto",
  padding: 24,
  display: "grid",
  gap: 16,
};

function Card({
  children,
  danger,
}: {
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      style={{
        background: danger ? "#fff3f3" : "#fff",
        border: danger ? "1px solid #ffd3d3" : "1px solid rgba(0,0,0,.08)",
        borderRadius: 16,
        padding: 18,
        boxShadow: "0 6px 18px rgba(0,0,0,.06)",
      }}
    >
      {children}
    </div>
  );
}

function SkeletonRow() {
  return (
    <div
      style={{
        height: 18,
        borderRadius: 10,
        background: "rgba(0,0,0,.06)",
        marginBottom: 10,
        overflow: "hidden",
      }}
    />
  );
}

const Grid2 = (props: any) => (
  <div
    {...props}
    style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 14,
      ...(props.style || {}),
    }}
  />
);

const Label = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      fontSize: 12,
      fontWeight: 900,
      opacity: 0.65,
      marginBottom: 6,
    }}
  >
    {children}
  </div>
);

function Info({
  label,
  value,
  mono,
  strong,
  small,
  badge,
  tone,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
  strong?: boolean;
  small?: boolean;
  badge?: boolean;
  tone?: Tone;
}) {
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
        {label}
      </div>

      <div style={{ marginTop: 6 }}>
        {badge ? (
          <Badge tone={tone || "neutral"}>
            <span style={{ fontFamily: mono ? "monospace" : undefined }}>
              {String(value)}
            </span>
          </Badge>
        ) : (
          <div
            style={{
              fontFamily: mono ? "monospace" : undefined,
              fontWeight: strong ? 950 : 800,
              fontSize: small ? 12 : 14,
            }}
          >
            {value}
          </div>
        )}
      </div>
    </div>
  );
}

function HeaderRow() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.2fr 120px 140px 140px",
        gap: 12,
        padding: "10px 0",
        fontWeight: 950,
        borderBottom: "1px solid rgba(0,0,0,.08)",
        marginTop: 10,
      }}
    >
      <div>Nombre</div>
      <div>Cantidad</div>
      <div>Precio</div>
      <div>Subtotal</div>
    </div>
  );
}

function Row({
  nombre,
  cantidad,
  precio,
  subtotal,
}: {
  nombre: string;
  cantidad: number;
  precio: number;
  subtotal: number;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.2fr 120px 140px 140px",
        gap: 12,
        padding: "12px 0",
        borderBottom: "1px solid rgba(0,0,0,.06)",
      }}
    >
      <div>{nombre}</div>
      <div>{Number.isFinite(cantidad) ? cantidad : 0}</div>
      <div>${Number.isFinite(precio) ? precio.toFixed(2) : "0.00"}</div>
      <div>${Number.isFinite(subtotal) ? subtotal.toFixed(2) : "0.00"}</div>
    </div>
  );
}

/* ======================================================
   Styles
====================================================== */

const btnOutline: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,.12)",
  background: "#fff",
  fontWeight: 950,
  cursor: "pointer",
};

const btnOutlineSmall: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,.12)",
  background: "#fff",
  fontWeight: 950,
  cursor: "pointer",
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,.12)",
  background: "rgba(0,0,0,.9)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
};

const chip: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,.08)",
  background: "rgba(0,0,0,.04)",
  fontSize: 13,
  fontWeight: 800,
};

const select: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,.12)",
  fontWeight: 800,
  background: "#fff",
};

function toastStyle(type: "ok" | "warn" | "err"): React.CSSProperties {
  const bg =
    type === "ok"
      ? "rgba(0,140,60,.10)"
      : type === "warn"
      ? "rgba(200,120,0,.12)"
      : "rgba(180,0,20,.10)";

  const color =
    type === "ok"
      ? "rgba(0,120,50,.95)"
      : type === "warn"
      ? "rgba(160,90,0,.95)"
      : "rgba(160,0,20,.95)";

  return {
    position: "fixed",
    top: 14,
    right: 14,
    zIndex: 999,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,.12)",
    background: bg,
    color,
    fontWeight: 950,
    boxShadow: "0 10px 30px rgba(0,0,0,.10)",
    maxWidth: 420,
  };
}