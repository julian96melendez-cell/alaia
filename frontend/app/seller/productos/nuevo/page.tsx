"use client";

import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type CreateProductResponse = {
  ok: boolean;
  message?: string;
  data?: {
    _id?: string;
    id?: string;
  };
};

function moneyPreview(value: string) {
  const n = Number(value || 0);

  if (!Number.isFinite(n)) return "$0.00";

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export default function NuevoProductoPage() {
  const router = useRouter();

  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [categoria, setCategoria] = useState("");
  const [proveedor, setProveedor] = useState("local");
  const [stock, setStock] = useState("");
  const [activo, setActivo] = useState(true);
  const [visible, setVisible] = useState(true);
  const [gestionStock, setGestionStock] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    const precioNum = Number(precio);
    const stockNum = Number(stock || 0);

    return (
      !!nombre.trim() &&
      Number.isFinite(precioNum) &&
      precioNum > 0 &&
      (!gestionStock || (Number.isFinite(stockNum) && stockNum >= 0)) &&
      !loading
    );
  }, [nombre, precio, stock, gestionStock, loading]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);

    try {
      const payload = {
        nombre: nombre.trim(),
        descripcion: descripcion.trim(),
        categoria: categoria.trim(),
        proveedor: proveedor.trim() || "local",
        precio: Number(precio),
        stock: gestionStock ? Number(stock || 0) : 0,
        gestionStock,
        activo,
        visible,
      };

      const res = await api.post<CreateProductResponse>(
        "/api/seller/productos",
        payload,
        {
          autoLogoutOn401: true,
          friendlyErrorMessage: "No se pudo crear el producto.",
        } as any
      );

      if (!res.ok) {
        throw new Error(res.message || "No se pudo crear el producto.");
      }

      router.push("/seller/productos");
      router.refresh();
    } catch (err: any) {
      console.error("CREATE PRODUCT ERROR:", err);
      setError(err?.message || "No se pudo crear el producto.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>Nuevo producto</h1>
            <p style={styles.subtitle}>
              Crea un producto nuevo para tu catálogo de vendedor.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/seller/productos")}
            style={styles.secondaryButton}
          >
            Volver
          </button>
        </div>

        {error ? <div style={styles.errorBox}>{error}</div> : null}

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            <span style={styles.labelText}>Nombre del producto</span>
            <input
              type="text"
              placeholder="Ej. Auriculares Pro"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              style={styles.input}
              disabled={loading}
            />
          </label>

          <label style={styles.label}>
            <span style={styles.labelText}>Precio</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              style={styles.input}
              disabled={loading}
            />
            <span style={styles.helperText}>
              Vista previa: {moneyPreview(precio)}
            </span>
          </label>

          <label style={styles.label}>
            <span style={styles.labelText}>Descripción</span>
            <textarea
              placeholder="Describe tu producto de forma clara y profesional"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              style={styles.textarea}
              disabled={loading}
              rows={5}
            />
          </label>

          <div style={styles.gridTwo}>
            <label style={styles.label}>
              <span style={styles.labelText}>Categoría</span>
              <input
                type="text"
                placeholder="Ej. Tecnología"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                style={styles.input}
                disabled={loading}
              />
            </label>

            <label style={styles.label}>
              <span style={styles.labelText}>Proveedor</span>
              <input
                type="text"
                placeholder="Ej. local"
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                style={styles.input}
                disabled={loading}
              />
            </label>
          </div>

          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={gestionStock}
              onChange={(e) => setGestionStock(e.target.checked)}
              disabled={loading}
            />
            <span style={styles.checkboxText}>Gestionar stock</span>
          </label>

          {gestionStock ? (
            <label style={styles.label}>
              <span style={styles.labelText}>Stock inicial</span>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                style={styles.input}
                disabled={loading}
              />
            </label>
          ) : null}

          <div style={styles.gridTwo}>
            <label style={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={activo}
                onChange={(e) => setActivo(e.target.checked)}
                disabled={loading}
              />
              <span style={styles.checkboxText}>Producto activo</span>
            </label>

            <label style={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={visible}
                onChange={(e) => setVisible(e.target.checked)}
                disabled={loading}
              />
              <span style={styles.checkboxText}>Producto visible</span>
            </label>
          </div>

          <div style={styles.actions}>
            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                ...styles.primaryButton,
                opacity: canSubmit ? 1 : 0.65,
                cursor: canSubmit ? "pointer" : "not-allowed",
              }}
            >
              {loading ? "Creando..." : "Crear producto"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 760,
    margin: "0 auto",
    background: "#ffffff",
    border: "1px solid rgba(15,23,42,.08)",
    borderRadius: 20,
    padding: 28,
    boxShadow: "0 18px 40px rgba(15,23,42,.08)",
    display: "grid",
    gap: 20,
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
  },
  title: {
    margin: 0,
    fontSize: 30,
    lineHeight: 1.1,
    fontWeight: 900,
    color: "#0f172a",
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 0,
    fontSize: 14,
    lineHeight: 1.7,
    color: "rgba(15,23,42,.65)",
  },
  errorBox: {
    background: "#fff1f2",
    border: "1px solid #fecdd3",
    color: "#be123c",
    borderRadius: 14,
    padding: "12px 14px",
    fontSize: 14,
    fontWeight: 700,
  },
  form: {
    display: "grid",
    gap: 18,
  },
  label: {
    display: "grid",
    gap: 8,
  },
  labelText: {
    fontSize: 14,
    fontWeight: 800,
    color: "#0f172a",
  },
  input: {
    width: "100%",
    border: "1px solid #d1d5db",
    borderRadius: 12,
    padding: "12px 14px",
    fontSize: 14,
    outline: "none",
    background: "#ffffff",
    color: "#111827",
  },
  textarea: {
    width: "100%",
    border: "1px solid #d1d5db",
    borderRadius: 12,
    padding: "12px 14px",
    fontSize: 14,
    outline: "none",
    background: "#ffffff",
    color: "#111827",
    resize: "vertical",
    fontFamily: "inherit",
  },
  helperText: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: 600,
  },
  gridTwo: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    paddingTop: 4,
  },
  checkboxText: {
    fontSize: 14,
    color: "#0f172a",
    fontWeight: 700,
  },
  actions: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 4,
  },
  primaryButton: {
    border: "none",
    borderRadius: 12,
    background: "#0f172a",
    color: "#ffffff",
    padding: "12px 16px",
    fontSize: 14,
    fontWeight: 800,
  },
  secondaryButton: {
    border: "1px solid rgba(15,23,42,.12)",
    borderRadius: 12,
    background: "#ffffff",
    color: "#0f172a",
    padding: "10px 14px",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
  },
};