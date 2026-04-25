"use client";

import { api } from "@/lib/api";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SellerProduct = {
  _id?: string;
  id?: string;
  nombre: string;
  descripcion?: string;
  tipo?: "marketplace" | "dropshipping" | "afiliado";
  sellerType?: "platform" | "seller";
  precioFinal?: number;
  costoProveedor?: number;
  stock?: number;
  gestionStock?: boolean;
  activo?: boolean;
  visible?: boolean;
  categoria?: string;
  proveedor?: string;
  moneda?: string;
  imagenPrincipal?: string;
  createdAt?: string;
  updatedAt?: string;
};

function getId(item: { _id?: string; id?: string }) {
  return item._id || item.id || "";
}

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

function formatDate(value?: string) {
  if (!value) return "—";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";

  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function badgeStyle(
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
        ...badgeStyle(tone),
      }}
    >
      {children}
    </span>
  );
}

function ModuleButton({
  href,
  label,
  variant = "primary",
}: {
  href: string;
  label: string;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        textDecoration: "none",
        padding: "10px 14px",
        borderRadius: 12,
        fontSize: 14,
        fontWeight: 800,
        ...(variant === "primary"
          ? {
              background: "#0f172a",
              color: "#fff",
            }
          : {
              background: "#fff",
              color: "#0f172a",
              border: "1px solid rgba(15,23,42,.12)",
            }),
      }}
    >
      {label}
    </Link>
  );
}

function EmptyState() {
  return (
    <section
      style={{
        background: "#fff",
        border: "1px solid rgba(15,23,42,.08)",
        borderRadius: 22,
        padding: 28,
        boxShadow: "0 12px 30px rgba(15,23,42,.06)",
        display: "grid",
        gap: 14,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          background: "rgba(16,185,129,.10)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 24,
        }}
      >
        📦
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <h2
          style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 900,
            color: "#0f172a",
          }}
        >
          Aún no tienes productos
        </h2>

        <p
          style={{
            margin: 0,
            color: "rgba(15,23,42,.68)",
            fontSize: 15,
            lineHeight: 1.7,
            maxWidth: 760,
          }}
        >
          Cuando conectes el endpoint de creación y listado de productos del vendedor,
          aquí aparecerá tu catálogo. Esta pantalla ya está preparada para mostrar
          nombre, precio, stock, visibilidad y estado operativo.
        </p>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <ModuleButton href="/seller/productos/nuevo" label="Nuevo producto" />
        <ModuleButton
          href="/seller"
          label="Volver al panel"
          variant="secondary"
        />
      </div>
    </section>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 14,
        background: "rgba(248,250,252,.95)",
        border: "1px solid rgba(15,23,42,.06)",
        display: "grid",
        gap: 4,
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
          fontSize: 15,
          color: "#0f172a",
          fontWeight: 800,
          lineHeight: 1.3,
        }}
      >
        {value}
      </strong>
    </div>
  );
}

function ProductCard({ item }: { item: SellerProduct }) {
  const id = getId(item);
  const moneda = item.moneda || "USD";

  const stockText =
    item.gestionStock === false
      ? "Sin control de stock"
      : typeof item.stock === "number"
      ? String(item.stock)
      : "—";

  const activeTone: "success" | "danger" =
    item.activo === false ? "danger" : "success";

  const visibleTone: "warning" | "info" =
    item.visible === false ? "warning" : "info";

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(15,23,42,.08)",
        borderRadius: 18,
        padding: 18,
        boxShadow: "0 10px 24px rgba(15,23,42,.06)",
        display: "grid",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 14,
            background: "rgba(15,23,42,.05)",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            fontSize: 24,
          }}
        >
          {item.imagenPrincipal ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imagenPrincipal}
              alt={item.nombre}
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

        <div style={{ flex: 1, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge tone={activeTone}>
              {item.activo === false ? "Inactivo" : "Activo"}
            </Badge>

            <Badge tone={visibleTone}>
              {item.visible === false ? "Oculto" : "Visible"}
            </Badge>

            <Badge>{item.tipo || "marketplace"}</Badge>

            {item.categoria ? <Badge>{item.categoria}</Badge> : null}
          </div>

          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 900,
              color: "#0f172a",
              lineHeight: 1.2,
            }}
          >
            {item.nombre}
          </h2>

          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: "rgba(15,23,42,.66)",
              lineHeight: 1.6,
            }}
          >
            {item.descripcion?.trim()
              ? item.descripcion
              : "Sin descripción aún."}
          </p>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
        }}
      >
        <InfoCell label="Precio" value={money(item.precioFinal, moneda)} />
        <InfoCell label="Costo" value={money(item.costoProveedor, moneda)} />
        <InfoCell label="Stock" value={stockText} />
        <InfoCell label="Proveedor" value={item.proveedor || "local"} />
        <InfoCell label="Creado" value={formatDate(item.createdAt)} />
        <InfoCell label="Actualizado" value={formatDate(item.updatedAt)} />
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <ModuleButton
          href={id ? `/seller/productos/${id}` : "/seller/productos"}
          label="Editar producto"
        />
      </div>
    </div>
  );
}

function StatBlock({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(15,23,42,.08)",
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

export default function SellerProductosPage() {
  const [items, setItems] = useState<SellerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadProductos() {
    setLoading(true);
    setError(null);

    try {
      const res = await api.get<SellerProduct[]>("/api/seller/productos", {
        autoLogoutOn401: true,
        friendlyErrorMessage:
          "No se pudieron cargar tus productos de vendedor.",
      } as any);

      if (!res.ok) {
        throw new Error(res.message || "No se pudieron cargar los productos.");
      }

      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      console.error("SELLER PRODUCTOS ERROR:", err);
      setItems([]);
      setError(
        err?.message ||
          "Pantalla lista, pero el endpoint de productos del vendedor aún no está conectado."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProductos();
  }, []);

  const summary = useMemo(() => {
    const total = items.length;
    const activos = items.filter((x) => x.activo !== false).length;
    const visibles = items.filter((x) => x.visible !== false).length;
    const conStock = items.filter(
      (x) => x.gestionStock !== false && Number(x.stock || 0) > 0
    ).length;

    return {
      total,
      activos,
      visibles,
      conStock,
    };
  }, [items]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
      }}
    >
      <div
        style={{
          maxWidth: 1240,
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
          <div style={{ maxWidth: 760 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 999,
                background: "rgba(16,185,129,.10)",
                color: "#047857",
                fontSize: 12,
                fontWeight: 800,
                marginBottom: 14,
              }}
            >
              Vendedor · Productos
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
              Mis productos
            </h1>

            <p
              style={{
                marginTop: 10,
                marginBottom: 0,
                fontSize: 15,
                lineHeight: 1.7,
                color: "rgba(15,23,42,.68)",
                maxWidth: 720,
              }}
            >
              Gestiona tu catálogo, visibilidad, precio, stock y operación comercial
              dentro del marketplace.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => void loadProductos()}
              disabled={loading}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid rgba(15,23,42,.12)",
                background: "#fff",
                color: "#0f172a",
                fontSize: 14,
                fontWeight: 800,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Actualizando…" : "Recargar"}
            </button>

            <ModuleButton
              href="/seller/productos/nuevo"
              label="Nuevo producto"
            />
          </div>
        </header>

        {error ? (
          <div
            style={{
              background: "#fff8e6",
              border: "1px solid #fde68a",
              color: "#92400e",
              padding: 14,
              borderRadius: 12,
              fontWeight: 700,
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
          <StatBlock
            label="Total productos"
            value={loading ? "—" : String(summary.total)}
            hint="Catálogo total del vendedor"
          />
          <StatBlock
            label="Activos"
            value={loading ? "—" : String(summary.activos)}
            hint="Productos habilitados"
          />
          <StatBlock
            label="Visibles"
            value={loading ? "—" : String(summary.visibles)}
            hint="Productos visibles en tienda"
          />
          <StatBlock
            label="Con stock"
            value={loading ? "—" : String(summary.conStock)}
            hint="Productos listos para vender"
          />
        </section>

        {loading ? (
          <section
            style={{
              background: "#fff",
              border: "1px solid rgba(15,23,42,.08)",
              borderRadius: 22,
              padding: 24,
              boxShadow: "0 12px 30px rgba(15,23,42,.06)",
              color: "rgba(15,23,42,.62)",
              fontWeight: 700,
            }}
          >
            Cargando productos…
          </section>
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <section
            style={{
              display: "grid",
              gap: 18,
            }}
          >
            {items.map((item) => (
              <ProductCard key={getId(item) || item.nombre} item={item} />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}