import { NextResponse } from "next/server";

// Legacy Firebase session route retired; no replacement or side effect is invoked.
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      code: "LEGACY_FIREBASE_ROUTE_DISABLED",
      message: "Esta ruta heredada ya no está disponible.",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}
