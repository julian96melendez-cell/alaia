'use client';

import { useEffect, useState } from 'react';

// ==============================
// Config
// ==============================
const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ==============================
// Tipos (contrato backend)
// ==============================
type OrdenPublica = {
  _id: string;
  total: number;
  estadoPago: 'pendiente' | 'pagado' | 'fallido' | 'reembolsado';
  estadoFulfillment:
    | 'pendiente'
    | 'procesando'
    | 'enviado'
    | 'entregado'
    | 'cancelado';
};

// ==============================
// Utils
// ==============================
const formatMoney = (value: number) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'USD',
  }).format(value);

const badgeStyle = (type: 'success' | 'warning' | 'info' | 'error') => {
  const map = {
    success: { background: '#e6f9f0', color: '#0f5132' },
    warning: { background: '#fff3cd', color: '#664d03' },
    info: { background: '#e7f1ff', color: '#084298' },
    error: { background: '#f8d7da', color: '#842029' },
  };

  return {
    display: 'inline-block',
    padding: '6px 10px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    ...map[type],
  };
};

// ==============================
// Componente
// ==============================
export default function PagoExitosoClient({
  ordenId,
}: {
  ordenId: string;
}) {
  const [orden, setOrden] = useState<OrdenPublica | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ordenId) {
      setError('No se recibió el ID de la orden');
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const cargarOrden = async () => {
      try {
        const response = await fetch(
          `${API_URL}/api/ordenes/public/${ordenId}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error(`Error HTTP ${response.status}`);
        }

        const json = await response.json();
        setOrden(json.data);
      } catch (err: any) {
        if (err.name === 'AbortError') return;

        console.error('[PagoExitosoClient]', err);
        setError(err.message || 'Error consultando la orden');
      } finally {
        setLoading(false);
      }
    };

    cargarOrden();

    return () => controller.abort();
  }, [ordenId]);

  // ==============================
  // Estados
  // ==============================
  if (loading) {
    return <p style={{ padding: 20 }}>Cargando información del pago…</p>;
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <h2>❌ Error</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>
          Reintentar
        </button>
      </div>
    );
  }

  if (!orden) return null;

  // ==============================
  // UI
  // ==============================
  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <h1>✅ Pago realizado con éxito</h1>

      <p>
        <strong>ID de la orden:</strong> {orden._id}
      </p>

      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        <span style={badgeStyle('success')}>
          Pago: {orden.estadoPago}
        </span>

        <span style={badgeStyle('info')}>
          Fulfillment: {orden.estadoFulfillment}
        </span>

        <span style={badgeStyle('info')}>
          Total: {formatMoney(orden.total)}
        </span>
      </div>

      {/* ============================== */}
      {/* Debug técnico (puedes quitarlo luego) */}
      {/* ============================== */}
      <div style={{ marginTop: 24 }}>
        <h3 style={{ marginBottom: 8, fontSize: 15 }}>
          Detalle técnico (debug)
        </h3>
        <pre
          style={{
            background: 'rgba(0,0,0,0.04)',
            padding: 14,
            borderRadius: 12,
            fontSize: 12,
            overflow: 'auto',
          }}
        >
          {JSON.stringify(orden, null, 2)}
        </pre>
      </div>
    </div>
  );
}