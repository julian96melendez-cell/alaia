import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Rutas que requieren sesión
const PROTECTED_PREFIXES = ["/admin"];

// Rutas públicas (no redirigir si ya estás ahí)
const PUBLIC_PATHS = ["/login"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  // Si tu token está en localStorage, middleware NO lo puede leer.
  // Por eso, para middleware seguro, necesitamos cookie.
  // Solución rápida: proteger del lado cliente también (ver punto 1.2)
  // Y dejar middleware para cuando pasemos a cookies HttpOnly.
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};