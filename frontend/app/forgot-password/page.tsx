import Link from "next/link";

export default function ForgotPasswordPage() {
  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#f8fafc" }}>
      <section style={{ width: "100%", maxWidth: 420, background: "#fff", borderRadius: 20, padding: 32, boxShadow: "0 20px 50px rgba(15, 23, 42, 0.12)" }}>
        <h1 style={{ margin: 0, fontSize: 28, color: "#111827" }}>Recuperar contraseña</h1>
        <p style={{ marginTop: 16, color: "#6b7280", lineHeight: 1.5 }}>
          La recuperación de contraseña está temporalmente no disponible.
        </p>
        <Link href="/login">Volver al login</Link>
      </section>
    </main>
  );
}
