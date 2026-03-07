// services/storageService.ts
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "../firebase/firebaseConfig";

/**
 * Sube una imagen (URI local de Expo) a Firebase Storage y devuelve la URL pública.
 * path: ej. `users/${uid}/avatar.jpg`
 */
export async function uploadImageFromUri(uri: string, path: string): Promise<string> {
  // 1) Obtener blob desde URI (válido en Expo iOS/Android/Web)
  const resp = await fetch(uri);
  const blob = await resp.blob();

  // 2) Subir a Storage
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);

  // 3) Obtener URL pública
  const url = await getDownloadURL(storageRef);
  return url;
}