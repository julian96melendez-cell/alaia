"use client";

import "@/firebase/firebaseConfig";
import { getAuth, sendPasswordResetEmail } from "firebase/auth";
import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (loading) return;

    if (!email.trim()) {
      setError("Debes introducir un correo electrónico.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const auth = getAuth();

      await sendPasswordResetEmail(auth, email.trim());

      setSuccess(
        "Te enviamos un correo para restablecer tu contraseña. Revisa tu bandeja de entrada."
      );
    } catch (err: any) {
      console.error("FORGOT PASSWORD ERROR:", err);

      const code = err?.code || "";

      switch (code) {
        case "auth/invalid-email":
          setError("El correo electrónico no es válido.");
          break;

        case "auth/user-not-found":
          setError("No existe una cuenta con ese correo.");
          break;

        case "auth/too-many-requests":
          setError(
            "Demasiados intentos. Inténtalo nuevamente en unos minutos."
          );
          break;

        default:
          setError(
            "No se pudo enviar el correo de recuperación. Inténtalo más tarde."
          );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <h1 style={styles.title}>Recuperar contraseña</h1>

        <p style={styles.subtitle}>
          Introduce tu correo electrónico y te enviaremos un enlace para
          restablecer tu contraseña.
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          {error && <div style={styles.errorBox}>{error}</div>}
          {success && <div style={styles.successBox}>{success}</div>}

          <input
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
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
            {loading ? "Enviando..." : "Enviar enlace"}
          </button>
        </form>

        <div style={styles.loginLink}>
          <Link href="/login">Volver al login</Link>
        </div>
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
    background: "#f8fafc",
  },

  card: {
    width: "100%",
    maxWidth: 420,
    background: "#fff",
    borderRadius: 20,
    padding: 32,
    boxShadow: "0 20px 50px rgba(15, 23, 42, 0.12)",
  },

  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 700,
    color: "#111827",
  },

  subtitle: {
    marginTop: 8,
    color: "#6b7280",
    fontSize: 14,
  },

  form: {
    display: "grid",
    gap: 16,
    marginTop: 20,
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
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
  },

  loginLink: {
    marginTop: 18,
    textAlign: "center",
    fontSize: 14,
  },

  errorBox: {
    backgroundColor: "#fef2f2",
    color: "#b91c1c",
    border: "1px solid #fecaca",
    borderRadius: 12,
    padding: "12px 14px",
    fontSize: 14,
    fontWeight: 600,
  },

  successBox: {
    backgroundColor: "#ecfdf5",
    color: "#065f46",
    border: "1px solid #a7f3d0",
    borderRadius: 12,
    padding: "12px 14px",
    fontSize: 14,
    fontWeight: 600,
  },
};