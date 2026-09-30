import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Import especial para React Native.
// En algunas versiones Firebase no lo tipa bien, por eso usamos require.
const { getReactNativePersistence } = require("firebase/auth");

const firebaseConfig = {
  apiKey: "AIzaSyAp3S8iDDI2ZrkKfLo5tlecZ7m3Og9sRVU",
  authDomain: "shiboapp-7ec65.firebaseapp.com",
  projectId: "shiboapp-7ec65",
  storageBucket: "shiboapp-7ec65.appspot.com",
  messagingSenderId: "1096714428883",
  appId: "1:1096714428883:web:abf53b2d075cc6bded8f26",
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let firebaseAuth;

try {
  firebaseAuth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  firebaseAuth = getAuth(app);
}

export const auth = firebaseAuth;
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;