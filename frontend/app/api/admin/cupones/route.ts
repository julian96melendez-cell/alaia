import { NextResponse } from "next/server";

// Retired Firestore write path. No authentication, SDK or database is initialized.
// A backend replacement requires a separately verified contract.
export async function POST() {
  return NextResponse.json(
    { ok: false, code: "LEGACY_ADMIN_WRITE_DISABLED", message: "Función temporalmente no disponible" },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}
