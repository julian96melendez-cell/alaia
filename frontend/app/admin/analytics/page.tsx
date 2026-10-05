import Link from "next/link";

export default function AdminUnavailablePage() {
  return (
    <section className="p-6" aria-labelledby="unavailable-title">
      <h1 id="unavailable-title" className="text-xl font-semibold">Analytics</h1>
      <p role="status" className="mt-4">Función temporalmente no disponible</p>
      <p className="mt-2">Esta pantalla está pendiente de adaptar al contrato del backend autorizado.</p>
      <Link href="/admin" className="mt-4 inline-block underline">Volver al panel</Link>
    </section>
  );
}
