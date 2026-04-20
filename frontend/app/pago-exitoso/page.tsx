import Link from "next/link";
import { Suspense } from "react";
import AutoRefresh from "./AutoRefresh";

/* ======================================================
   Tipos estrictos (alineados con backend)
====================================================== */
type EstadoPago =
  | "pendiente"
  | "pagado"
  | "fallido"
  | "reembolsado"
  | "reembolsado_parcial"
  | string;

type EstadoFulfillment =
  | "pendiente"
  | "procesando"
  | "enviado"
  | "entregado"
  | "cancelado"
  | string;

type OrdenPublica = {
  _id: string;
  total: number;
  moneda?: string;
  estadoPago: EstadoPago;
  estadoFulfillment?: EstadoFulfillment;
};

type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  message?: string;
};

/* ======================================================
   UI helpers
====================================================== */
function money(value: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: String(currency || "USD").toUpperCase(),
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  } catch {
    return `$${Number(value || 0).toFixed(2)}`;
  }
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        padding: "6px 12px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        background: "rgba(0,0,0,.05)",
        border: "1px solid rgba(0,0,0,.08)",
      }}
    >
      {children}
    </span>
  );
}

function Card({
  children,
  subtle,
}: {
  children: React.ReactNode;
  subtle?: boolean;
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 18,
        padding: 20,
        border: "1px solid rgba(0,0,0,.08)",
        boxShadow: subtle ? "none" : "0 6px 20px rgba(0,0,0,.06)",
      }}
    >
      {children}
    </div>
  );
}

function getBackendUrl() {
  return (
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3001"
  ).replace(/\/$/, "");
}

function getPagoLabel(estadoPago: EstadoPago) {
  if (estadoPago === "pagado") return "✅ Pago confirmado";
  if (estadoPago === "pendiente") return "⏳ Confirmando pago";
  if (estadoPago === "fallido") return "❌ Pago fallido";
  if (estadoPago === "reembolsado") return "↩️ Pago reembolsado";
  if (estadoPago === "reembolsado_parcial") return "↩️ Reembolso parcial";
  return String(estadoPago || "Estado desconocido");
}

/* ======================================================
   Página SSR — Pago Exitoso
====================================================== */
export default async function PagoExitosoPage(props: {
  searchParams: Promise<{ ordenId?: string; session_id?: string }>;
}) {
  const searchParams = await props.searchParams;

  const ordenIdParam = searchParams?.ordenId;
  const sessionId = searchParams?.session_id;

  const isDev = process.env.NODE_ENV !== "production";
  const backendUrl = getBackendUrl();

  let ordenId: string | undefined = ordenIdParam;

  /* ======================================================
     Fallback: resolver ordenId por session_id
  ====================================================== */
  if (!ordenId && sessionId) {
    try {
      const res = await fetch(
        `${backendUrl}/api/pagos/estado?session_id=${encodeURIComponent(sessionId)}`,
        { cache: "no-store" }
      );

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const json = await res.json();

        if (json?.ok && json?.data?.ordenId) {
          ordenId = json.data.ordenId;
        }
      }
    } catch {
      // silencio intencional
    }
  }

  /* ---------------- Validación base ---------------- */
  if (!ordenId) {
    return (
      <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
        <Card>
          <h1 style={{ margin: 0 }}>❌ Orden no identificada</h1>

          <p style={{ opacity: 0.8, lineHeight: 1.7 }}>
            No se recibió <b>ordenId</b> ni se pudo resolver desde{" "}
            <b>session_id</b> de Stripe.
          </p>

          <pre style={{ opacity: 0.75 }}>
            /pago-exitoso?ordenId=XXXXXXXX
          </pre>

          <div style={{ marginTop: 12 }}>
            <Link href="/">Volver al inicio</Link>
          </div>
        </Card>
      </main>
    );
  }

  /* ---------------- Consulta pública de la orden ---------------- */
  const apiUrl = `${backendUrl}/api/ordenes/public/${encodeURIComponent(ordenId)}`;

  let response: ApiResponse<OrdenPublica> | null = null;

  try {
    const res = await fetch(apiUrl, { cache: "no-store" });

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error("Respuesta no JSON");
    }

    response = await res.json();
  } catch {
    response = null;
  }

  /* ---------------- Error / pendiente / no disponible ---------------- */
  if (!response || !response.ok || !response.data) {
    return (
      <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "grid", gap: 16 }}>
          <Card>
            <h1 style={{ margin: 0 }}>⏳ Estamos confirmando tu pago</h1>

            <p style={{ marginTop: 10, opacity: 0.85, lineHeight: 1.7 }}>
              Tu pago puede haberse procesado, pero aún no recibimos la
              confirmación final. Esta página seguirá comprobando el estado
              automáticamente durante unos instantes.
            </p>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                marginTop: 12,
              }}
            >
              <Badge>Orden: {ordenId}</Badge>
              <Badge>Estado: verificando</Badge>
            </div>

            <p style={{ marginTop: 14, fontWeight: 800 }}>
              👉 Esta página se actualizará automáticamente.
            </p>

            <div
              style={{
                marginTop: 16,
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <Link href="/">Volver al inicio</Link>
            </div>
          </Card>

          {isDev ? (
            <Card subtle>
              <h2 style={{ marginTop: 0 }}>Debug (solo DEV)</h2>
              <pre style={{ fontSize: 12 }}>
                {JSON.stringify({ apiUrl, response }, null, 2)}
              </pre>
            </Card>
          ) : null}
        </div>

        <Suspense fallback={null}>
          <AutoRefresh enabled intervalSeconds={3} maxSeconds={90} />
        </Suspense>
      </main>
    );
  }

  const orden = response.data;
  const pagoLabel = getPagoLabel(orden.estadoPago);
  const isPendiente = orden.estadoPago === "pendiente";

  /* ---------------- Render final ---------------- */
  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "grid", gap: 16 }}>
        <Card>
          <h1 style={{ margin: 0 }}>{pagoLabel}</h1>

          <p style={{ marginTop: 10, opacity: 0.9, lineHeight: 1.7 }}>
            {isPendiente
              ? "Estamos verificando tu pago con Stripe. No cierres esta ventana; la página se actualizará automáticamente."
              : "Gracias por tu compra. Tu orden ya fue registrada correctamente."}
          </p>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              marginTop: 12,
            }}
          >
            <Badge>Orden: {orden._id}</Badge>
            <Badge>Total: {money(orden.total, orden.moneda || "USD")}</Badge>
            {orden.estadoFulfillment ? (
              <Badge>Envío: {orden.estadoFulfillment}</Badge>
            ) : null}
          </div>

          <div
            style={{
              marginTop: 16,
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <Link href="/">Volver al inicio</Link>
            <Link href="/mis-ordenes">Ver mis órdenes</Link>
          </div>
        </Card>

        {isDev ? (
          <Card subtle>
            <h2 style={{ marginTop: 0 }}>Detalle técnico (solo DEV)</h2>
            <pre style={{ fontSize: 12 }}>
              {JSON.stringify(orden, null, 2)}
            </pre>
          </Card>
        ) : null}
      </div>

      <Suspense fallback={null}>
        <AutoRefresh
          enabled={isPendiente}
          intervalSeconds={3}
          maxSeconds={90}
        />
      </Suspense>
    </main>
  );
}