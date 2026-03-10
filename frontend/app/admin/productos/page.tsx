"use client";

import { api } from "@/lib/api";
import { useEffect, useState } from "react";

/**
 * ======================================================
 * AdminProductosPage
 * ======================================================
 * ✔ Lista productos
 * ✔ Crear producto
 * ✔ Editar nombre
 * ✔ Editar precio
 * ✔ Activar / desactivar
 * ✔ UI admin limpia
 * ✔ Preparado para backend real
 * ======================================================
 */

type Producto = {
  _id: string;
  nombre: string;
  precio: number;
  activo: boolean;
};

export default function AdminProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);

  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadProductos() {
    setLoading(true);
    setError(null);

    const res = await api.get<Producto[]>("/api/productos/admin", {
      autoLogoutOn401: true,
    });

    if (!res.ok) {
      setError(res.message || "Error cargando productos");
      setProductos([]);
      setLoading(false);
      return;
    }

    setProductos(res.data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadProductos();
  }, []);

  async function crearProducto() {
    if (!nombre.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }

    const precioNum = Number(precio);

    if (!Number.isFinite(precioNum) || precioNum <= 0) {
      setError("Precio inválido.");
      return;
    }

    setSaving(true);
    setError(null);

    const res = await api.post("/api/productos/admin", {
      nombre,
      precio: precioNum,
    });

    if (!res.ok) {
      setError(res.message || "No se pudo crear el producto");
      setSaving(false);
      return;
    }

    setNombre("");
    setPrecio("");
    setSaving(false);

    await loadProductos();
  }

  async function toggleActivo(producto: Producto) {
    const res = await api.put(`/api/productos/admin/${producto._id}`, {
      activo: !producto.activo,
    });

    if (!res.ok) {
      setError(res.message || "No se pudo actualizar");
      return;
    }

    await loadProductos();
  }

  async function actualizarPrecio(producto: Producto, nuevoPrecio: number) {
    if (!Number.isFinite(nuevoPrecio) || nuevoPrecio <= 0) return;

    const res = await api.put(`/api/productos/admin/${producto._id}`, {
      precio: nuevoPrecio,
    });

    if (!res.ok) {
      setError(res.message || "No se pudo actualizar precio");
      return;
    }

    await loadProductos();
  }

  async function actualizarNombre(producto: Producto, nuevoNombre: string) {
    if (!nuevoNombre.trim()) return;

    const res = await api.put(`/api/productos/admin/${producto._id}`, {
      nombre: nuevoNombre,
    });

    if (!res.ok) {
      setError(res.message || "No se pudo actualizar nombre");
      return;
    }

    await loadProductos();
  }

  return (
    <main style={layout}>
      <h1 style={title}>Admin · Productos</h1>

      {/* Crear producto */}

      <div style={card}>
        <h2 style={subtitle}>Crear producto</h2>

        <div style={formRow}>
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

          <button
            onClick={crearProducto}
            disabled={saving}
            style={buttonPrimary}
          >
            {saving ? "Creando…" : "Crear"}
          </button>
        </div>
      </div>

      {/* Lista */}

      <div style={card}>
        <div style={headerRow}>
          <h2 style={subtitle}>Productos</h2>

          <button onClick={loadProductos} style={buttonOutline}>
            Recargar
          </button>
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
                onToggle={() => toggleActivo(p)}
                onPrecio={(v) => actualizarPrecio(p, v)}
                onNombre={(v) => actualizarNombre(p, v)}
              />
            ))}
          </div>
        )}
      </div>

      {error ? <div style={errorBox}>{error}</div> : null}
    </main>
  );
}

/**
 * Row producto
 */

function ProductoRow({
  producto,
  onToggle,
  onPrecio,
  onNombre,
}: {
  producto: Producto;
  onToggle: () => void;
  onPrecio: (v: number) => void;
  onNombre: (v: string) => void;
}) {
  const [nombre, setNombre] = useState(producto.nombre);
  const [precio, setPrecio] = useState(String(producto.precio));

  return (
    <div style={row}>
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
        style={inputSmall}
      />

      <div style={{ fontWeight: 700 }}>
        {producto.activo ? "Activo" : "Inactivo"}
      </div>

      <button onClick={onToggle} style={buttonOutline}>
        {producto.activo ? "Desactivar" : "Activar"}
      </button>
    </div>
  );
}

/**
 * Styles
 */

const layout: React.CSSProperties = {
  maxWidth: 1000,
  margin: "0 auto",
  padding: 24,
  display: "grid",
  gap: 20,
};

const title: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
};

const subtitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 900,
};

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(0,0,0,.08)",
  borderRadius: 16,
  padding: 20,
};

const formRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  marginTop: 10,
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const row: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 120px 100px 120px",
  gap: 10,
  alignItems: "center",
  padding: 10,
  border: "1px solid rgba(0,0,0,.08)",
  borderRadius: 12,
};

const input: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,.12)",
};

const inputSmall: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,.12)",
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