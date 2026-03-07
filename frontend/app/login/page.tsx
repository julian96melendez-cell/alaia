"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setTokens } from "../../lib/auth";

type LoginResponse = {
  ok: boolean;
  message?: string;
  data?: {
    usuario: {
      id: string;
      email: string;
      rol: "admin" | "user";
    };
    tokens: {
      accessToken: string;
      refreshToken?: string;
    };
  };
};

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const backendUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL ||
        "http://localhost:3001";

      const res = await fetch(`${backendUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data: LoginResponse = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.message || "Credenciales inválidas");
      }

      const tokens = data.data?.tokens;
      const rol = data.data?.usuario?.rol;

      if (!tokens?.accessToken) {
        throw new Error("No se recibió accessToken.");
      }

      // Guardar tokens
      setTokens(tokens);

      // Redirección
      if (rol === "admin") {
        router.push("/admin");
      } else {
        router.push("/");
      }

      router.refresh();
    } catch (err: any) {
      console.error("LOGIN ERROR:", err);
      setError(err.message || "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={container}>
      <form onSubmit={handleSubmit} style={form}>
        <h2>Iniciar sesión</h2>

        {error && <div style={errorBox}>{error}</div>}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={input}
        />

        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={input}
        />

        <button type="submit" disabled={loading} style={button}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}

const container: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f5f5f7",
};

const form: React.CSSProperties = {
  width: 360,
  background: "#fff",
  padding: 24,
  borderRadius: 12,
  boxShadow: "0 10px 30px rgba(0,0,0,.08)",
  display: "grid",
  gap: 12,
};

const input: React.CSSProperties = {
  padding: 12,
  borderRadius: 8,
  border: "1px solid rgba(0,0,0,.15)",
  fontSize: 14,
};

const button: React.CSSProperties = {
  padding: 12,
  borderRadius: 8,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const errorBox: React.CSSProperties = {
  background: "#ffe5e5",
  padding: 10,
  borderRadius: 8,
  color: "red",
  fontWeight: 600,
};