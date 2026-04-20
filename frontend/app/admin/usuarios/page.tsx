"use client";

import { api } from "@/lib/api";
import { useEffect, useState } from "react";

type Usuario = {
  _id: string;
  nombre?: string;
  email: string;
  rol: "user" | "admin" | "staff";
  activo?: boolean;
};

export default function AdminUsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadUsuarios() {
    setLoading(true);
    setError(null);

    try {
      const res = await api.get<Usuario[]>("/api/admin/usuarios", {
        autoLogoutOn401: true,
      } as any);

      if (!res.ok) {
        setUsuarios([]);
        setError(res.message || "No se pudieron cargar los usuarios.");
        setLoading(false);
        return;
      }

      setUsuarios(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      console.error("ADMIN USUARIOS LOAD ERROR:", err);
      setUsuarios([]);
      setError(err?.message || "No se pudieron cargar los usuarios.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsuarios();
  }, []);

  async function actualizarRol(usuario: Usuario, rol: Usuario["rol"]) {
    if (updatingId) return;

    setUpdatingId(usuario._id);
    setError(null);

    try {
      const res = await api.put(`/api/admin/usuarios/${usuario._id}`, { rol });

      if (!res.ok) {
        setError(res.message || "No se pudo actualizar el rol.");
        setUpdatingId(null);
        return;
      }

      await loadUsuarios();
    } catch (err: any) {
      console.error("ADMIN USUARIOS ROLE ERROR:", err);
      setError(err?.message || "No se pudo actualizar el rol.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function toggleActivo(usuario: Usuario) {
    if (updatingId) return;

    setUpdatingId(usuario._id);
    setError(null);

    try {
      const res = await api.put(`/api/admin/usuarios/${usuario._id}`, {
        activo: !(usuario.activo ?? true),
      });

      if (!res.ok) {
        setError(res.message || "No se pudo actualizar el estado.");
        setUpdatingId(null);
        return;
      }

      await loadUsuarios();
    } catch (err: any) {
      console.error("ADMIN USUARIOS ACTIVO ERROR:", err);
      setError(err?.message || "No se pudo actualizar el estado.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <main style={layout}>
      <header style={header}>
        <div>
          <h1 style={title}>Admin · Usuarios</h1>
          <p style={subtitle}>
            Gestiona usuarios, roles y activación del acceso a la plataforma.
          </p>
        </div>

        <button onClick={() => void loadUsuarios()} style={buttonOutline}>
          Recargar
        </button>
      </header>

      {error ? <div style={errorBox}>{error}</div> : null}

      <section style={card}>
        <div style={tableHeader}>
          <div>Nombre</div>
          <div>Email</div>
          <div>Rol</div>
          <div>Estado</div>
          <div>Acciones</div>
        </div>

        {loading ? (
          <div style={empty}>Cargando usuarios…</div>
        ) : usuarios.length === 0 ? (
          <div style={empty}>No hay usuarios registrados.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {usuarios.map((usuario) => {
              const isUpdating = updatingId === usuario._id;
              const activo = usuario.activo ?? true;

              return (
                <div key={usuario._id} style={row}>
                  <div>
                    <div style={{ fontWeight: 800 }}>
                      {usuario.nombre?.trim() || "Sin nombre"}
                    </div>
                    <div style={idText}>{usuario._id}</div>
                  </div>

                  <div>{usuario.email}</div>

                  <div>
                    <select
                      value={usuario.rol}
                      disabled={isUpdating}
                      onChange={(e) =>
                        void actualizarRol(
                          usuario,
                          e.target.value as Usuario["rol"]
                        )
                      }
                      style={select}
                    >
                      <option value="user">user</option>
                      <option value="staff">staff</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>

                  <div>
                    <span style={statusBadge(activo)}>
                      {activo ? "Activo" : "Inactivo"}
                    </span>
                  </div>

                  <div>
                    <button
                      onClick={() => void toggleActivo(usuario)}
                      disabled={isUpdating}
                      style={buttonOutline}
                    >
                      {isUpdating
                        ? "Actualizando…"
                        : activo
                        ? "Desactivar"
                        : "Activar"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
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
  margin: 0,
  fontSize: 28,
  fontWeight: 900,
};

const subtitle: React.CSSProperties = {
  marginTop: 8,
  marginBottom: 0,
  fontSize: 14,
  color: "rgba(0,0,0,.65)",
};

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(0,0,0,.08)",
  borderRadius: 16,
  padding: 20,
  boxShadow: "0 6px 18px rgba(0,0,0,.06)",
};

const tableHeader: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.2fr 1.4fr 140px 120px 120px",
  gap: 12,
  paddingBottom: 12,
  marginBottom: 12,
  borderBottom: "1px solid rgba(0,0,0,.08)",
  fontWeight: 900,
};

const row: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.2fr 1.4fr 140px 120px 120px",
  gap: 12,
  alignItems: "center",
  padding: 12,
  border: "1px solid rgba(0,0,0,.08)",
  borderRadius: 12,
};

const empty: React.CSSProperties = {
  padding: 16,
  color: "rgba(0,0,0,.65)",
  fontWeight: 700,
};

const idText: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: "rgba(0,0,0,.5)",
  fontFamily: "monospace",
};

const select: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,.12)",
  background: "#fff",
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

function statusBadge(activo: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
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