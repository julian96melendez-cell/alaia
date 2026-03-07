import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { AuthProvider } from "../context/AuthContext";
import { CartProvider } from "../context/CartContext";
import { RealtimeProvider } from "../context/RealtimeContext";
import { ThemeProvider } from "../context/ThemeContext";

SplashScreen.preventAutoHideAsync();

/**
 * LISTENERS GLOBALES
 */
function useGlobalAppListeners() {
  useEffect(() => {
    const handleDeepLink = (url: string) => {
      try {
        const parsed = new URL(url);
        const path = parsed.pathname;

        if (path.startsWith("/track/")) {
          const ordenId = path.replace("/track/", "");
          if (ordenId) router.push(`/track/${ordenId}`);
        }
      } catch {}
    };

    return () => {};
  }, []);
}

/**
 * PUSH SOLO EN MÓVIL
 */
async function initPushIfMobile() {
  if (Platform.OS === "web") return;

  const { initPushNotifications, setupPushListeners } =
    await import("../services/pushService");

  await initPushNotifications();

  setupPushListeners((data: any) => {
    if (data?.ordenId) {
      router.push(`/track/${data.ordenId}`);
    }
  });
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useGlobalAppListeners();

  useEffect(() => {
    const prepare = async () => {
      try {
        await initPushIfMobile();
        await new Promise((res) => setTimeout(res, 500));
      } finally {
        setReady(true);
        await SplashScreen.hideAsync();
      }
    };
    prepare();
  }, []);

  if (!ready) {
    return <View style={styles.splash} />;
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <CartProvider>
          <RealtimeProvider>
            <StatusBar style="auto" />

            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="track/[ordenId]" />
              <Stack.Screen name="modal" />
              <Stack.Screen name="error" />
            </Stack>
          </RealtimeProvider>
        </CartProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: "#fff",
  },
});