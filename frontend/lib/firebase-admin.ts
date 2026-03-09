import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function getEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function getPrivateKey() {
  return getEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");
}

const app =
  getApps()[0] ||
  initializeApp({
    credential: cert({
      projectId: getEnv("FIREBASE_PROJECT_ID"),
      clientEmail: getEnv("FIREBASE_CLIENT_EMAIL"),
      privateKey: getPrivateKey(),
    }),
  });

export const adminAuth = getAuth(app);