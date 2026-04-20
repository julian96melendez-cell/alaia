import { adminAuth } from "@/lib/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

const db = getFirestore();

export async function POST(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;

    if (!session) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const decoded = await adminAuth.verifySessionCookie(session, true);

    if (!decoded.admin) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }

    const body = await req.json();

    const codigo = String(body.codigo || "").toUpperCase().trim();

    if (!codigo) {
      return NextResponse.json(
        { ok: false, message: "Código requerido" },
        { status: 400 }
      );
    }

    const ref = await db.collection("cupones").add({
      codigo,
      tipo: body.tipo === "fijo" ? "fijo" : "porcentaje",
      descuento: Number(body.descuento) || 0,
      activo: true,
      maxUsos: Number(body.maxUsos) || null,
      usos: 0,
      fechaExpira: body.fechaExpira || null,
      createdAt: new Date(),
    });

    return NextResponse.json({
      ok: true,
      id: ref.id,
    });
  } catch (error) {
    console.error("CUPON CREATE ERROR:", error);

    return NextResponse.json(
      { ok: false, message: "Error creando cupón" },
      { status: 500 }
    );
  }
}