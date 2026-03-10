"use client";

import { api } from "@/lib/api";
import { useEffect, useState } from "react";

type SecurityLog = {
  id: string;
  uid: string;
  email: string;
  ip: string;
  userAgent: string;
  createdAt: string;
};

export default function AdminSecurityPage() {
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  async function loadLogs() {
    setLoading(true);
    setError(null);

    const res = await api.get<SecurityLog[]>("/api/admin/security-logs", {
      autoLogoutOn401: true,
    });

    if (!res.ok) {
      setError(res.message || "Error cargando logs");
      setLogs([]);
      setLoading(false);
      return;
    }

    setLogs(res.data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadLogs();
  }, []);

  return (
    <main style={layout}>
      <div style={header}>
        <h1 style={title}>Logs de Seguridad</h1>

        <button onClick={loadLogs} style={buttonOutline}>
          Recargar
        </button>
      </div>

      {loading ? (
        <div>Cargando logs…</div>
      ) : error ? (
        <div style={errorBox}>{error}</div>
      ) : logs.length === 0 ? (
        <div>No hay registros.</div>
      ) : (
        <div style={table}>
          <Header />

          {logs.map((log) => (
            <Row key={log.id} log={log} />
          ))}
        </div>
      )}
    </main>
  );
}

function Header() {
  return (
    <div style={headerRow}>
      <div>Email</div>
      <div>IP</div>
      <div>Dispositivo</div>
      <div>Fecha</div>
    </div>
  );
}

function Row({ log }: { log: SecurityLog }) {
  return (
    <div style={row}>
      <div>{log.email || "—"}</div>
      <div style={{ fontFamily: "monospace" }}>{log.ip}</div>
      <div>{log.userAgent}</div>
      <div>{new Date(log.createdAt).toLocaleString()}</div>
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
  alignItems: "center",
};

const title: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 900,
};

const table: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const headerRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "200px 150px 1fr 200px",
  fontWeight: 900,
  borderBottom: "2px solid rgba(0,0,0,.08)",
  paddingBottom: 6,
};

const row: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "200px 150px 1fr 200px",
  padding: 10,
  border: "1px solid rgba(0,0,0,.06)",
  borderRadius: 10,
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