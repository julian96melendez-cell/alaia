"use client";

import { api } from "@/lib/api";
import { useMemo, useState } from "react";

type ProductoUI = {
  id: string;
  nombre: string;
  descripcion: string;
  precio: number;
  productoIdBackend: string;
  disponible: boolean;
};

const PRODUCTOS: ProductoUI[] = [
  {
    id: "producto_1",
    nombre: "Producto de Prueba",
    descripcion: "Producto demo conectado al flujo de compra con Stripe Checkout.",
    precio: 19.99,
    productoIdBackend: "693d970922c0539f26f9854e",
    disponible: true,
  },
];

type CheckoutResponse = {
  ordenId: string;
  sessionId: string;
  url: string;
};

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

function ProductCard({
  producto,
  loading,
  onComprar,
}: {
  producto: ProductoUI;
  loading: boolean;
  onComprar: (productoIdBackend: string) => void;
}) {
  return (
    <article
      style={{
        background: "#ffffff",
        border: "1px solid rgba(15,23,42,.08)",
        borderRadius: 18,
        padding: 20,
        boxShadow: "0 10px 24px rgba(15,23,42,.06)",
        display: "grid",
        gap: 14,
      }}
    >
      <div style={{ display: "grid", gap: 8 }}>
        <h2
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 900,
            color: "#0f172a",
          }}
        >
          {producto.nombre}
        </h2>

        <p
          style={{
            margin: 0,
            fontSize: 14,
            lineHeight: 1.6,
            color: "rgba(15,23,42,.68)",
          }}
        >
          {producto.descripcion}
        </p>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 900,
              color: "#0f172a",
              lineHeight: 1,
            }}
          >
            {money(producto.precio)}
          </div>

          <div
            style={{
              marginTop: 6,
              fontSize: 12,
              fontWeight: 800,
              color: producto.disponible
                ? "rgba(0,120,50,.95)"
                : "rgba(160,0,20,.95)",
            }}
          >
            {producto.disponible ? "Disponible" : "No disponible"}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onComprar(producto.productoIdBackend)}
          disabled={loading || !producto.disponible}
          style={{
            padding: "12px 18px",
            borderRadius: 12,
            border: "none",
            background: "#0f172a",
            color: "#ffffff",
            fontWeight: 900,
            fontSize: 14,
            cursor: loading || !producto.disponible ? "not-allowed" : "pointer",
            opacity: loading || !producto.disponible ? 0.65 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {loading ? "Redirigiendo…" : "Comprar ahora"}
        </button>
      </div>
    </article>
  );
}

export default function ProductosPage() {
  const [error, setError] = useState<string | null>(null);
  const [loadingProductId, setLoadingProductId] = useState<string | null>(null);

  const productosDisponibles = useMemo(
    () => PRODUCTOS.filter((p) => p.disponible),
    []
  );

  async function comprar(productoIdBackend: string) {
    if (loadingProductId) return;

    setLoadingProductId(productoIdBackend);
    setError(null);

    try {
      const res = await api.post<CheckoutResponse>("/api/pagos/stripe/checkout", {
        items: [
          {
            producto: productoIdBackend,
            cantidad: 1,
          },
        ],
      });

      if (!res.ok || !res.data?.url) {
        throw new Error(res.message || "No se pudo iniciar el pago.");
      }

      window.location.href = res.data.url;
    } catch (err: any) {
      console.error("CHECKOUT ERROR:", err);
      setError(err?.message || "Error iniciando el pago.");
      setLoadingProductId(null);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "min(1100px, 100%)",
          margin: "0 auto",
          display: "grid",
          gap: 22,
        }}
      >
        <header
          style={{
            background: "#ffffff",
            border: "1px solid rgba(15,23,42,.08)",
            borderRadius: 20,
            padding: 24,
            boxShadow: "0 12px 30px rgba(15,23,42,.06)",
            display: "grid",
            gap: 10,
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              width: "fit-content",
              padding: "6px 10px",
              borderRadius: 999,
              background: "rgba(79,70,229,.08)",
              color: "#4338ca",
              fontSize: 12,
              fontWeight: 900,
            }}
          >
            Catálogo · Checkout directo
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 32,
              lineHeight: 1.1,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            Productos
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: 720,
              fontSize: 15,
              lineHeight: 1.7,
              color: "rgba(15,23,42,.68)",
            }}
          >
            Explora los productos disponibles y completa tu compra mediante
            Stripe Checkout con un flujo rápido, seguro y listo para escalar.
          </p>
        </header>

        {error ? (
          <section
            style={{
              background: "#fff3f3",
              border: "1px solid #ffd3d3",
              color: "#b00020",
              padding: 14,
              borderRadius: 14,
              fontWeight: 800,
            }}
          >
            {error}
          </section>
        ) : null}

        {productosDisponibles.length === 0 ? (
          <section
            style={{
              background: "#ffffff",
              border: "1px solid rgba(15,23,42,.08)",
              borderRadius: 18,
              padding: 22,
              boxShadow: "0 10px 24px rgba(15,23,42,.06)",
              color: "rgba(15,23,42,.68)",
              fontWeight: 800,
            }}
          >
            No hay productos disponibles en este momento.
          </section>
        ) : (
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 18,
            }}
          >
            {PRODUCTOS.map((producto) => (
              <ProductCard
                key={producto.id}
                producto={producto}
                loading={loadingProductId === producto.productoIdBackend}
                onComprar={comprar}
              />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}