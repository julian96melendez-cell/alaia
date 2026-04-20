"use client";

import { api } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";

type FulfillmentEstado =
  | "pendiente"
  | "procesando"
  | "enviado"
  | "entregado"
  | "cancelado";

type FulfillmentOrden = {
  _id: string;
  estadoFulfillment?: FulfillmentEstado;
  trackingNumber?: string;
  carrier?: string;
  internalNote?: string;
  createdAt?: string;
  total?: number;
  usuario?: {
    nombre?: string;
    email?: string;
  };
};

const ESTADOS: FulfillmentEstado[] = [
  "pendiente",
  "procesando",
  "enviado",
  "entregado",
  "cancelado",
];

function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function money(n?: number) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function toneEstado(estado?: string): React.CSSProperties {
  const s = String(estado || "").toLowerCase();

  if (s === "entregado") {
    return {
      background: "rgba(0,140,60,.08)",
      color: "rgba(0,120,50,.95)",
      border: "1px solid rgba(0,140,60,.18)",
    };
  }

  if (s === "procesando" || s === "enviado") {
    return {
      background: "rgba(200,120,0,.10)",
      color: "rgba(160,90,0,.95)",
      border: "1px solid rgba(200,120,0,.20)",
    };
  }

  if (s === "cancelado") {
    return {
      background: "rgba(180,0,20,.08)",
      color: "rgba(160,0,20,.95)",
      border: "1px solid rgba(180,0,20,.18)",
    };
  }

  return {
    background: "rgba(0,0,0,.04)",
    color: "rgba(0,0,0,.75)",
    border: "1px solid rgba(0,0,0,.10)",
  };
}

export default function AdminFulfillmentPage() {
  const [ordenes, setOrdenes] = useState<FulfillmentOrden[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<string>("all");

  async function loadOrdenes() {
    setLoading(true);
    setError(null);

    try {
      const res = await api.get<FulfillmentOrden[]>("/api/admin/fulfillment", {
        autoLogoutOn401: true,
      } as any);

      if (!res.ok) {
        setOrdenes([]);
        setError(res.message || "No se pudieron cargar las órdenes.");
        setLoading(false);
        return;
      }

      setOrdenes(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      console.error("ADMIN FULFILLMENT LOAD ERROR:", err);
      setOrdenes([]);
      setError(err?.message || "No se pudieron cargar las órdenes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrdenes();
  }, []);

  async function actualizarOrden(
    ordenId: string,
    payload: Partial<{
      estadoFulfillment: FulfillmentEstado;
      trackingNumber: string;
      carrier: string;
      internalNote: string;
    }>
  ) {
    if (updatingId) return;

    setUpdatingId(ordenId);
    setError(null);

    try {
      const res = await api.put(`/api/admin/fulfillment/${ordenId}`, payload);

      if (!res.ok) {
        setError(res.message || "No se pudo actualizar la orden.");
        setUpdatingId(null);
        return;
      }

      await loadOrdenes();
    } catch (err: any) {
      console.error("ADMIN FULFILLMENT UPDATE ERROR:", err);
      setError(err?.message || "No se pudo actualizar la orden.");
    } finally {
      setUpdatingId(null);
    }
  }

  const filteredOrdenes = useMemo(() => {
    return ordenes.filter((orden) => {
      const estadoOk =
        estadoFiltro === "all" ||
        String(orden.estadoFulfillment || "").toLowerCase() === estadoFiltro;

      const q = query.trim().toLowerCase();

      if (!q) return estadoOk;

      const nombre = String(orden.usuario?.nombre || "").toLowerCase();
      const email = String(orden.usuario?.email || "").toLowerCase();
      const id = String(orden._id || "").toLowerCase();
      const tracking = String(orden.trackingNumber || "").toLowerCase();
      const carrier = String(orden.carrier || "").toLowerCase();

      const matches =
        nombre.includes(q) ||
        email.includes(q) ||
        id.includes(q) ||
        tracking.includes(q) ||
        carrier.includes(q);

      return estadoOk && matches;
    });
  }, [ordenes, query, estadoFiltro]);

  return (
    <main style={layout}>
      <header style={header}>
        <div>
          <h1 style={title}>Admin · Fulfillment</h1>
          <p style={subtitle}>
            Gestiona estados logísticos, tracking, transportista y notas
            internas de las órdenes.
          </p>
        </div>

        <button onClick={() => void loadOrdenes()} style={buttonOutline}>
          Recargar
        </button>
      </header>

      <section style={card}>
        <div style={filters}>
          <input
            placeholder="Buscar por ID, cliente, email, tracking o transportista"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={input}
          />

          <select
            value={estadoFiltro}
            onChange={(e) => setEstadoFiltro(e.target.value)}
            style={select}
          >
            <option value="all">Todos los estados</option>
            {ESTADOS.map((estado) => (
              <option key={estado} value={estado}>
                {estado}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error ? <div style={errorBox}>{error}</div> : null}

      <section style={card}>
        <div style={counter}>
          {loading
            ? "Cargando órdenes…"
            : `${filteredOrdenes.length} órdenes en fulfillment`}
        </div>

        {loading ? (
          <div style={empty}>Cargando fulfillment…</div>
        ) : filteredOrdenes.length === 0 ? (
          <div style={empty}>No hay órdenes para mostrar.</div>
        ) : (
          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            {filteredOrdenes.map((orden) => (
              <FulfillmentRow
                key={orden._id}
                orden={orden}
                updating={updatingId === orden._id}
                onSave={(payload) => void actualizarOrden(orden._id, payload)}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function FulfillmentRow({
  orden,
  updating,
  onSave,
}: {
  orden: FulfillmentOrden;
  updating: boolean;
  onSave: (payload: Partial<{
    estadoFulfillment: FulfillmentEstado;
    trackingNumber: string;
    carrier: string;
    internalNote: string;
  }>) => void;
}) {
  const [estado, setEstado] = useState<FulfillmentEstado>(
    orden.estadoFulfillment || "pendiente"
  );
  const [tracking, setTracking] = useState(orden.trackingNumber || "");
  const [carrier, setCarrier] = useState(orden.carrier || "");
  const [note, setNote] = useState(orden.internalNote || "");

  return (
    <article style={row}>
      <div style={rowTop}>
        <div>
          <div style={rowTitle}>
            {orden.usuario?.nombre?.trim() || "Cliente sin nombre"}
          </div>
          <div style={rowSub}>
            {orden.usuario?.email || "Sin email"} · ID: {orden._id}
          </div>
        </div>

        <div style={rowBadges}>
          <span style={{ ...badge, ...toneEstado(orden.estadoFulfillment) }}>
            {orden.estadoFulfillment || "pendiente"}
          </span>

          <span style={badgeMuted}>{money(orden.total)}</span>
          <span style={badgeMuted}>{formatDate(orden.createdAt)}</span>
        </div>
      </div>

      <div style={grid}>
        <div>
          <label style={label}>Estado</label>
          <select
            value={estado}
            onChange={(e) =>
              setEstado(e.target.value as FulfillmentEstado)
            }
            disabled={updating}
            style={select}
          >
            {ESTADOS.map((estadoItem) => (
              <option key={estadoItem} value={estadoItem}>
                {estadoItem}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={label}>Tracking</label>
          <input
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            placeholder="Número de seguimiento"
            disabled={updating}
            style={input}
          />
        </div>

        <div>
          <label style={label}>Transportista</label>
          <input
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            placeholder="DHL / FedEx / UPS / etc."
            disabled={updating}
            style={input}
          />
        </div>
      </div>

      <div>
        <label style={label}>Nota interna</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Notas internas del envío"
          disabled={updating}
          style={textarea}
        />
      </div>

      <div style={footer}>
        <div style={smallText}>
          Tracking actual: {orden.trackingNumber?.trim() || "Sin tracking"}
        </div>

        <button
          onClick={() =>
            onSave({
              estadoFulfillment: estado,
              trackingNumber: tracking.trim(),
              carrier: carrier.trim(),
              internalNote: note.trim(),
            })
          }
          disabled={updating}
          style={buttonPrimary}
        >
          {updating ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </article>
  );
}

const layout: React.CSSProperties = {
  maxWidth: 1150,
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

const filters: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 220px",
  gap: 10,
};

const row: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,.08)",
  borderRadius: 14,
  padding: 14,
  display: "grid",
  gap: 14,
};

const rowTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "flex-start",
};

const rowTitle: React.CSSProperties = {
  fontWeight: 900,
  fontSize: 16,
};

const rowSub: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: "rgba(0,0,0,.55)",
};

const rowBadges: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const badge: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
};

const badgeMuted: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  background: "rgba(0,0,0,.04)",
  color: "rgba(0,0,0,.75)",
  border: "1px solid rgba(0,0,0,.10)",
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "180px 1fr 1fr",
  gap: 10,
};

const footer: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const smallText: React.CSSProperties = {
  fontSize: 12,
  color: "rgba(0,0,0,.55)",
};

const label: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 800,
  color: "rgba(0,0,0,.65)",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,.12)",
};

const select: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,.12)",
  background: "#fff",
};

const textarea: React.CSSProperties = {
  width: "100%",
  minHeight: 90,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,.12)",
  resize: "vertical",
};

const counter: React.CSSProperties = {
  fontWeight: 800,
  color: "rgba(0,0,0,.7)",
};

const empty: React.CSSProperties = {
  padding: 16,
  color: "rgba(0,0,0,.65)",
  fontWeight: 700,
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