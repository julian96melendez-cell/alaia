import { adminAuth } from "@/lib/firebase-admin";
import { NextRequest, NextResponse } from "next/server";

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

    return NextResponse.json({
      ok: true,
      user: {
        uid: decoded.uid,
        email: decoded.email || null,
        admin: decoded.admin === true,
      },
    });
  } catch (error) {
    console.error("SESSION ME ERROR:", error);

    return NextResponse.json(
      { ok: false, message: "Invalid session" },
      { status: 401 }
    );
  }
}