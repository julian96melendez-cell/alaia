import { adminAuth } from "@/lib/firebase-admin";
import {
    getClientIp,
    getRateLimitHeaders,
    logoutRateLimit,
} from "@/lib/ratelimit";
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

    const { success, reset } = await logoutRateLimit.limit(rateKey);

    if (!success) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Demasiadas solicitudes de cierre de sesión. Inténtalo nuevamente en unos minutos.",
        },
        {
          status: 429,
          headers: getRateLimitHeaders(reset),
        }
      );
    }

    const session = req.cookies.get("session")?.value;

    if (session) {
      try {
        const decoded = await adminAuth.verifySessionCookie(session, true);
        await adminAuth.revokeRefreshTokens(decoded.sub);
      } catch (error) {
        console.error("SESSION REVOKE ERROR:", error);
      }
    }

    const response = NextResponse.json(
      { ok: true, message: "Sesión cerrada correctamente" },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );

    response.cookies.set("session", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error("SESSION LOGOUT ERROR:", error);

    const response = NextResponse.json(
      { ok: false, message: "No se pudo cerrar sesión" },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );

    response.cookies.set("session", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return response;
  }
}