"use client";

import { api } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";

type Producto = {
  _id: string;
  nombre: string;
  precio: number;
  activo: boolean;
  stock: number;
  sku?: string;
};

function money(n: number) {
  return `$${Number(n || 0).toFixed(2)}`;
}

export default function AdminProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("");
  const [stock, setStock] = useState("");
  const [sku, setSku] = useState("");

  const lowStock = useMemo(
    () => productos.filter((p) => Number(p.stock || 0) <= 5),
    [productos]
  );

  async function loadProductos() {
    setLoading(true);
    setError(null);

    try {
      const res = await api.get<Producto[]>("/api/productos/admin", {
        autoLogoutOn401: true,
      } as any);

      if (!res.ok) {
        setError(res.message || "Error cargando productos");
        setProductos([]);
        setLoading(false);
        return;
      }

      setProductos(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      console.error("ADMIN PRODUCTOS LOAD ERROR:", err);
      setError(err?.message || "Error cargando productos");
      setProductos([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProductos();
  }, []);

  async function crearProducto() {
    if (saving) return;

    const nombreClean = nombre.trim();
    const precioNum = Number(precio);
    const stockNum = Number(stock);

    if (!nombreClean) {
      setError("El nombre es obligatorio.");
      return;
    }

    if (!Number.isFinite(precioNum) || precioNum <= 0) {
      setError("Precio inválido.");
      return;
    }

    if (!Number.isFinite(stockNum) || stockNum < 0) {
      setError("Stock inválido.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await api.post("/api/productos/admin", {
        nombre: nombreClean,
        precio: precioNum,
        stock: stockNum,
        sku: sku.trim() || undefined,
      });

      if (!res.ok) {
        setError(res.message || "No se pudo crear el producto");
        setSaving(false);
        return;
      }

      setNombre("");
      setPrecio("");
      setStock("");
      setSku("");

      await loadProductos();
    } catch (err: any) {
      console.error("ADMIN PRODUCTOS CREATE ERROR:", err);
      setError(err?.message || "No se pudo crear el producto");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActivo(producto: Producto) {
    setError(null);

    try {
      const res = await api.put(`/api/productos/admin/${producto._id}`, {
        activo: !producto.activo,
      });

      if (!res.ok) {
        setError(res.message || "No se pudo actualizar el estado");
        return;
      }

      await loadProductos();
    } catch (err: any) {
      console.error("ADMIN PRODUCTOS TOGGLE ERROR:", err);
      setError(err?.message || "No se pudo actualizar el estado");
    }
  }

  async function actualizarPrecio(producto: Producto, nuevoPrecio: number) {
    if (!Number.isFinite(nuevoPrecio) || nuevoPrecio <= 0) {
      setError("Precio inválido.");
      return;
    }

    setError(null);

    try {
      const res = await api.put(`/api/productos/admin/${producto._id}`, {
        precio: nuevoPrecio,
      });

      if (!res.ok) {
        setError(res.message || "No se pudo actualizar el precio");
        return;
      }

      await loadProductos();
    } catch (err: any) {
      console.error("ADMIN PRODUCTOS PRICE ERROR:", err);
      setError(err?.message || "No se pudo actualizar el precio");
    }
  }

  async function actualizarNombre(producto: Producto, nuevoNombre: string) {
    const nombreClean = nuevoNombre.trim();
    if (!nombreClean) {
      setError("El nombre no puede estar vacío.");
      return;
    }

    setError(null);

    try {
      const res = await api.put(`/api/productos/admin/${producto._id}`, {
        nombre: nombreClean,
      });

      if (!res.ok) {
        setError(res.message || "No se pudo actualizar el nombre");
        return;
      }

      await loadProductos();
    } catch (err: any) {
      console.error("ADMIN PRODUCTOS NAME ERROR:", err);
      setError(err?.message || "No se pudo actualizar el nombre");
    }
  }

  async function actualizarStock(producto: Producto, nuevoStock: number) {
    if (!Number.isFinite(nuevoStock) || nuevoStock < 0) {
      setError("Stock inválido.");
      return;
    }

    setError(null);

    try {
      const res = await api.put(`/api/productos/admin/${producto._id}`, {
        stock: nuevoStock,
      });

      if (!res.ok) {
        setError(res.message || "No se pudo actualizar el stock");
        return;
      }

      await loadProductos();
    } catch (err: any) {
      console.error("ADMIN PRODUCTOS STOCK ERROR:", err);
      setError(err?.message || "No se pudo actualizar el stock");
    }
  }

  async function actualizarSku(producto: Producto, nuevoSku: string) {
    setError(null);

    try {
      const res = await api.put(`/api/productos/admin/${producto._id}`, {
        sku: nuevoSku.trim(),
      });

      if (!res.ok) {
        setError(res.message || "No se pudo actualizar el SKU");
        return;
      }

      await loadProductos();
    } catch (err: any) {
      console.error("ADMIN PRODUCTOS SKU ERROR:", err);
      setError(err?.message || "No se pudo actualizar el SKU");
    }
  }

  return (
    <main style={layout}>
      <header style={header}>
        <div>
          <h1 style={title}>Admin · Productos</h1>
          <p style={subtitleText}>
            Gestiona catálogo, precio, stock, SKU y visibilidad de productos.
          </p>
        </div>

        <button onClick={() => void loadProductos()} style={buttonOutline}>
          Recargar
        </button>
      </header>

      {lowStock.length > 0 && (
        <section style={alertBox}>
          <div style={alertTitle}>⚠️ Productos con stock bajo</div>

          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {lowStock.map((p) => (
              <div key={p._id} style={alertRow}>
                <div>
                  <div style={{ fontWeight: 800 }}>{p.nombre}</div>
                  <div style={alertSub}>
                    SKU: {p.sku?.trim() ? p.sku : "Sin SKU"} · ID: {p._id}
                  </div>
                </div>

                <div style={alertStock}>Stock: {p.stock}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section style={card}>
        <h2 style={subtitle}>Crear producto</h2>

        <div style={formGrid}>
          <input
            placeholder="Nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            style={input}
          />

          <input
            placeholder="Precio"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            style={input}
          />

          <input
            placeholder="Stock"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            style={input}
          />

          <input
            placeholder="SKU (opcional)"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            style={input}
          />

          <button
            onClick={() => void crearProducto()}
            disabled={saving}
            style={buttonPrimary}
          >
            {saving ? "Creando…" : "Crear producto"}
          </button>
        </div>
      </section>

      <section style={card}>
        <div style={sectionHeader}>
          <h2 style={subtitle}>Productos</h2>
          <div style={counter}>{productos.length} registrados</div>
        </div>

        {loading ? (
          <div>Cargando productos…</div>
        ) : productos.length === 0 ? (
          <div>No hay productos.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {productos.map((p) => (
              <ProductoRow
                key={p._id}
                producto={p}
                onToggle={() => void toggleActivo(p)}
                onPrecio={(v) => void actualizarPrecio(p, v)}
                onNombre={(v) => void actualizarNombre(p, v)}
                onStock={(v) => void actualizarStock(p, v)}
                onSku={(v) => void actualizarSku(p, v)}
              />
            ))}
          </div>
        )}
      </section>

      {error ? <div style={errorBox}>{error}</div> : null}
    </main>
  );
}

function ProductoRow({
  producto,
  onToggle,
  onPrecio,
  onNombre,
  onStock,
  onSku,
}: {
  producto: Producto;
  onToggle: () => void;
  onPrecio: (v: number) => void;
  onNombre: (v: string) => void;
  onStock: (v: number) => void;
  onSku: (v: string) => void;
}) {
  const [nombre, setNombre] = useState(producto.nombre);
  const [precio, setPrecio] = useState(String(producto.precio));
  const [stock, setStock] = useState(String(producto.stock ?? 0));
  const [sku, setSku] = useState(producto.sku || "");

  return (
    <div style={row}>
      <div style={rowTop}>
        <div style={statusBadge(producto.activo)}>
          {producto.activo ? "Activo" : "Inactivo"}
        </div>

        <div style={stockBadge(producto.stock)}>
          Stock: {producto.stock ?? 0}
        </div>

        <div style={priceBadge}>{money(producto.precio)}</div>
      </div>

      <div style={rowGrid}>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onBlur={() => onNombre(nombre)}
          style={input}
        />

        <input
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          onBlur={() => onPrecio(Number(precio))}
          style={input}
        />

        <input
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          onBlur={() => onStock(Number(stock))}
          style={input}
        />

        <input
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          onBlur={() => onSku(sku)}
          placeholder="SKU"
          style={input}
        />
      </div>

      <div style={rowFooter}>
        <div style={idText}>ID: {producto._id}</div>

        <button onClick={onToggle} style={buttonOutline}>
          {producto.activo ? "Desactivar" : "Activar"}
        </button>
      </div>
    </div>
  );
}

const layout: React.CSSProperties = {
  maxWidth: 1100,
  margin: "0 auto",
  padding: 24,
  display: "grid",
  gap: 20,
};

const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
};

const title: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
  margin: 0,
};

const subtitleText: React.CSSProperties = {
  marginTop: 8,
  marginBottom: 0,
  color: "rgba(0,0,0,.65)",
  fontSize: 14,
};

const subtitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
  margin: 0,
};

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(0,0,0,.08)",
  borderRadius: 16,
  padding: 20,
  boxShadow: "0 6px 18px rgba(0,0,0,.06)",
};

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
  marginTop: 14,
};

const sectionHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 14,
  flexWrap: "wrap",
};

const counter: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(0,0,0,.05)",
  fontWeight: 800,
  fontSize: 12,
};

const row: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,.08)",
  borderRadius: 14,
  padding: 14,
  display: "grid",
  gap: 12,
};

const rowTop: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const rowGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const rowFooter: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const idText: React.CSSProperties = {
  fontSize: 12,
  color: "rgba(0,0,0,.55)",
  fontFamily: "monospace",
};

const input: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,.12)",
  width: "100%",
};

const buttonPrimary: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  background: "black",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
};

const buttonOutline: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,.12)",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 700,
};

const errorBox: React.CSSProperties = {
  background: "#fff3f3",
  border: "1px solid #ffd3d3",
  padding: 12,
  borderRadius: 12,
  color: "#b00020",
  fontWeight: 700,
};

const alertBox: React.CSSProperties = {
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  borderRadius: 14,
  padding: 16,
};

const alertTitle: React.CSSProperties = {
  fontWeight: 900,
  fontSize: 16,
  color: "#9a3412",
};

const alertRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "10px 0",
  borderBottom: "1px solid rgba(154,52,18,.12)",
};

const alertSub: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: "rgba(0,0,0,.6)",
};

const alertStock: React.CSSProperties = {
  fontWeight: 900,
  color: "#9a3412",
  whiteSpace: "nowrap",
};

function statusBadge(activo: boolean): React.CSSProperties {
  return {
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    background: activo ? "rgba(0,140,60,.08)" : "rgba(180,0,20,.08)",
    color: activo ? "rgba(0,120,50,.95)" : "rgba(160,0,20,.95)",
    border: activo
      ? "1px solid rgba(0,140,60,.18)"
      : "1px solid rgba(180,0,20,.18)",
  };
}

function stockBadge(stock: number): React.CSSProperties {
  const low = Number(stock || 0) <= 5;

  return {
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    background: low ? "rgba(200,120,0,.10)" : "rgba(0,0,0,.04)",
    color: low ? "rgba(160,90,0,.95)" : "rgba(0,0,0,.75)",
    border: low
      ? "1px solid rgba(200,120,0,.20)"
      : "1px solid rgba(0,0,0,.10)",
  };
}

const priceBadge: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  background: "rgba(0,0,0,.04)",
  color: "rgba(0,0,0,.75)",
  border: "1px solid rgba(0,0,0,.10)",
};