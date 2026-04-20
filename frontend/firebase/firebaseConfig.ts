import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const requiredEnv = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

for (const [key, value] of Object.entries(requiredEnv)) {
  if (!value || !String(value).trim()) {
    throw new Error(`Falta variable de entorno Firebase: ${key}`);
  }
}

const firebaseConfig = {
  apiKey: requiredEnv.apiKey,
  authDomain: requiredEnv.authDomain,
  projectId: requiredEnv.projectId,
  storageBucket: requiredEnv.storageBucket,
  messagingSenderId: requiredEnv.messagingSenderId,
  appId: requiredEnv.appId,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;