import Link from "next/link";

export default function UnavailablePage() {
  return <main className="p-6"><h1>Función temporalmente no disponible</h1><Link href="/seller">Volver al panel</Link></main>;
}
