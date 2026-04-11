import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json(
    {
      ok: true,
      message: "Session logout endpoint desactivado.",
    },
    {
      status: 200,
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