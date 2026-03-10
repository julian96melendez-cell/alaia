import { getFirestore } from "firebase-admin/firestore";

const db = getFirestore();

export async function logAdminSession({
  uid,
  email,
  ip,
  userAgent,
}: {
  uid: string;
  email: string | null;
  ip: string;
  userAgent: string;
}) {
  try {
    await db.collection("admin_sessions").add({
      uid,
      email,
      ip,
      userAgent,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("SECURITY LOG ERROR:", error);
  }
}