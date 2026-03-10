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

    const snapshot = await db
      .collection("admin_sessions")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const logs = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({
      ok: true,
      data: logs,
    });
  } catch (error) {
    console.error("SECURITY LOGS ERROR:", error);

    return NextResponse.json(
      { ok: false, message: "Error loading logs" },
      { status: 500 }
    );
  }
}