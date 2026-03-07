// frontend/lib/push.ts
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * ======================================================
 * REGISTRO DE PUSH NOTIFICATIONS (ENTERPRISE)
 * ======================================================
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // ❌ Push no soportado en simuladores web
  if (!Device.isDevice) {
    console.warn("Push notifications requieren un dispositivo físico");
    return null;
  }

  try {
    // -----------------------------
    // PERMISOS
    // -----------------------------
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();

    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.warn("Permisos de notificación no concedidos");
      return null;
    }

    // -----------------------------
    // TOKEN
    // -----------------------------
    const token = (
      await Notifications.getExpoPushTokenAsync({
        projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
      })
    ).data;

    // -----------------------------
    // ANDROID CONFIG
    // -----------------------------
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
      });
    }

    return token;
  } catch (error) {
    console.error("Error obteniendo push token:", error);
    return null;
  }
}