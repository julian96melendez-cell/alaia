"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function Card({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: 720,
        borderRadius: 22,
        background: "#ffffff",
        padding: 32,
        border: "1px solid rgba(15,23,42,.08)",
        boxShadow: "0 12px 30px rgba(15,23,42,.06)",
      }}
    >
      {children}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "6px 10px",
        borderRadius: 999,
        background: "rgba(15,23,42,.06)",
        border: "1px solid rgba(15,23,42,.10)",
        fontSize: 12,
        fontWeight: 800,
        color: "#334155",
      }}
    >
      {children}
    </span>
  );
}

function ActionLink({
  href,
  label,
  primary = false,
}: {
  href: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        textDecoration: "none",
        padding: "12px 16px",
        borderRadius: 12,
        fontSize: 14,
        fontWeight: 800,
        ...(primary
          ? {
              background: "#0f172a",
              color: "#fff",
            }
          : {
              background: "#fff",
              color: "#0f172a",
              border: "1px solid rgba(15,23,42,.12)",
            }),
      }}
    >
      {label}
    </Link>
  );
}

function PagoCanceladoContent() {
  const sp = useSearchParams();
  const ordenId = sp.get("ordenId");

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
        padding: 24,
      }}
    >
      <Card>
        <div style={{ display: "grid", gap: 16 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              width: "fit-content",
              padding: "6px 10px",
              borderRadius: 999,
              background: "rgba(245,158,11,.10)",
              color: "#92400e",
              fontSize: 12,
              fontWeight: 900,
            }}
          >
            Pago cancelado
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <h1
              style={{
                margin: 0,
                fontSize: 32,
                lineHeight: 1.1,
                fontWeight: 900,
                color: "#0f172a",
              }}
            >
              No se completó el pago
            </h1>

            <p
              style={{
                margin: 0,
                fontSize: 15,
                lineHeight: 1.7,
                color: "rgba(15,23,42,.68)",
                maxWidth: 620,
              }}
            >
              El pago fue cancelado o no llegó a completarse. Puedes volver a
              intentarlo cuando quieras sin problema.
            </p>
          </div>

          {ordenId ? (
            <div>
              <Badge>Orden: {ordenId}</Badge>
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              marginTop: 4,
            }}
          >
            <ActionLink
              href={ordenId ? `/checkout?ordenId=${encodeURIComponent(ordenId)}` : "/"}
              label="Intentar de nuevo"
              primary
            />

            <ActionLink href="/" label="Volver al inicio" />
          </div>
        </div>
      </Card>
    </main>
  );
}

function LoadingFallback() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
        padding: 24,
        color: "#475569",
        fontWeight: 700,
      }}
    >
      Cargando…
    </main>
  );
}

export default function PagoCanceladoPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PagoCanceladoContent />
    </Suspense>
  );
}