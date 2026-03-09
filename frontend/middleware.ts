import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const session = req.cookies.get("session")?.value;
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/admin") && !session) {
    const response = NextResponse.redirect(new URL("/login", req.url));
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  if (pathname === "/login" && session) {
    const response = NextResponse.redirect(new URL("/admin", req.url));
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/login"],
};