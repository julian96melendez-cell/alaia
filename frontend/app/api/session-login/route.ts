import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      message:
        "Este endpoint fue desactivado. Usa el login del backend principal.",
    },
    {
      status: 410,
      headers: { "Cache-Control": "no-store" },
    }
  );
}