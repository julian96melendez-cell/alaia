import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

let pushToken = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function initPushNotifications() {
  try {
    if (!Device.isDevice) {
      console.log("Push solo funciona en dispositivo físico");
      return null;
    }

    const perm = await Notifications.getPermissionsAsync();
    let status = perm.status;

    if (status !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }

    if (status !== "granted") {
      console.log("Permiso denegado");
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync();
    pushToken = tokenData.data;

    console.log("Expo push token:", pushToken);
    return pushToken;
  } catch (e) {
    console.log("Push init error:", e);
    return null;
  }
}

export function getPushToken() {
  return pushToken;
}

export function setupPushListeners(onReceive) {
  const sub1 = Notifications.addNotificationReceivedListener((notif) => {
    const data = notif.request.content.data || {};
    onReceive && onReceive(data);
  });

  const sub2 = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data || {};
      onReceive && onReceive(data);
    }
  );

  return () => {
    sub1.remove();
    sub2.remove();
  };
}