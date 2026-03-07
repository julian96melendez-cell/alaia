"use client";

/**
 * ======================================================
 * PendingStatus — UI Enterprise para pago pendiente
 * ======================================================
 * ✔ Spinner pro (sin librerías)
 * ✔ Contador de tiempo
 * ✔ Mensaje claro para el cliente
 * ✔ Diseño limpio tipo Apple/Stripe
 * ======================================================
 */

import { useEffect, useMemo, useState } from "react";

type Props = {
  enabled: boolean;
  ordenId?: string | null;
  secondsToShow?: number; // default 90
};

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        width: 18,
        height: 18,
        borderRadius: "50%",
        border: "2px solid rgba(0,0,0,.15)",
        borderTopColor: "rgba(0,0,0,.75)",
        display: "inline-block",
        animation: "spin 0.8s linear infinite",
      }}
    />
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        padding: "6px 12px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        background: "rgba(0,0,0,.05)",
        border: "1px solid rgba(0,0,0,.08)",
      }}
    >
      {children}
    </span>
  );
}

export default function PendingStatus({
  enabled,
  ordenId,
  secondsToShow = 90,
}: Props) {
  const [elapsed, setElapsed] = useState(0);

  const max = useMemo(() => Math.max(10, Math.floor(secondsToShow)), [secondsToShow]);

  useEffect(() => {
    if (!enabled) return;

    setElapsed(0);

    const t = window.setInterval(() => {
      setElapsed((s) => {
        if (s >= max) return s;
        return s + 1;
      });
    }, 1000);

    return () => window.clearInterval(t);
  }, [enabled, max]);

  if (!enabled) return null;

  const remaining = Math.max(0, max - elapsed);

  return (
    <div
      style={{
        marginTop: 14,
        padding: 14,
        borderRadius: 16,
        border: "1px solid rgba(0,0,0,.08)",
        background: "linear-gradient(180deg, rgba(0,0,0,.02), rgba(0,0,0,.00))",
      }}
    >
      {/* Animación inline segura */}
      <style>{`
        @keyframes spin { 
          from { transform: rotate(0deg); } 
          to { transform: rotate(360deg); } 
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Spinner />
        <div style={{ fontWeight: 900 }}>Verificando pago con Stripe…</div>
      </div>

      <p style={{ marginTop: 8, marginBottom: 0, opacity: 0.85 }}>
        Esto puede tardar unos segundos. No cierres esta ventana.
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
        {ordenId ? <Badge>Orden: {ordenId}</Badge> : null}
        <Badge>Actualizando automáticamente</Badge>
        <Badge>Tiempo restante: {remaining}s</Badge>
      </div>
    </div>
  );
}