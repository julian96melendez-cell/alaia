import { getFirestore } from "firebase-admin/firestore";

const db = getFirestore();

export async function detectSuspiciousLogin({
  uid,
  ip,
  userAgent,
}: {
  uid: string;
  ip: string;
  userAgent: string;
}) {
  try {
    const sessions = await db
      .collection("admin_sessions")
      .where("uid", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(5)
      .get();

    if (sessions.empty) return;

    let ipKnown = false;
    let deviceKnown = false;

    sessions.forEach((doc) => {
      const data = doc.data();

      if (data.ip === ip) {
        ipKnown = true;
      }

      if (data.userAgent === userAgent) {
        deviceKnown = true;
      }
    });

    if (!ipKnown || !deviceKnown) {
      await db.collection("security_alerts").add({
        uid,
        ip,
        userAgent,
        type: "suspicious_login",
        createdAt: new Date(),
      });

      console.warn("⚠️ Suspicious admin login detected");
    }
  } catch (error) {
    console.error("ANOMALY DETECTION ERROR:", error);
  }
}