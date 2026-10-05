import Link from "next/link";

export default function AdminUnavailablePage() {
  return (
    <section className="p-6" aria-labelledby="unavailable-title">
      <h1 id="unavailable-title" className="text-xl font-semibold">Seguridad</h1>
      <p role="status" className="mt-4">Función temporalmente no disponible</p>
      <p className="mt-2">La consulta de sesiones y alertas está pendiente de conectar al backend autorizado.</p>
      <Link href="/admin" className="mt-4 inline-block underline">Volver al panel</Link>
    </section>
  );
}
