// 📦 Importaciones principales desde el SDK de Firebase
import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Auth, getAuth } from "firebase/auth";
import { Firestore, getFirestore } from "firebase/firestore";
import { FirebaseStorage, getStorage } from "firebase/storage";
// (Opcional) Analytics y Messaging:
// import { getAnalytics } from "firebase/analytics";
// import { getMessaging } from "firebase/messaging";

/**
 * ✅ Configuración de Firebase
 * 📌 Copia estos valores desde:
 * Firebase Console → Configuración del proyecto → Tus apps
 */
const firebaseConfig = {
  apiKey: "AIzaSyAp3S8iDDl2ZrkkfLo51lecZ7m3Og9sRVU",
  authDomain: "shiboapp-7ec65.firebaseapp.com",
  projectId: "shiboapp-7ec65",
  storageBucket: "shiboapp-7ec65.appspot.com",
  messagingSenderId: "1096714428883",
  appId: "1:1096714428883:web:abf53b2d075cc6bded8f26",
  measurementId: "G-3TTHNRLLSW",
} as const;

/**
 * 🧠 Validación básica para evitar errores comunes
 * (Ej.: variables vacías o mal copiadas)
 */
Object.entries(firebaseConfig).forEach(([key, value]) => {
  if (!value) {
    console.error(`⚠️ Configuración Firebase incompleta: falta "${key}"`);
  }
});

/**
 * 🚀 Inicializamos Firebase
 * ⚠️ Solo se inicializa UNA vez (previene errores con Hot Reload en Expo)
 */
let app: FirebaseApp;
try {
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
} catch (error) {
  console.error("❌ Error al inicializar Firebase:", error);
  throw error;
}

/**
 * 🔐 Autenticación — login, registro, recuperación de contraseña, etc.
 */
export const auth: Auth = getAuth(app);

/**
 * 🔥 Firestore — base de datos NoSQL en la nube
 */
export const db: Firestore = getFirestore(app);

/**
 * ☁️ Storage — para subir imágenes, archivos, etc.
 * 📸 Ideal para avatares de usuario, productos, etc.
 */
export const storage: FirebaseStorage = getStorage(app);

/**
 * 📈 (Opcional) Analytics — métricas y eventos del usuario
 * const analytics = getAnalytics(app);
 *
 * 📩 (Opcional) Messaging — notificaciones push
 * const messaging = getMessaging(app);
 */

/**
 * 📤 Exportamos la app principal para usarla en otros módulos si se necesita
 */
export default app;