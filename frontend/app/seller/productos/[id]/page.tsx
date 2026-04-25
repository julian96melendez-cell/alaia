"use client";

import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type ProductoDetalle = {
  _id: string;
  nombre: string;
  precio: number;
  activo?: boolean;
  descripcion?: string;
};

type ApiProductoResponse = {
  ok: boolean;
  message?: string;
  data?: ProductoDetalle;
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

export default function EditProductoPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const id = params?.id;

  const [nombre, setNombre] = useState<string>("");
  const [precio, setPrecio] = useState<string>("");
  const [descripcion, setDescripcion] = useState<string>("");
  const [activo, setActivo] = useState<boolean>(true);

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    const precioNum = Number(precio);
    return (
      !!nombre.trim() &&
      Number.isFinite(precioNum) &&
      precioNum > 0 &&
      !saving &&
      !deleting
    );
  }, [nombre, precio, saving, deleting]);

  useEffect(() => {
    let mounted = true;

    async function loadProducto() {
      if (!id) {
        setError("ID de producto inválido.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const res = await api.get<ProductoDetalle>(`/api/seller/productos/${id}`, {
          autoLogoutOn401: true,
          friendlyErrorMessage: "No se pudo cargar el producto.",
        } as any);

        if (!res.ok || !res.data) {
          throw new Error(res.message || "No se pudo cargar el producto.");
        }

        if (!mounted) return;

        setNombre(res.data.nombre || "");
        setPrecio(
          Number.isFinite(Number(res.data.precio))
            ? String(res.data.precio)
            : ""
        );
        setDescripcion(res.data.descripcion || "");
        setActivo(res.data.activo !== false);
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.message || "No se pudo cargar el producto.");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadProducto();

    return () => {
      mounted = false;
    };
  }, [id]);

  async function handleUpdate() {
    if (!canSubmit) return;

    setSaving(true);
    setError(null);

    try {
      const payload = {
        nombre: nombre.trim(),
        precio: Number(precio),
        descripcion: descripcion.trim(),
        activo,
      };

      const res = await api.put<ApiProductoResponse>(
        `/api/seller/productos/${id}`,
        payload,
        {
          autoLogoutOn401: true,
          friendlyErrorMessage: "No se pudo actualizar el producto.",
        } as any
      );

      if (!res.ok) {
        throw new Error(res.message || "No se pudo actualizar el producto.");
      }

      router.push("/seller/productos");
      router.refresh();
    } catch (err: any) {
      console.error("UPDATE PRODUCT ERROR:", err);
      setError(err?.message || "No se pudo actualizar el producto.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleting || saving) return;

    const confirmed = window.confirm(
      "¿Seguro que quieres eliminar este producto? Esta acción no se puede deshacer."
    );

    if (!confirmed) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await api.del<ApiProductoResponse>(`/api/seller/productos/${id}`, {
        autoLogoutOn401: true,
        friendlyErrorMessage: "No se pudo eliminar el producto.",
      } as any);

      if (!res.ok) {
        throw new Error(res.message || "No se pudo eliminar el producto.");
      }

      router.push("/seller/productos");
      router.refresh();
    } catch (err: any) {
      console.error("DELETE PRODUCT ERROR:", err);
      setError(err?.message || "No se pudo eliminar el producto.");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <h1 style={styles.title}>Editar producto</h1>
          <p style={styles.subtitle}>Cargando información del producto…</p>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>Editar producto</h1>
            <p style={styles.subtitle}>
              Actualiza la información comercial de tu producto.
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

        <div style={styles.form}>
          <label style={styles.label}>
            <span style={styles.labelText}>Nombre del producto</span>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Auriculares Pro"
              style={styles.input}
              disabled={saving || deleting}
            />
          </label>

          <label style={styles.label}>
            <span style={styles.labelText}>Precio</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              placeholder="0.00"
              style={styles.input}
              disabled={saving || deleting}
            />
            <span style={styles.helperText}>
              Vista previa: {moneyPreview(precio)}
            </span>
          </label>

          <label style={styles.label}>
            <span style={styles.labelText}>Descripción</span>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Describe tu producto de forma clara y profesional"
              style={styles.textarea}
              disabled={saving || deleting}
              rows={5}
            />
          </label>

          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
              disabled={saving || deleting}
            />
            <span style={styles.checkboxText}>Producto activo y visible</span>
          </label>
        </div>

        <div style={styles.actions}>
          <button
            type="button"
            onClick={handleUpdate}
            disabled={!canSubmit}
            style={{
              ...styles.primaryButton,
              opacity: canSubmit ? 1 : 0.65,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={saving || deleting}
            style={{
              ...styles.dangerButton,
              opacity: saving || deleting ? 0.65 : 1,
              cursor: saving || deleting ? "not-allowed" : "pointer",
            }}
          >
            {deleting ? "Eliminando..." : "Eliminar producto"}
          </button>
        </div>
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
  dangerButton: {
    border: "none",
    borderRadius: 12,
    background: "#b91c1c",
    color: "#ffffff",
    padding: "12px 16px",
    fontSize: 14,
    fontWeight: 800,
  },
};