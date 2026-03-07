"use client";

/**
 * ======================================================
 * ADMIN SHELL — ULTRA ENTERPRISE LAYOUT
 * ======================================================
 * ✔ Sidebar colapsable
 * ✔ Sidebar móvil
 * ✔ Persistencia localStorage
 * ✔ Scroll profesional
 * ✔ Layout estable
 * ✔ Error Boundary
 * ✔ Performance safe
 * ✔ Preparado para dashboards grandes
 * ======================================================
 */

import React, { useEffect, useState } from "react";
import AdminSidebar from "./AdminSidebar";
import AdminTopbar from "./AdminTopbar";

/* ======================================================
   Error Boundary (panel nunca se rompe)
====================================================== */
class AdminErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err: any) {
    console.error("ADMIN UI ERROR:", err);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 40,
            fontWeight: 900,
            fontSize: 18,
          }}
        >
          ⚠️ Error en el panel admin.
        </div>
      );
    }

    return this.props.children;
  }
}

/* ======================================================
   Hook sidebar persistente
====================================================== */
function useSidebarState() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("admin_sidebar");
    if (saved) setCollapsed(saved === "1");
  }, []);

  useEffect(() => {
    localStorage.setItem("admin_sidebar", collapsed ? "1" : "0");
  }, [collapsed]);

  return { collapsed, setCollapsed };
}

/* ======================================================
   Main Shell
====================================================== */
export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { collapsed, setCollapsed } = useSidebarState();
  const [mobileOpen, setMobileOpen] = useState(false);

  function toggleSidebar() {
    setCollapsed(!collapsed);
  }

  function toggleMobile() {
    setMobileOpen(!mobileOpen);
  }

  return (
    <AdminErrorBoundary>
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          background: "#f6f7f9",
        }}
      >
        {/* ================= SIDEBAR ================= */}
        <AdminSidebar
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />

        {/* ================= CONTENT ================= */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
          }}
        >
          <AdminTopbar
            onToggleSidebar={toggleSidebar}
            onToggleMobile={toggleMobile}
          />

          <main
            style={{
              flex: 1,
              padding: 24,
              overflowY: "auto",
            }}
          >
            <div
              style={{
                maxWidth: 1400,
                margin: "0 auto",
                background: "#fff",
                borderRadius: 16,
                padding: 24,
                border: "1px solid rgba(0,0,0,.06)",
                boxShadow: "0 10px 30px rgba(0,0,0,.04)",
                minHeight: "calc(100vh - 100px)",
              }}
            >
              {children}
            </div>
          </main>
        </div>
      </div>
    </AdminErrorBoundary>
  );
}