// frontend/lib/push.ts
// Versión web (Next.js) – Push deshabilitado

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // En la web no usamos Expo Push
  return null;
}