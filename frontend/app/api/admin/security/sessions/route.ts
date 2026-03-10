// frontend/app/api/admin/security/sessions/route.ts
import { adminAuth } from "@/lib/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

const db = getFirestore();

export async function GET(req: NextRequest) {
  try {
    const session = req.cookies.get("session")?.value;

    if (!session) {
      return NextResponse.json(
        { ok: false, message: "No session" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const decoded = await adminAuth.verifySessionCookie(session, true);

    if (!decoded.admin) {
      return NextResponse.json(
        { ok: false, message: "Not admin" },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    const snapshot = await db
      .collection("admin_sessions")
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();

    const sessions = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json(
      { ok: true, sessions },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("ADMIN SECURITY SESSIONS ERROR:", error);

    return NextResponse.json(
      { ok: false, message: "No se pudieron cargar las sesiones" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}