// frontend/app/api/admin/security/alerts/route.ts
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
      .collection("security_alerts")
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();

    const alerts = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json(
      { ok: true, alerts },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("ADMIN SECURITY ALERTS ERROR:", error);

    return NextResponse.json(
      { ok: false, message: "No se pudieron cargar las alertas" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}