"use client";

import { clearCurrentUser, logout } from "@/lib/auth";
import { useState } from "react";

export default function AdminLogoutButton() {
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    if (loading) return;

    setLoading(true);

    try {
      // 🔐 Primero intenta cerrar sesión en backend
      await logout({
        redirect: false, // controlamos nosotros el redirect
        silent: false,
      });

      // 🧹 Luego limpia estado local
      clearCurrentUser();

      // 🔁 Redirección controlada
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    } catch (error) {
      console.error("LOGOUT ERROR:", error);

      // 🔥 FORZAR limpieza aunque falle backend
      clearCurrentUser();

      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      style={{
        padding: "10px 16px",
        borderRadius: 10,
        border: "1px solid #e5e7eb",
        background: "#fff",
        cursor: loading ? "not-allowed" : "pointer",
        fontWeight: 600,
        fontSize: 14,
        opacity: loading ? 0.7 : 1,
        transition: "all 0.2s ease",
      }}
    >
      {loading ? "Cerrando sesión..." : "Cerrar sesión"}
    </button>
  );
}