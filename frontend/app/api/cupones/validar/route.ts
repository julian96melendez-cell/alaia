import { NextResponse } from "next/server";

// Legacy Firestore coupon validation is unavailable; no replacement is invoked.
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      code: "LEGACY_COUPON_VALIDATION_DISABLED",
      message: "Esta ruta heredada de validación de cupones ya no está disponible.",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}
