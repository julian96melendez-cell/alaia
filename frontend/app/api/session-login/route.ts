import { adminAuth } from "@/lib/firebase-admin";
import {
    getClientIp,
    getRateLimitHeaders,
    loginRateLimit,
} from "@/lib/ratelimit";
import { detectSuspiciousLogin } from "@/lib/security-anomaly";
import { logAdminSession } from "@/lib/security-log";
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

    const ip = getClientIp(req.headers);
    const userAgent = req.headers.get("user-agent") || "unknown";
    const rateKey = `ip:${ip}:ua:${userAgent}`;

    const { success, reset } = await loginRateLimit.limit(rateKey);

    if (!success) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Demasiados intentos de inicio de sesión. Inténtalo nuevamente en unos minutos.",
        },
        {
          status: 429,
          headers: getRateLimitHeaders(reset),
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

    await logAdminSession({
      uid: decoded.uid,
      email: decoded.email || null,
      ip,
      userAgent,
      event: "login",
      success: true,
    });

    await detectSuspiciousLogin({
      uid: decoded.uid,
      ip,
      userAgent,
    });

    const expiresIn = 60 * 60 * 8 * 1000;

    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn,
    });

    const response = NextResponse.json(
      {
        ok: true,
        message: "Sesión iniciada correctamente",
      },
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