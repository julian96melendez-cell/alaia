"use client";

import {
  getAuth,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import "../../firebase/firebaseConfig";

declare global {
  interface Window {
    recaptchaVerifier?: RecaptchaVerifier;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const auth = getAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [smsCode, setSmsCode] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [mfaResolver, setMfaResolver] = useState<any>(null);

  useEffect(() => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(
        auth,
        "recaptcha-container",
        { size: "invisible" }
      );
    }
  }, [auth]);

  async function createSecureSession(idToken: string) {
    const res = await fetch("/api/session-login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify({ idToken }),
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.message || "No se pudo iniciar la sesión");
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await credential.user.getIdToken(true);

      await createSecureSession(idToken);

      router.push("/admin");
      router.refresh();
    } catch (err: any) {
      if (err?.code === "auth/multi-factor-auth-required") {
        try {
          const resolver = err.resolver;

          if (!resolver?.hints?.length) {
            throw new Error("No hay un segundo factor disponible para esta cuenta.");
          }

          const phoneInfoOptions = {
            multiFactorHint: resolver.hints[0],
            session: resolver.session,
          };

          const phoneAuthProvider = new PhoneAuthProvider(auth);

          const newVerificationId = await phoneAuthProvider.verifyPhoneNumber(
            phoneInfoOptions,
            window.recaptchaVerifier!
          );

          setVerificationId(newVerificationId);
          setMfaResolver(resolver);
          setLoading(false);
          return;
        } catch (mfaSetupError: any) {
          console.error("MFA SETUP ERROR:", mfaSetupError);
          setError(
            mfaSetupError?.message ||
              "No se pudo iniciar la verificación MFA."
          );
          setLoading(false);
          return;
        }
      }

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
          setError("Demasiados intentos. Inténtalo más tarde.");
          break;
        default:
          setError(err?.message || "No se pudo iniciar sesión.");
          break;
      }

      setLoading(false);
    }
  }

  async function verifySms() {
    if (!verificationId || !mfaResolver || !smsCode.trim()) {
      setError("Debes introducir el código SMS.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const phoneCredential = PhoneAuthProvider.credential(
        verificationId,
        smsCode.trim()
      );

      const multiFactorAssertion =
        PhoneMultiFactorGenerator.assertion(phoneCredential);

      const userCredential = await mfaResolver.resolveSignIn(
        multiFactorAssertion
      );

      const idToken = await userCredential.user.getIdToken(true);

      await createSecureSession(idToken);

      router.push("/admin");
      router.refresh();
    } catch (err: any) {
      console.error("MFA ERROR:", err);
      setError("Código SMS incorrecto o verificación fallida.");
      setLoading(false);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <h1 style={styles.title}>Iniciar sesión</h1>

        {error && <div style={styles.errorBox}>{error}</div>}

        {!verificationId ? (
          <form onSubmit={handleSubmit} style={styles.form}>
            <input
              type="email"
              placeholder="Correo electrónico"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={styles.input}
            />

            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={styles.input}
            />

            <button
              type="submit"
              disabled={loading}
              style={{
                ...styles.button,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        ) : (
          <div style={styles.form}>
            <p>Introduce el código SMS</p>

            <input
              type="text"
              value={smsCode}
              onChange={(e) => setSmsCode(e.target.value)}
              placeholder="Código SMS"
              style={styles.input}
            />

            <button
              type="button"
              onClick={verifySms}
              disabled={loading}
              style={{
                ...styles.button,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Verificando..." : "Verificar código"}
            </button>
          </div>
        )}

        <div id="recaptcha-container" />
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
    marginBottom: 20,
    fontSize: 28,
    fontWeight: 700,
    color: "#111827",
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
    cursor: "pointer",
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