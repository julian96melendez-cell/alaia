"use client";

import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import "../../firebase/firebaseConfig";

export default function LoginPage() {
  const router = useRouter();

  const auth = useMemo(() => getAuth(), []);

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
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const user = credential.user;

      if (!user) {
        throw new Error("No se pudo iniciar sesión.");
      }

      // Aquí puedes agregar lógica de roles más adelante
      // Por ahora redirigimos al admin si el login fue exitoso
      router.push("/admin");
      router.refresh();
    } catch (err: any) {
      console.error("LOGIN ERROR:", err);

      const code = err?.code || "";

      switch (code) {
        case "auth/invalid-email":
          setError("El correo electrónico no es válido.");
          break;
        case "auth/user-not-found":
          setError("No existe una cuenta con ese correo.");
          break;
        case "auth/wrong-password":
          setError("La contraseña es incorrecta.");
          break;
        case "auth/invalid-credential":
          setError("Correo o contraseña incorrectos.");
          break;
        case "auth/too-many-requests":
          setError("Demasiados intentos. Inténtalo de nuevo más tarde.");
          break;
        default:
          setError("No se pudo iniciar sesión. Verifica tus datos.");
          break;
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>Iniciar sesión</h1>
          <p style={styles.subtitle}>
            Accede al panel de administración de Alaia
          </p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          {error ? <div style={styles.errorBox}>{error}</div> : null}

          <div style={styles.field}>
            <label htmlFor="email" style={styles.label}>
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              style={styles.input}
            />
          </div>

          <div style={styles.field}>
            <label htmlFor="password" style={styles.label}>
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              placeholder="Tu contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              style={styles.input}
            />
          </div>

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
    padding: "24px",
    background:
      "linear-gradient(180deg, #f8fafc 0%, #eef2ff 50%, #f8fafc 100%)",
  },
  card: {
    width: "100%",
    maxWidth: "420px",
    backgroundColor: "#ffffff",
    borderRadius: "20px",
    padding: "32px",
    boxShadow: "0 20px 50px rgba(15, 23, 42, 0.12)",
    border: "1px solid rgba(0,0,0,0.06)",
  },
  header: {
    marginBottom: "24px",
  },
  title: {
    margin: 0,
    fontSize: "28px",
    fontWeight: 700,
    color: "#111827",
  },
  subtitle: {
    marginTop: "8px",
    marginBottom: 0,
    fontSize: "14px",
    color: "#6b7280",
  },
  form: {
    display: "grid",
    gap: "16px",
  },
  field: {
    display: "grid",
    gap: "8px",
  },
  label: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#111827",
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "12px",
    border: "1px solid #d1d5db",
    fontSize: "14px",
    outline: "none",
    backgroundColor: "#ffffff",
    color: "#111827",
  },
  button: {
    marginTop: "8px",
    width: "100%",
    padding: "12px 16px",
    borderRadius: "12px",
    border: "none",
    backgroundColor: "#111827",
    color: "#ffffff",
    fontSize: "15px",
    fontWeight: 700,
  },
  errorBox: {
    backgroundColor: "#fef2f2",
    color: "#b91c1c",
    border: "1px solid #fecaca",
    borderRadius: "12px",
    padding: "12px 14px",
    fontSize: "14px",
    fontWeight: 600,
  },
};