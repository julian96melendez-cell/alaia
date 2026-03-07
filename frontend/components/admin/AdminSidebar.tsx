"use client";

/**
 * ======================================================
 * AdminSidebar — ULTRA ENTERPRISE (PRO)
 * ======================================================
 * ✔ Colapsable (desktop)
 * ✔ Drawer mobile con overlay
 * ✔ Cierra automático en navegación (mobile)
 * ✔ Active state robusto
 * ✔ Accesible + estable
 * ✔ Preparado para 100+ módulos
 * ======================================================
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo } from "react";

type Props = {
  collapsed?: boolean;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
};

type Item = { href: string; label: string; icon?: string };

const items: Item[] = [
  { href: "/admin", label: "Dashboard", icon: "⌂" },
  { href: "/admin/ordenes", label: "Órdenes", icon: "🧾" },
  { href: "/admin/productos", label: "Productos", icon: "📦" },
  { href: "/admin/usuarios", label: "Usuarios", icon: "👤" },
  { href: "/admin/configuracion", label: "Configuración", icon: "⚙️" },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/") || pathname.startsWith(href);
}

export default function AdminSidebar({ collapsed = false, mobileOpen = false, onCloseMobile }: Props) {
  const pathname = usePathname() || "/admin";

  // Cierra el drawer al navegar (mobile)
  useEffect(() => {
    if (mobileOpen) onCloseMobile?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const width = collapsed ? 88 : 260;

  const asideContent = useMemo(() => {
    return (
      <aside
        aria-label="Sidebar admin"
        style={{
          width,
          borderRight: "1px solid rgba(0,0,0,.06)",
          background: "white",
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          height: "100vh",
          position: "sticky",
          top: 0,
        }}
      >
        {/* Brand */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 10px",
            borderRadius: 14,
            border: "1px solid rgba(0,0,0,.06)",
            background: "rgba(0,0,0,.02)",
          }}
        >
          <div
            style={{
              height: 34,
              width: 34,
              borderRadius: 12,
              background: "rgba(0,0,0,.92)",
              color: "white",
              fontWeight: 950,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              letterSpacing: 0.2,
            }}
          >
            A
          </div>

          {!collapsed ? (
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 950, fontSize: 13 }}>Alaia Admin</div>
              <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.6 }}>Enterprise</div>
            </div>
          ) : null}
        </div>

        {/* Nav */}
        <nav style={{ display: "grid", gap: 6, marginTop: 6 }}>
          {items.map((it) => {
            const active = isActive(pathname, it.href);

            return (
              <Link
                key={it.href}
                href={it.href}
                style={{
                  textDecoration: "none",
                  padding: collapsed ? "10px 10px" : "10px 12px",
                  borderRadius: 14,
                  fontWeight: 950,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  color: active ? "rgba(0,0,0,.92)" : "rgba(0,0,0,.65)",
                  background: active ? "rgba(0,0,0,.06)" : "transparent",
                  border: active ? "1px solid rgba(0,0,0,.08)" : "1px solid transparent",
                }}
                aria-current={active ? "page" : undefined}
                title={collapsed ? it.label : undefined}
              >
                <span style={{ width: 20, textAlign: "center" }}>{it.icon || "•"}</span>
                {!collapsed ? <span>{it.label}</span> : null}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{ marginTop: "auto" }}>
          <div
            style={{
              borderTop: "1px solid rgba(0,0,0,.06)",
              paddingTop: 12,
              fontSize: 12,
              fontWeight: 900,
              opacity: 0.6,
              display: "flex",
              justifyContent: collapsed ? "center" : "space-between",
              gap: 10,
            }}
          >
            {!collapsed ? <span>v1 • PRO</span> : <span>v1</span>}
            {!collapsed ? <span style={{ fontFamily: "monospace" }}>admin</span> : null}
          </div>
        </div>
      </aside>
    );
  }, [collapsed, pathname, width]);

  // Desktop sidebar normal
  // Mobile: overlay + drawer (sin media queries, controlado por "mobileOpen")
  return (
    <>
      {/* Drawer overlay */}
      {mobileOpen ? (
        <div
          onClick={onCloseMobile}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.35)",
            zIndex: 100,
          }}
          aria-label="Cerrar menú"
        />
      ) : null}

      {/* Mobile drawer container */}
      {mobileOpen ? (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            height: "100vh",
            zIndex: 101,
            boxShadow: "0 24px 60px rgba(0,0,0,.35)",
          }}
        >
          {/* En mobile forzamos expanded */}
          <div style={{ width: 280 }}>
            <AdminSidebar collapsed={false} mobileOpen={false} />
          </div>
        </div>
      ) : (
        // Desktop render
        asideContent
      )}
    </>
  );
}