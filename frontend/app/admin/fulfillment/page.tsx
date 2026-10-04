export default function AdminUnavailablePage() {
  return (
    <section className="p-6" aria-labelledby="unavailable-title">
      <h1 id="unavailable-title" className="text-xl font-semibold">Fulfillment heredado</h1>
      <p role="status" className="mt-4">Función temporalmente no disponible</p>
      <p className="mt-2">Esta pantalla está pendiente de conectar al backend autorizado. No se permiten cambios desde aquí.</p>
    </section>
  );
}
