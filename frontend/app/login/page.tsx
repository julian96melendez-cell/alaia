"use client";

import { setCurrentUser } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useState } from "react";

type UserRole = "admin" | "vendedor" | "usuario";
type SellerStatus = "pending" | "approved" | "suspended" | null;

type LoginResponse = {
  ok: boolean;
  message?: string;
  data?: {
    usuario?: {
      id?: string;
      _id?: string;
      nombre: string;
      email: string;
      rol: UserRole;
      activo?: boolean;
      bloqueado?: boolean;
      sellerStatus?: SellerStatus;
      stripeAccountId?: string | null;
      stripeOnboardingComplete?: boolean;
      stripeChargesEnabled?: boolean;
      stripePayoutsEnabled?: boolean;
    };
  };
};

function getApiBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    ""
  );
}

function buildLoginUrl() {
  const apiUrl = getApiBaseUrl();

  if (!apiUrl) {
    throw new Error(
      "Falta NEXT_PUBLIC_API_URL o NEXT_PUBLIC_BACKEND_URL en el frontend."
    );
  }

  return `${apiUrl.replace(/\/$/, "")}/api/auth/login`;
}

function getRedirectByRole(
  usuario: NonNullable<LoginResponse["data"]>["usuario"]
) {
  if (!usuario) return "/";

  switch (usuario.rol) {
    case "admin":
      return "/admin";

    case "vendedor":
      if (usuario.sellerStatus === "suspended") {
        return "/";
      }
      return "/seller";

    case "usuario":
    default:
      return "/";
  }
}

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
      const res = await fetch(buildLoginUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data: LoginResponse = await res.json().catch(() => ({
        ok: false,
        message: "Respuesta inválida del servidor",
      }));

      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || "No se pudo iniciar sesión.");
      }

      const usuario = data?.data?.usuario;

      if (!usuario) {
        throw new Error("El backend no devolvió el usuario autenticado.");
      }

      if (usuario.activo === false) {
        throw new Error("Tu cuenta está inactiva.");
      }

      if (usuario.bloqueado === true) {
        throw new Error("Tu cuenta está bloqueada.");
      }

      if (usuario.rol === "vendedor" && usuario.sellerStatus === "suspended") {
        throw new Error("Tu cuenta de vendedor está suspendida.");
      }

      setCurrentUser(usuario);

      router.push(getRedirectByRole(usuario));
      router.refresh();
    } catch (err: any) {
      console.error("LOGIN ERROR:", err);
      setError(err?.message || "No se pudo iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <h1 style={styles.title}>Iniciar sesión</h1>
        <p style={styles.subtitle}>Accede a tu cuenta de forma segura</p>

        {error && <div style={styles.errorBox}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="email"
            name="email"
            id="email"
            placeholder="Correo electrónico"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={styles.input}
          />

          <input
            type="password"
            name="password"
            id="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={styles.input}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.button,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    background:
      "linear-gradient(180deg, #f8fafc 0%, #eef2ff 50%, #f8fafc 100%)",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 32,
    boxShadow: "0 20px 50px rgba(15, 23, 42, 0.12)",
    border: "1px solid rgba(0,0,0,0.06)",
  },
  title: {
    margin: 0,
    marginBottom: 8,
    fontSize: 28,
    fontWeight: 700,
    color: "#111827",
  },
  subtitle: {
    margin: 0,
    marginBottom: 20,
    fontSize: 14,
    color: "#6b7280",
  },
  form: {
    display: "grid",
    gap: 16,
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #d1d5db",
    fontSize: 14,
    outline: "none",
  },
  button: {
    width: "100%",
    padding: "12px 16px",
    borderRadius: 12,
    border: "none",
    backgroundColor: "#111827",
    color: "#ffffff",
    fontSize: 15,
    fontWeight: 700,
  },
  errorBox: {
    backgroundColor: "#fef2f2",
    color: "#b91c1c",
    border: "1px solid #fecaca",
    borderRadius: 12,
    padding: "12px 14px",
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 16,
  },
};