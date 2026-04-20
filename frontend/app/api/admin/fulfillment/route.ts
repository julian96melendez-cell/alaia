import { adminAuth } from "@/lib/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

const db = getFirestore();

export async function GET(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;

    if (!session) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const decoded = await adminAuth.verifySessionCookie(session, true);

    if (!decoded.admin) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }

    const snapshot = await db
      .collection("ordenes")
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();

    const ordenes = snapshot.docs.map((doc) => ({
      _id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({
      ok: true,
      data: ordenes,
    });
  } catch (error) {
    console.error("FULFILLMENT LIST ERROR:", error);

    return NextResponse.json(
      { ok: false, message: "Error cargando órdenes" },
      { status: 500 }
    );
  }
}