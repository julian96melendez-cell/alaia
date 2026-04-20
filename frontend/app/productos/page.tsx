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
  categoria?: string;
  tipo?: "marketplace" | "dropshipping" | "afiliado";
  imagen?: string;
};

const PRODUCTOS: ProductoUI[] = [
  {
    id: "producto_1",
    nombre: "Producto de Prueba",
    descripcion:
      "Producto demo conectado al flujo de compra con Stripe Checkout.",
    precio: 19.99,
    productoIdBackend: "693d970922c0539f26f9854e",
    disponible: true,
    categoria: "General",
    tipo: "marketplace",
    imagen: "",
  },
];

type CheckoutResponse = {
  ordenId: string;
  sessionId: string;
  url: string;
};

function money(n: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: String(currency || "USD").toUpperCase(),
      maximumFractionDigits: 2,
    }).format(Number(n || 0));
  } catch {
    return `$${Number(n || 0).toFixed(2)}`;
  }
}

function badgeStyles(
  tone: "default" | "success" | "warning" | "danger" | "info" = "default"
): React.CSSProperties {
  if (tone === "success") {
    return {
      background: "rgba(0,140,60,.10)",
      color: "#047857",
      border: "1px solid rgba(0,140,60,.14)",
    };
  }

  if (tone === "warning") {
    return {
      background: "rgba(245,158,11,.10)",
      color: "#92400e",
      border: "1px solid rgba(245,158,11,.18)",
    };
  }

  if (tone === "danger") {
    return {
      background: "rgba(220,38,38,.10)",
      color: "#b91c1c",
      border: "1px solid rgba(220,38,38,.16)",
    };
  }

  if (tone === "info") {
    return {
      background: "rgba(59,130,246,.10)",
      color: "#1d4ed8",
      border: "1px solid rgba(59,130,246,.16)",
    };
  }

  return {
    background: "rgba(15,23,42,.06)",
    color: "#334155",
    border: "1px solid rgba(15,23,42,.10)",
  };
}

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 999,
        padding: "6px 10px",
        fontSize: 12,
        fontWeight: 800,
        whiteSpace: "nowrap",
        ...badgeStyles(tone),
      }}
    >
      {children}
    </span>
  );
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
  const tone = producto.disponible ? "success" : "danger";

  return (
    <article
      style={{
        background: "#ffffff",
        border: "1px solid rgba(15,23,42,.08)",
        borderRadius: 20,
        padding: 20,
        boxShadow: "0 10px 24px rgba(15,23,42,.06)",
        display: "grid",
        gap: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          aspectRatio: "16 / 11",
          borderRadius: 16,
          overflow: "hidden",
          background: "linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 34,
        }}
      >
        {producto.imagen ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={producto.imagen}
            alt={producto.nombre}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          "🛍️"
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {producto.categoria ? <Badge>{producto.categoria}</Badge> : null}
        {producto.tipo ? <Badge tone="info">{producto.tipo}</Badge> : null}
        <Badge tone={tone}>
          {producto.disponible ? "Disponible" : "No disponible"}
        </Badge>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <h2
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 900,
            color: "#0f172a",
            lineHeight: 1.2,
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
              color:
                producto.disponible
                  ? "rgba(0,120,50,.95)"
                  : "rgba(160,0,20,.95)",
            }}
          >
            {producto.disponible
              ? "Listo para compra inmediata"
              : "Temporalmente no disponible"}
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

function EmptyState({
  hasSearch,
}: {
  hasSearch: boolean;
}) {
  return (
    <section
      style={{
        background: "#ffffff",
        border: "1px solid rgba(15,23,42,.08)",
        borderRadius: 18,
        padding: 28,
        boxShadow: "0 10px 24px rgba(15,23,42,.06)",
        display: "grid",
        gap: 10,
      }}
    >
      <div
        style={{
          fontSize: 32,
        }}
      >
        {hasSearch ? "🔎" : "📦"}
      </div>

      <h2
        style={{
          margin: 0,
          fontSize: 22,
          fontWeight: 900,
          color: "#0f172a",
        }}
      >
        {hasSearch
          ? "No encontramos productos con esos filtros"
          : "No hay productos disponibles"}
      </h2>

      <p
        style={{
          margin: 0,
          fontSize: 15,
          lineHeight: 1.7,
          color: "rgba(15,23,42,.68)",
        }}
      >
        {hasSearch
          ? "Prueba cambiando la búsqueda o seleccionando otra categoría."
          : "Cuando conectes tu catálogo real, aquí aparecerán los productos públicos de tu tienda."}
      </p>
    </section>
  );
}

export default function ProductosPage() {
  const [error, setError] = useState<string | null>(null);
  const [loadingProductId, setLoadingProductId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoria, setCategoria] = useState("todas");

  const categorias = useMemo(() => {
    const set = new Set<string>();

    PRODUCTOS.forEach((p) => {
      if (p.categoria) set.add(p.categoria);
    });

    return ["todas", ...Array.from(set)];
  }, []);

  const productosFiltrados = useMemo(() => {
    const q = search.trim().toLowerCase();

    return PRODUCTOS.filter((p) => {
      const matchDisponible = p.disponible;
      const matchCategoria =
        categoria === "todas" ? true : p.categoria === categoria;

      const hayTexto =
        !q ||
        p.nombre.toLowerCase().includes(q) ||
        p.descripcion.toLowerCase().includes(q) ||
        (p.categoria || "").toLowerCase().includes(q) ||
        (p.tipo || "").toLowerCase().includes(q);

      return matchDisponible && matchCategoria && hayTexto;
    });
  }, [search, categoria]);

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
        background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "min(1180px, 100%)",
          margin: "0 auto",
          display: "grid",
          gap: 22,
        }}
      >
        <header
          style={{
            background: "#ffffff",
            border: "1px solid rgba(15,23,42,.08)",
            borderRadius: 22,
            padding: 24,
            boxShadow: "0 12px 30px rgba(15,23,42,.06)",
            display: "grid",
            gap: 14,
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

          <div style={{ display: "grid", gap: 10 }}>
            <h1
              style={{
                margin: 0,
                fontSize: 34,
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
                maxWidth: 760,
                fontSize: 15,
                lineHeight: 1.7,
                color: "rgba(15,23,42,.68)",
              }}
            >
              Explora los productos disponibles y completa tu compra mediante
              Stripe Checkout con un flujo rápido, seguro y listo para escalar.
            </p>
          </div>

          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 14,
            }}
          >
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar productos..."
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid #d1d5db",
                fontSize: 14,
                outline: "none",
                background: "#fff",
              }}
            />

            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid #d1d5db",
                fontSize: 14,
                outline: "none",
                background: "#fff",
              }}
            >
              {categorias.map((item) => (
                <option key={item} value={item}>
                  {item === "todas" ? "Todas las categorías" : item}
                </option>
              ))}
            </select>
          </section>
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

        {productosFiltrados.length === 0 ? (
          <EmptyState hasSearch={!!search || categoria !== "todas"} />
        ) : (
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 18,
            }}
          >
            {productosFiltrados.map((producto) => (
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