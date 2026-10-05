import Link from "next/link";

export default function PaymentReturnPage() {
  return <main className="p-6"><h1>Estado del pago no verificado</h1><p>Esta página no confirma un pago ni una cancelación.</p><p>Operaciones financieras temporalmente no disponibles.</p><Link href="/mis-ordenes">Consultar mis órdenes</Link></main>;
}
