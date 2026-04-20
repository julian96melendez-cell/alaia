"use client";

import { api } from "@/lib/api";
import { useEffect, useState } from "react";

/**
 * ======================================================
 * AdminSoportePage
 * ======================================================
 * ✔ Lista incidencias
 * ✔ Ver mensajes
 * ✔ Cambiar estado
 * ✔ UI simple y clara para soporte
 * ======================================================
 */

type Ticket = {
  _id: string;
  ordenId?: string;
  usuarioEmail?: string;
  tipo: string;
  mensaje: string;
  estado: "abierto" | "en_revision" | "resuelto";
  prioridad: "baja" | "media" | "alta";
  createdAt: string;
};

export default function AdminSoportePage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadTickets() {
    setLoading(true);
    setError(null);

    try {
      const res = await api.get<Ticket[]>("/api/admin/soporte", {
        autoLogoutOn401: true,
      } as any);

      if (!res.ok) {
        setError(res.message || "No se pudieron cargar los tickets");
        setTickets([]);
        setLoading(false);
        return;
      }

      setTickets(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      setError(err?.message || "Error cargando tickets");
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTickets();
  }, []);

  async function cambiarEstado(id: string, estado: Ticket["estado"]) {
    try {
      const res = await api.put(`/api/admin/soporte/${id}`, {
        estado,
      });

      if (!res.ok) {
        setError(res.message || "No se pudo actualizar");
        return;
      }

      await loadTickets();
    } catch (err: any) {
      setError(err?.message || "Error actualizando estado");
    }
  }

  return (
    <main style={layout}>
      <header style={header}>
        <h1 style={title}>Soporte · Incidencias</h1>

        <button onClick={loadTickets} style={buttonOutline}>
          Recargar
        </button>
      </header>

      {loading ? (
        <div>Cargando incidencias…</div>
      ) : tickets.length === 0 ? (
        <div>No hay incidencias registradas.</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {tickets.map((t) => (
            <TicketRow key={t._id} ticket={t} onEstado={cambiarEstado} />
          ))}
        </div>
      )}

      {error ? <div style={errorBox}>{error}</div> : null}
    </main>
  );
}

function TicketRow({
  ticket,
  onEstado,
}: {
  ticket: Ticket;
  onEstado: (id: string, estado: Ticket["estado"]) => void;
}) {
  return (
    <div style={card}>
      <div style={rowTop}>
        <div style={badge(ticket.estado)}>
          {ticket.estado.replace("_", " ")}
        </div>

        <div style={priority(ticket.prioridad)}>
          Prioridad: {ticket.prioridad}
        </div>
      </div>

      <div style={rowGrid}>
        <div>
          <strong>Tipo</strong>
          <div>{ticket.tipo}</div>
        </div>

        <div>
          <strong>Orden</strong>
          <div>{ticket.ordenId || "—"}</div>
        </div>

        <div>
          <strong>Usuario</strong>
          <div>{ticket.usuarioEmail || "—"}</div>
        </div>

        <div>
          <strong>Fecha</strong>
          <div>{new Date(ticket.createdAt).toLocaleString()}</div>
        </div>
      </div>

      <div style={mensaje}>{ticket.mensaje}</div>

      <div style={actions}>
        <button
          onClick={() => onEstado(ticket._id, "abierto")}
          style={buttonOutline}
        >
          Abrir
        </button>

        <button
          onClick={() => onEstado(ticket._id, "en_revision")}
          style={buttonOutline}
        >
          Revisar
        </button>

        <button
          onClick={() => onEstado(ticket._id, "resuelto")}
          style={buttonPrimary}
        >
          Resolver
        </button>
      </div>
    </div>
  );
}

/* ======================================================
   Styles
====================================================== */

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
  alignItems: "center",
};

const title: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
};

const card: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,.08)",
  borderRadius: 14,
  padding: 16,
  background: "#fff",
  display: "grid",
  gap: 12,
};

const rowTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const rowGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))",
  gap: 10,
};

const mensaje: React.CSSProperties = {
  background: "rgba(0,0,0,.04)",
  padding: 10,
  borderRadius: 10,
};

const actions: React.CSSProperties = {
  display: "flex",
  gap: 10,
};

function badge(estado: string): React.CSSProperties {
  const map: any = {
    abierto: "#f59e0b",
    en_revision: "#3b82f6",
    resuelto: "#16a34a",
  };

  return {
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    background: map[estado] || "#999",
    color: "white",
  };
}

function priority(p: string): React.CSSProperties {
  const map: any = {
    baja: "#94a3b8",
    media: "#f59e0b",
    alta: "#ef4444",
  };

  return {
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    background: map[p] || "#999",
    color: "white",
  };
}

const buttonPrimary: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "none",
  background: "black",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};

const buttonOutline: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,.12)",
  background: "#fff",
  cursor: "pointer",
};

const errorBox: React.CSSProperties = {
  background: "#fff3f3",
  border: "1px solid #ffd3d3",
  padding: 12,
  borderRadius: 12,
  color: "#b00020",
};