// Frontend/app/page.tsx
import Link from "next/link";

export default function Home() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f7f7f8" }}>
      <div style={{ width: "min(900px, 92vw)", display: "grid", gap: 14 }}>
        <div
          style={{
            background: "white",
            border: "1px solid rgba(0,0,0,.08)",
            borderRadius: 16,
            padding: 18,
            boxShadow: "0 6px 18px rgba(0,0,0,.06)",
          }}
        >
          <h1 style={{ margin: 0, fontSize: 28 }}>Marketplace</h1>
          <p style={{ marginTop: 8, color: "rgba(0,0,0,.7)" }}>
            Panel principal. Desde aquí puedes ir a tus órdenes y validar pagos.
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <Link
              href="/mis-ordenes"
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                background: "rgba(0,0,0,.9)",
                color: "white",
                fontWeight: 900,
                textDecoration: "none",
              }}
            >
              Ir a Mis Órdenes
            </Link>

            <Link
              href="/admin"
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,.12)",
                background: "white",
                fontWeight: 900,
                textDecoration: "none",
                color: "rgba(0,0,0,.85)",
              }}
            >
              Admin
            </Link>

            <Link href="/login" style={{ textDecoration: "underline", fontWeight: 800 }}>
              Login
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}