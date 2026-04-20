import { adminAuth } from "@/lib/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

const db = getFirestore();

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = req.cookies.get("session")?.value;

    if (!session) {
      return NextResponse.json(
        { ok: false, message: "No session" },
        { status: 401 }
      );
    }

    const decoded = await adminAuth.verifySessionCookie(session, true);

    if (!decoded.admin) {
      return NextResponse.json(
        { ok: false, message: "Not admin" },
        { status: 403 }
      );
    }

    const body = await req.json();

    const updates: any = {};

    if (typeof body.rol === "string") {
      updates.rol = body.rol;
    }

    if (typeof body.activo === "boolean") {
      updates.activo = body.activo;
    }

    await db.collection("usuarios").doc(params.id).update(updates);

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    console.error("ADMIN USUARIO UPDATE ERROR:", error);

    return NextResponse.json(
      { ok: false, message: "Error updating user" },
      { status: 500 }
    );
  }
}