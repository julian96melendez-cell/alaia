"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function PagoCanceladoPage() {
  const sp = useSearchParams();
  const ordenId = sp.get("ordenId");

  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-50 px-6">
      <div className="w-full max-w-xl rounded-2xl bg-white p-8 shadow">
        <h1 className="text-2xl font-semibold text-zinc-900">Pago cancelado</h1>
        <p className="mt-3 text-zinc-600">
          El pago no se completó. Puedes intentarlo de nuevo cuando quieras.
        </p>

        {ordenId && (
          <p className="mt-4 text-sm text-zinc-500">
            Orden: <span className="font-mono">{ordenId}</span>
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <Link
            href={ordenId ? `/checkout?ordenId=${ordenId}` : "/"}
            className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2 text-white"
          >
            Intentar de nuevo
          </Link>

          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl border px-4 py-2"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}