import { adminAuth } from "@/lib/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

const db = getFirestore();

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = req.cookies.get("session")?.value;

    if (!session) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const decoded = await adminAuth.verifySessionCookie(session, true);

    if (!decoded.admin) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }

    const body = await req.json();

    const updates: any = {};

    if (body.estadoFulfillment) {
      updates.estadoFulfillment = body.estadoFulfillment;
    }

    if (typeof body.trackingNumber === "string") {
      updates.trackingNumber = body.trackingNumber;
    }

    if (typeof body.carrier === "string") {
      updates.carrier = body.carrier;
    }

    if (typeof body.internalNote === "string") {
      updates.internalNote = body.internalNote;
    }

    updates.updatedAt = new Date();

    await db.collection("ordenes").doc(params.id).update(updates);

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    console.error("FULFILLMENT UPDATE ERROR:", error);

    return NextResponse.json(
      { ok: false, message: "Error actualizando orden" },
      { status: 500 }
    );
  }
}