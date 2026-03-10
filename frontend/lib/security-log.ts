import crypto from "crypto";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const db = getFirestore();

type AdminSessionLog = {
  uid: string;
  email: string | null;
  ip: string;
  userAgent: string;
  event?: "login" | "logout";
  success?: boolean;
};

export async function logAdminSession({
  uid,
  email,
  ip,
  userAgent,
  event = "login",
  success = true,
}: AdminSessionLog) {
  try {
    const sessionId = crypto.randomUUID();

    await db.collection("admin_sessions").add({
      sessionId,
      uid,
      email,
      ip,
      userAgent,

      event,
      success,

      createdAt: FieldValue.serverTimestamp(),

      metadata: {
        platform: "admin-panel",
        version: "1.0",
      },
    });
  } catch (error) {
    console.error("SECURITY LOG ERROR:", error);
  }
}