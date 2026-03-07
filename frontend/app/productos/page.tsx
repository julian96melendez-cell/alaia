"use client";

// ======================================================
// ProductosPage — Compra directa (Stripe Checkout)
// ======================================================

import { api } from "@/lib/api";
import { useState } from "react";

/**
 * Producto mock (FASE 1)
 * Luego esto puede venir del backend
 */
const PRODUCTOS = [
  {
    id: "producto_1",
    nombre: "Producto de Prueba",
    precio: 19.99,
    productoIdBackend: "693d970922c0539f26f9854e",
  },
];

export default function ProductosPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function comprar(productoIdBackend: string) {
    setLoading(true);
    setError(null);

    try {
      const res = await api.post<{
        ordenId: string;
        sessionId: string;
        url: string;
      }>("/api/pagos/stripe/checkout", {
        items: [
          {
            producto: productoIdBackend,
            cantidad: 1,
          },
        ],
      });

      if (!res.ok || !res.data?.url) {
        throw new Error(res.message || "No se pudo iniciar el pago");
      }

      // 🔥 REDIRECCIÓN STRIPE
      window.location.href = res.data.url;
    } catch (err: any) {
      setError(err.message || "Error iniciando el pago");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f7f7f8",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div style={{ width: "min(900px, 100%)", display: "grid", gap: 16 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>
          Productos
        </h1>

        {PRODUCTOS.map((p) => (
          <div
            key={p.id}
            style={{
              background: "#fff",
              border: "1px solid rgba(0,0,0,.08)",
              borderRadius: 16,
              padding: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontWeight: 800 }}>{p.nombre}</div>
              <div style={{ opacity: 0.7 }}>
                ${p.precio.toFixed(2)}
              </div>
            </div>

            <button
              onClick={() => comprar(p.productoIdBackend)}
              disabled={loading}
              style={{
                padding: "10px 16px",
                borderRadius: 12,
                border: "none",
                background: "black",
                color: "white",
                fontWeight: 900,
                cursor: "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Redirigiendo…" : "Comprar ahora"}
            </button>
          </div>
        ))}

        {error && (
          <div
            style={{
              background: "#fff3f3",
              border: "1px solid #ffd3d3",
              color: "#b00020",
              padding: 14,
              borderRadius: 12,
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        )}
      </div>
    </main>
  );
}