import { adminAuth } from "@/lib/firebase-admin";
import { NextRequest, NextResponse } from "next/server";

function isAllowedOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");

  if (!origin || !host) return false;

  try {
    const originUrl = new URL(origin);
    return originUrl.host === host;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isAllowedOrigin(req)) {
      return NextResponse.json(
        { ok: false, message: "Origen no permitido" },
        {
          status: 403,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    const body = await req.json();
    const idToken = body?.idToken;

    if (!idToken || typeof idToken !== "string") {
      return NextResponse.json(
        { ok: false, message: "Missing idToken" },
        {
          status: 400,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    const decoded = await adminAuth.verifyIdToken(idToken, true);

    if (!decoded.admin) {
      return NextResponse.json(
        { ok: false, message: "No autorizado como administrador" },
        {
          status: 403,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    const expiresIn = 60 * 60 * 8 * 1000; // 8 horas

    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn,
    });

    const response = NextResponse.json(
      { ok: true },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );

    response.cookies.set("session", sessionCookie, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: expiresIn / 1000,
    });

    return response;
  } catch (error) {
    console.error("SESSION LOGIN ERROR:", error);

    return NextResponse.json(
      { ok: false, message: "No se pudo iniciar la sesión segura" },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}