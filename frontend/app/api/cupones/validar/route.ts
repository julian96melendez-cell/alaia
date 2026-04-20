import { getFirestore } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

const db = getFirestore();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const codigo = String(body.codigo || "").toUpperCase().trim();

    if (!codigo) {
      return NextResponse.json(
        { ok: false, message: "Cupón inválido" },
        { status: 400 }
      );
    }

    const snap = await db
      .collection("cupones")
      .where("codigo", "==", codigo)
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json(
        { ok: false, message: "Cupón no encontrado" },
        { status: 404 }
      );
    }

    const cupon = snap.docs[0].data();

    if (!cupon.activo) {
      return NextResponse.json(
        { ok: false, message: "Cupón desactivado" },
        { status: 400 }
      );
    }

    if (cupon.maxUsos && cupon.usos >= cupon.maxUsos) {
      return NextResponse.json(
        { ok: false, message: "Cupón agotado" },
        { status: 400 }
      );
    }

    if (cupon.fechaExpira) {
      const exp = new Date(cupon.fechaExpira);
      if (Date.now() > exp.getTime()) {
        return NextResponse.json(
          { ok: false, message: "Cupón expirado" },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      data: cupon,
    });
  } catch (error) {
    console.error("VALIDAR CUPON ERROR:", error);

    return NextResponse.json(
      { ok: false, message: "Error validando cupón" },
      { status: 500 }
    );
  }
}