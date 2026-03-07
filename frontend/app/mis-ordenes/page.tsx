"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import type { Orden } from "../../lib/types";
import AutoRefreshMisOrdenes from "./AutoRefreshMisOrdenes";

type CheckoutData = {
  ordenId: string;
  sessionId: string;
  url: string;
};

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

function Button({
  children,
  onClick,
  disabled,
  variant = "secondary",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  const base: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,.12)",
    fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer",
  };

  const styles: Record<string, React.CSSProperties> = {
    secondary: {
      background: "white",
      color: "rgba(0,0,0,.90)",
    },
    primary: {
      background: disabled ? "rgba(0,0,0,.08)" : "rgba(0,0,0,.90)",
      color: disabled ? "rgba(0,0,0,.55)" : "white",
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

export default function MisOrdenesPage() {
  const [loading, setLoading] = useState(true);
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [payLoadingGlobal, setPayLoadingGlobal] = useState(false);
  const [payLoadingOrdenId, setPayLoadingOrdenId] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  async function cargar() {
    setLoading(true);
    setError(null);

    const res = await api.get<Orden[]>("/api/ordenes/mias");

    if (!res.ok) {
      setOrdenes([]);
      setError(res.message || "No se pudieron cargar tus órdenes");
      setLoading(false);
      return;
    }

    setOrdenes(res.data || []);
    setLoading(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  const resumen = useMemo(() => {
    const total = ordenes.length;
    const pagadas = ordenes.filter((o) => o.estadoPago === "pagado").length;
    const pendientes = ordenes.filter((o) => o.estadoPago === "pendiente").length;
    const fallidas = ordenes.filter((o) => o.estadoPago === "fallido").length;
    const reembolsadas = ordenes.filter((o) => o.estadoPago === "reembolsado").length;

    return { total, pagadas, pendientes, fallidas, reembolsadas };
  }, [ordenes]);

  const hayPendientes = useMemo(
    () => ordenes.some((o) => o.estadoPago === "pendiente"),
    [ordenes]
  );

  function getPagoTone(estadoPago: Orden["estadoPago"]) {
    if (estadoPago === "pagado") return "success";
    if (estadoPago === "pendiente") return "warning";
    if (estadoPago === "fallido") return "danger";
    if (estadoPago === "reembolsado") return "neutral";
    return "neutral";
  }

  function getFulfillmentTone(estadoFulfillment: Orden["estadoFulfillment"]) {
    if (!estadoFulfillment) return "neutral";
    if (estadoFulfillment === "entregado") return "success";
    if (estadoFulfillment === "procesando" || estadoFulfillment === "enviado")
      return "warning";
    if (estadoFulfillment === "cancelado") return "danger";
    return "neutral";
  }

  async function pagarCarrito() {
    if (payLoadingGlobal) return;

    setPayLoadingGlobal(true);
    setPayLoadingOrdenId(null);
    setPayError(null);

    const res = await api.post<CheckoutData>("/api/pagos/stripe/checkout-carrito");

    if (!res.ok || !res.data?.url) {
      setPayError(
        res.message ||
          "No se pudo iniciar el pago. Revisa que el carrito tenga productos."
      );
      setPayLoadingGlobal(false);
      return;
    }

    window.location.href = res.data.url;
  }

  async function continuarPagoOrden(ordenId: string) {
    if (!ordenId) return;
    if (payLoadingGlobal) return;

    setPayLoadingGlobal(true);
    setPayLoadingOrdenId(ordenId);
    setPayError(null);

    const res = await api.post<CheckoutData>("/api/pagos/stripe/checkout-orden", {
      ordenId,
    });

    if (!res.ok || !res.data?.url) {
      setPayError(
        res.message ||
          "No se pudo continuar el pago de esta orden. Intenta recargar e inténtalo otra vez."
      );
      setPayLoadingGlobal(false);
      setPayLoadingOrdenId(null);
      return;
    }

    window.location.href = res.data.url;
  }

  return (
    <main
      style={{
        maxWidth: 1000,
        margin: "0 auto",
        padding: 24,
        display: "grid",
        gap: 14,
      }}
    >
      {/* AUTO REFRESH SOLO SI HAY PENDIENTES */}
      <AutoRefreshMisOrdenes enabled={hayPendientes && !payLoadingGlobal} />

      {/* HEADER */}
      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 24 }}>Mis Órdenes</h1>
            <p style={{ marginTop: 6, color: "rgba(0,0,0,.65)" }}>
              Aquí ves tus pagos y el estado de tu compra.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button onClick={cargar} variant="secondary" disabled={loading}>
              {loading ? "Cargando…" : "Recargar"}
            </Button>

            <Button
              onClick={pagarCarrito}
              disabled={payLoadingGlobal}
              variant="primary"
            >
              {payLoadingGlobal ? "Redirigiendo a Stripe…" : "Pagar ahora (carrito)"}
            </Button>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Badge>Total: {resumen.total}</Badge>
          <Badge tone="success">Pagadas: {resumen.pagadas}</Badge>
          <Badge tone="warning">Pendientes: {resumen.pendientes}</Badge>
          <Badge tone="danger">Fallidas: {resumen.fallidas}</Badge>
          <Badge>Reembolsadas: {resumen.reembolsadas}</Badge>

          {hayPendientes ? <Badge tone="warning">Auto-refresh activo</Badge> : null}
        </div>

        {payError ? (
          <div style={{ marginTop: 12, color: "#b00020", fontWeight: 900 }}>
            ❌ {payError}
          </div>
        ) : null}
      </Card>

      {/* LISTADO */}
      <Card>
        {loading ? (
          <p style={{ margin: 0 }}>Cargando…</p>
        ) : error ? (
          <div>
            <p style={{ margin: 0, fontWeight: 900 }}>❌ {error}</p>
            <p style={{ marginTop: 6, color: "rgba(0,0,0,.65)" }}>
              Asegúrate de haber iniciado sesión (token en localStorage) y que el
              backend esté encendido.
            </p>
            <Link
              href="/login"
              style={{ textDecoration: "underline", fontWeight: 900 }}
            >
              Ir a login
            </Link>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {ordenes.length === 0 ? (
              <p style={{ margin: 0, color: "rgba(0,0,0,.65)" }}>
                Aún no tienes órdenes. Agrega algo al carrito y paga.
              </p>
            ) : (
              ordenes.map((o) => {
                const isPendiente = o.estadoPago === "pendiente";
                const isPagado = o.estadoPago === "pagado";
                const isPayingThis = payLoadingOrdenId === o._id;

                return (
                  <div
                    key={o._id}
                    style={{
                      border: "1px solid rgba(0,0,0,.08)",
                      borderRadius: 14,
                      padding: 14,
                      display: "grid",
                      gap: 10,
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
                      <div style={{ fontWeight: 900 }}>
                        Orden:{" "}
                        <span style={{ fontWeight: 700, fontFamily: "monospace" }}>
                          {o._id}
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Badge tone={getPagoTone(o.estadoPago)}>
                          Pago: {o.estadoPago}
                        </Badge>

                        <Badge tone={getFulfillmentTone(o.estadoFulfillment)}>
                          Envío: {o.estadoFulfillment || "pendiente"}
                        </Badge>

                        <Badge>Total: ${Number(o.total || 0).toFixed(2)}</Badge>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <Link
                        href={`/pago-exitoso?ordenId=${encodeURIComponent(o._id)}`}
                        style={{ textDecoration: "underline", fontWeight: 900 }}
                      >
                        Ver estado público
                      </Link>

                      {isPagado ? (
                        <span style={{ color: "rgba(0,0,0,.65)", fontWeight: 900 }}>
                          ✅ Pagada
                        </span>
                      ) : null}

                      {isPendiente ? (
                        <button
                          onClick={() => continuarPagoOrden(o._id)}
                          disabled={payLoadingGlobal}
                          style={{
                            border: "none",
                            background: "transparent",
                            padding: 0,
                            textDecoration: "underline",
                            fontWeight: 900,
                            cursor: payLoadingGlobal ? "not-allowed" : "pointer",
                          }}
                        >
                          {isPayingThis ? "Abriendo Stripe…" : "Completar pago (esta orden)"}
                        </button>
                      ) : null}

                      {isPendiente && o.stripeSessionId ? (
                        <span style={{ color: "rgba(0,0,0,.55)", fontWeight: 800 }}>
                          session:{" "}
                          <span style={{ fontFamily: "monospace" }}>
                            {String(o.stripeSessionId).slice(0, 14)}…
                          </span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </Card>
    </main>
  );
}