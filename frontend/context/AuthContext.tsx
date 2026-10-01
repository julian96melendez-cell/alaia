"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "../lib/api";
import { logout as logoutSession, onAuthChange } from "../lib/auth";
import type { UsuarioBase } from "../lib/types";

type AuthContextType = {
  user: UsuarioBase | null;
  loading: boolean;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: React.PropsWithChildren) {
  const [user, setUser] = useState<UsuarioBase | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    let revision = 0;
    async function refreshSession() {
      const request = ++revision;
      // Cache notifications trigger verification; cached users never authenticate.
      setUser(null);
      setLoading(true);
      try {
        const response = await api.get<{ usuario: UsuarioBase }>("/api/auth/me", {
          autoLogoutOn401: false,
        });
        if (!alive || request !== revision) return;
        const current = response.ok ? response.data?.usuario : null;
        setUser(current && (current._id || current.id) ? current : null);
      } catch {
        if (alive && request === revision) setUser(null);
      } finally {
        if (alive && request === revision) setLoading(false);
      }
    }
    const unsubscribe = onAuthChange(() => { void refreshSession(); });
    void refreshSession();
    return () => { alive = false; revision++; unsubscribe(); };
  }, []);

  const logout = async () => {
    setUser(null);
    await logoutSession({ redirect: false });
  };

  return <AuthContext.Provider value={{ user, loading, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return context;
}
