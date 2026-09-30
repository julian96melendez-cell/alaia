import { installSafeLogging } from "../utils/safeLogging";
import { Ionicons } from "@expo/vector-icons";
import { StripeProvider } from "@stripe/stripe-react-native";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, View } from "react-native";

import { AuthProvider } from "../context/AuthContext";
import { CartProvider } from "../context/CartContext";
import { ThemeProvider } from "../context/ThemeContext";

installSafeLogging();
SplashScreen.preventAutoHideAsync().catch(() => {});

const DEFAULT_BG = "#FFFFFF";
const TEXT_COLOR = "#111827";

const STRIPE_PUBLISHABLE_KEY =
  "pk_test_51SceVgHsTSfy0RokDNnyR4LflmLb2B7Hr0W5PUhNbZpTtcJiWgNBDCpOpqKlsbuqWxzdN56kyNBh7KcR7QKluFyn00faLUzvIi";


const APP_URL_SCHEME = "alaiaclean";

function getTrackingIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;

    if (!path.startsWith("/track/")) return null;

    const ordenId = path.replace("/track/", "").trim();
    return ordenId || null;
  } catch {
    return null;
  }
}

function openTrackFromUrl(url: string) {
  const ordenId = getTrackingIdFromUrl(url);
  if (!ordenId) return;

  router.replace(`/track/${ordenId}` as any);
}

function useGlobalAppListeners() {
  useEffect(() => {
    Linking.getInitialURL()
      .then((url) => {
        if (url) openTrackFromUrl(url);
      })
      .catch(() => {});

    const subscription = Linking.addEventListener("url", ({ url }) => {
      openTrackFromUrl(url);
    });

    return () => subscription.remove();
  }, []);
}

async function initPushIfMobile(onTrackPress: (ordenId: string) => void) {
  if (Platform.OS === "web") return;

  try {
    const { initPushNotifications, setupPushListeners } = await import(
      "../services/pushService"
    );

    await initPushNotifications();

    setupPushListeners((data: any) => {
      const ordenId = String(data?.ordenId || "").trim();
      if (ordenId) onTrackPress(ordenId);
    });
  } catch {}
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const initializedRef = useRef(false);

  useGlobalAppListeners();

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const prepare = async () => {
      try {
        await initPushIfMobile((ordenId) => {
          router.replace(`/track/${ordenId}` as any);
        });
      } finally {
        setReady(true);
        await SplashScreen.hideAsync().catch(() => {});
      }
    };

    prepare();
  }, []);

  if (!ready) {
    return <View style={styles.splash} />;
  }

  return (
    <StripeProvider
      publishableKey={STRIPE_PUBLISHABLE_KEY}

      urlScheme={APP_URL_SCHEME}
    >
      <ThemeProvider>
        <AuthProvider>
          <CartProvider>
            <StatusBar style="dark" />

            <Stack
              screenOptions={{
                headerShown: true,
                headerTitleAlign: "center",
                headerShadowVisible: false,
                headerBackTitle: "",
                headerBackButtonDisplayMode: "minimal",
                animation: "slide_from_right",
                contentStyle: {
                  backgroundColor: DEFAULT_BG,
                },
                headerStyle: {
                  backgroundColor: DEFAULT_BG,
                },
                headerTintColor: TEXT_COLOR,
                headerTitleStyle: {
                  color: TEXT_COLOR,
                  fontWeight: "900",
                },
              }}
            >
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

              <Stack.Screen
                name="profile-info"
                options={{ title: "Mi información" }}
              />

              <Stack.Screen name="checkout" options={{ title: "Checkout" }} />

              <Stack.Screen
                name="track/[ordenId]/index"
                options={{
                  title: "Seguimiento",
                  headerLeft: () => (
                    <Pressable
                      onPress={() => router.replace("/(tabs)/orders" as any)}
                      hitSlop={12}
                      style={styles.headerBackBtn}
                    >
                      <Ionicons
                        name="chevron-back"
                        size={28}
                        color={TEXT_COLOR}
                      />
                    </Pressable>
                  ),
                }}
              />

              <Stack.Screen
                name="category/[slug]"
                options={{ title: "Categoría" }}
              />

              <Stack.Screen
                name="product/[id]"
                options={{ title: "Producto" }}
              />

              <Stack.Screen
                name="modal"
                options={{
                  presentation: "modal",
                  animation: "slide_from_bottom",
                  title: "Centro rápido",
                }}
              />

              <Stack.Screen name="error" options={{ title: "Error" }} />
            </Stack>
          </CartProvider>
        </AuthProvider>
      </ThemeProvider>
    </StripeProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: DEFAULT_BG,
  },
  headerBackBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginLeft: -4,
  },
});
