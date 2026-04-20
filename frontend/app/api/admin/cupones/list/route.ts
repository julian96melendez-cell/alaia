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

    const snap = await db.collection("cupones").orderBy("createdAt", "desc").get();

    const cupones = snap.docs.map((doc) => ({
      _id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({
      ok: true,
      data: cupones,
    });
  } catch (error) {
    console.error("CUPONES LIST ERROR:", error);

    return NextResponse.json(
      { ok: false, message: "Error cargando cupones" },
      { status: 500 }
    );
  }
}