// app/index.tsx
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useAuth } from "../context/AuthContext";

const { width } = Dimensions.get("window");
const HERO_IMAGE = require("../assets/images/welcome-hero.png");

export default function Index() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(40)).current;
  const heroScale = useRef(new Animated.Value(0.9)).current;
  const heroFloat = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!loading && user) {
      router.replace("/(tabs)" as any);
    }
  }, [loading, user, router]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slide, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(heroScale, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(heroFloat, {
          toValue: -6,
          duration: 2200,
          useNativeDriver: true,
        }),
        Animated.timing(heroFloat, {
          toValue: 0,
          duration: 2200,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [fade, slide, heroScale, heroFloat]);

  if (loading) {
    return (
      <LinearGradient
        colors={["#050816", "#0B1220", "#020617"]}
        style={styles.loadingScreen}
      >
        <ActivityIndicator color="#FFFFFF" size="large" />
        <Text style={styles.loadingText}>Preparando ALAIA…</Text>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={["#050816", "#0B1220", "#020617"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <View style={styles.blurCircle} />

      <Animated.View
        style={[
          styles.content,
          {
            opacity: fade,
            transform: [{ translateY: slide }],
          },
        ]}
      >
        <View style={styles.brandPill}>
          <Ionicons name="sparkles-outline" size={18} color="#A5B4FC" />
          <Text style={styles.brandPillText}>ALAIA • Shopping reimaginado</Text>
        </View>

        <Animated.View
          style={[
            styles.heroWrapper,
            {
              transform: [{ translateY: heroFloat }, { scale: heroScale }],
            },
          ]}
        >
          <View style={styles.heroCard}>
            <LinearGradient
              colors={["#1D2440", "#020617"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroGradient}
            >
              <Image source={HERO_IMAGE} style={styles.heroImage} resizeMode="contain" />

              <View style={styles.heroBadge}>
                <Ionicons name="flash-outline" size={16} color="#FACC15" />
                <Text style={styles.heroBadgeText}>Compras rápidas y seguras</Text>
              </View>
            </LinearGradient>
          </View>
        </Animated.View>

        <View style={styles.textBlock}>
          <Text style={styles.title}>Eleva tu forma de comprar</Text>
          <Text style={styles.subtitle}>
            Descubre productos seleccionados, controla tus pedidos y personaliza tu
            experiencia en un solo lugar.
          </Text>
        </View>

        <View style={styles.buttonsWrapper}>
          <TouchableOpacity
            style={styles.button}
            activeOpacity={0.9}
            onPress={() => router.push("/(auth)/login" as any)}
          >
            <LinearGradient
              colors={["#6366F1", "#8B5CF6"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.buttonInner}
            >
              <Ionicons name="log-in-outline" size={22} color="#FFF" />
              <Text style={styles.buttonText}>Ingresar a mi cuenta</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.outlineButton]}
            activeOpacity={0.9}
            onPress={() => router.push("/(tabs)" as any)}
          >
            <View style={styles.outlineInner}>
              <Ionicons name="compass-outline" size={20} color="#E5E7EB" />
              <Text style={styles.outlineText}>Explorar la app primero</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <FooterItem text="Pagos seguros" />
          <FooterItem text="Historial de pedidos inteligente" />
          <FooterItem text="Recomendaciones personalizadas" />
        </View>
      </Animated.View>
    </LinearGradient>
  );
}

function FooterItem({ text }: { text: string }) {
  return (
    <View style={styles.footerRow}>
      <View style={styles.bullet} />
      <Text style={styles.footerText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    color: "#E5E7EB",
    fontWeight: "800",
  },
  blurCircle: {
    position: "absolute",
    width: width * 1.3,
    height: width * 1.3,
    borderRadius: (width * 1.3) / 2,
    backgroundColor: "#4F46E580",
    top: -width * 0.6,
    left: -width * 0.15,
    opacity: 0.4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 60,
    paddingBottom: 32,
    justifyContent: "space-between",
  },
  brandPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.85)",
    borderWidth: 1,
    borderColor: "#4F46E5",
    gap: 6,
    marginBottom: 14,
  },
  brandPillText: {
    color: "#E5E7EB",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  heroWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  heroCard: {
    width: "100%",
    borderRadius: 28,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
  },
  heroGradient: {
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  heroImage: {
    width: "100%",
    height: width * 0.9,
  },
  heroBadge: {
    position: "absolute",
    bottom: 18,
    left: 18,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.88)",
    borderWidth: 1,
    borderColor: "#22C55E55",
    gap: 6,
  },
  heroBadgeText: {
    color: "#E5E7EB",
    fontSize: 11,
    fontWeight: "700",
  },
  textBlock: {
    marginTop: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#F9FAFB",
    letterSpacing: 0.3,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14.5,
    lineHeight: 21,
    color: "#9CA3AF",
    fontWeight: "500",
  },
  buttonsWrapper: {
    marginTop: 18,
  },
  button: {
    width: "100%",
    marginVertical: 6,
  },
  buttonInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  buttonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
    marginLeft: 8,
  },
  outlineButton: {
    marginTop: 6,
  },
  outlineInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: "#4B5563",
    backgroundColor: "rgba(15,23,42,0.85)",
  },
  outlineText: {
    color: "#E5E7EB",
    fontSize: 15,
    fontWeight: "600",
    marginLeft: 6,
  },
  footer: {
    marginTop: 18,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 6,
  },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#22C55E",
  },
  footerText: {
    fontSize: 11.5,
    color: "#9CA3AF",
    fontWeight: "600",
  },
});