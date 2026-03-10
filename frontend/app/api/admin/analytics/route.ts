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

    const snapshot = await db.collection("ordenes").get();

    const stats: Record<
      string,
      { fecha: string; ingresos: number; ordenes: number }
    > = {};

    snapshot.docs.forEach((doc) => {
      const data: any = doc.data();

      const created = data.createdAt
        ? new Date(data.createdAt)
        : new Date();

      const day = created.toISOString().slice(0, 10);

      if (!stats[day]) {
        stats[day] = {
          fecha: day,
          ingresos: 0,
          ordenes: 0,
        };
      }

      stats[day].ordenes += 1;

      if (data.estadoPago === "pagado") {
        stats[day].ingresos += Number(data.total || 0);
      }
    });

    const data = Object.values(stats).sort((a, b) =>
      a.fecha.localeCompare(b.fecha)
    );

    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error) {
    console.error("ANALYTICS ERROR:", error);

    return NextResponse.json(
      { ok: false, message: "Error loading analytics" },
      { status: 500 }
    );
  }
}