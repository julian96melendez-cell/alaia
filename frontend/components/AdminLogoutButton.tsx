"use client";

import "@/firebase/firebaseConfig";
import { getAuth, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminLogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    if (loading) return;

    setLoading(true);

    try {
      await fetch("/api/session-logout", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });

      await signOut(getAuth());

      router.replace("/login");
      router.refresh();
    } catch (error) {
      console.error("LOGOUT ERROR:", error);

      try {
        await signOut(getAuth());
      } catch {}

      router.replace("/login");
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