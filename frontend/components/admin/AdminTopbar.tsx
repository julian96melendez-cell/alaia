"use client";

/**
 * ======================================================
 * AdminTopbar — ULTRA ENTERPRISE (PRO)
 * ======================================================
 * ✔ Sticky topbar
 * ✔ Botón: colapsar sidebar (desktop)
 * ✔ Botón: abrir sidebar (mobile)
 * ✔ Search UX (placeholder)
 * ✔ Logout seguro (confirm opcional)
 * ✔ Accesible (aria)
 * ✔ Preparado para avatar/user chip
 * ======================================================
 */

import { logout } from "@/lib/auth";
import { usePathname } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";

type Props = {
  onToggleSidebar?: () => void; // desktop collapse
  onToggleMobile?: () => void; // mobile drawer
};

function useIsMobile(breakpoint = 980) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, [breakpoint]);

  return isMobile;
}

function titleFromPath(pathname: string | null) {
  const p = (pathname || "").toLowerCase();
  if (p === "/admin") return "Dashboard";
  if (p.startsWith("/admin/ordenes")) return "Órdenes";
  if (p.startsWith("/admin/productos")) return "Productos";
  if (p.startsWith("/admin/usuarios")) return "Usuarios";
  if (p.startsWith("/admin/configuracion")) return "Configuración";
  return "Panel de Administración";
}

export default function AdminTopbar({ onToggleSidebar, onToggleMobile }: Props) {
  const pathname = usePathname();
  const isMobile = useIsMobile();

  const title = useMemo(() => titleFromPath(pathname), [pathname]);

  // Atajo: Ctrl/Cmd + K para “focus” en search (si lo usas más adelante)
  const [search, setSearch] = useState("");
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isCmdK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k";
      if (!isCmdK) return;
      e.preventDefault();
      const el = document.getElementById("admin-global-search") as HTMLInputElement | null;
      el?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function safeLogout() {
    // Si quieres 0 fricción, quita el confirm
    const ok = window.confirm("¿Cerrar sesión de administrador?");
    if (!ok) return;
    logout();
  }

  return (
    <header
      style={{
        height: 64,
        background: "rgba(255,255,255,.92)",
        backdropFilter: "blur(10px)",
        borderBottom: "1px solid rgba(0,0,0,.06)",
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      {/* LEFT */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        {/* Mobile: abrir drawer */}
        {isMobile ? (
          <button
            onClick={onToggleMobile}
            aria-label="Abrir menú admin"
            style={iconBtn}
          >
            ☰
          </button>
        ) : (
          <button
            onClick={onToggleSidebar}
            aria-label="Colapsar sidebar"
            style={iconBtn}
            title="Colapsar sidebar"
          >
            ⟷
          </button>
        )}

        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 950, fontSize: 14, color: "rgba(0,0,0,.85)" }}>
            {title}
          </div>
          <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.6 }}>
            Alaia • Enterprise Admin
          </div>
        </div>
      </div>

      {/* CENTER */}
      <div style={{ flex: 1, display: "flex", justifyContent: "center", padding: "0 12px" }}>
        <div style={{ width: "min(720px, 100%)" }}>
          <div style={searchWrap}>
            <span style={{ fontWeight: 900, opacity: 0.55, fontSize: 12 }}>⌕</span>
            <input
              id="admin-global-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar (Ctrl/Cmd + K)…"
              style={searchInput}
            />
            <span style={{ fontSize: 12, fontWeight: 900, opacity: 0.45 }}>
              {search ? `${search.length}` : ""}
            </span>
          </div>
        </div>
      </div>

      {/* RIGHT */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            padding: "8px 10px",
            borderRadius: 999,
            border: "1px solid rgba(0,0,0,.08)",
            background: "rgba(0,0,0,.03)",
            fontSize: 12,
            fontWeight: 950,
            color: "rgba(0,0,0,.75)",
          }}
          title="Modo enterprise"
        >
          v1 • PRO
        </div>

        <button onClick={safeLogout} style={logoutBtn}>
          Cerrar sesión
        </button>
      </div>
    </header>
  );
}

const iconBtn: React.CSSProperties = {
  height: 40,
  width: 40,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,.10)",
  background: "white",
  cursor: "pointer",
  fontWeight: 950,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const searchWrap: React.CSSProperties = {
  height: 40,
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,.10)",
  background: "white",
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "0 12px",
  boxShadow: "0 6px 16px rgba(0,0,0,.04)",
};

const searchInput: React.CSSProperties = {
  border: "none",
  outline: "none",
  flex: 1,
  fontWeight: 900,
  fontSize: 13,
  background: "transparent",
  color: "rgba(0,0,0,.85)",
};

const logoutBtn: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,.12)",
  background: "white",
  padding: "10px 12px",
  borderRadius: 12,
  fontWeight: 950,
  cursor: "pointer",
};