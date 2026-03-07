// app/splash.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";

const { width, height } = Dimensions.get("window");

export default function SplashScreen() {
  // Animaciones
  const fade = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(40)).current;
  const progress = useRef(new Animated.Value(0)).current;

  // Efecto de entrada
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true,
      }),
      Animated.timing(slideUp, {
        toValue: 0,
        duration: 900,
        useNativeDriver: true,
      }),
      Animated.timing(progress, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: false,
      }),
    ]).start();
  }, []);

  // Navegación automática
  useEffect(() => {
    const checkSession = async () => {
      const userToken = await AsyncStorage.getItem("userToken");

      setTimeout(() => {
        if (userToken) {
          router.replace("/(tabs)");
        } else {
          router.replace("/(auth)/login");
        }
      }, 2300);
    };

    checkSession();
  }, []);

  // Ancho animado de la barra de progreso
  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["2%", "100%"],
  });

  return (
    <View style={styles.root}>
      {/* Fondos decorativos */}
      <View style={styles.decorContainer}>
        <View style={styles.circleBig} />
        <View style={styles.circleSmall} />
      </View>

      {/* Contenido principal */}
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fade,
            transform: [{ translateY: slideUp }],
          },
        ]}
      >
        {/* LOGO - GLASS */}
        <View style={styles.logoContainer}>
          <View style={styles.logoGlass}>
            <Image
              source={require("../assets/logo.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
        </View>

        {/* TEXTOS */}
        <View style={styles.textBlock}>
          <Text style={styles.appName}>ALAÏA</Text>
          <Text style={styles.tagline}>
            Tu experiencia de compras elevada a otro nivel.
          </Text>
        </View>

        {/* Chips */}
        <View style={styles.chipsRow}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>Rápido ⚡</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipText}>Seguro 🔒</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipText}>Moderno ✨</Text>
          </View>
        </View>

        {/* STATUS */}
        <View style={styles.statusBlock}>
          <View style={styles.progressTrack}>
            <Animated.View
              style={[styles.progressFill, { width: progressWidth }]}
            />
          </View>

          <View style={styles.statusRow}>
            <ActivityIndicator color="#818CF8" size="small" />
            <Text style={styles.statusText}>Iniciando experiencia…</Text>
          </View>
        </View>
      </Animated.View>

      {/* FOOTER */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Construido con ❤️ para ti</Text>
        <Text style={styles.footerSub}>Alaïa © {new Date().getFullYear()}</Text>
      </View>
    </View>
  );
}

/* ──────────────────────────────────────────────── */
/* STYLES COMPLETOS Y SIN ERRORES                   */
/* ──────────────────────────────────────────────── */

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0F172A",
  },

  decorContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },

  circleBig: {
    position: "absolute",
    width: width * 1.3,
    height: width * 1.3,
    borderRadius: width * 0.65,
    backgroundColor: "#1D4ED8",
    opacity: 0.18,
    top: -width * 0.6,
    right: -width * 0.3,
  },

  circleSmall: {
    position: "absolute",
    width: width * 0.9,
    height: width * 0.9,
    borderRadius: width * 0.45,
    backgroundColor: "#22C55E",
    opacity: 0.10,
    bottom: -width * 0.4,
    left: -width * 0.2,
  },

  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 26,
  },

  logoContainer: {
    marginBottom: 20,
  },

  logoGlass: {
    width: 150,
    height: 150,
    borderRadius: 32,
    backgroundColor: "rgba(15,23,42,0.80)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.4)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },

  logo: {
    width: 110,
    height: 110,
  },

  textBlock: {
    alignItems: "center",
    marginTop: 10,
  },

  appName: {
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: 8,
    color: "#E5E7EB",
  },

  tagline: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    color: "#CBD5E1",
    maxWidth: width * 0.78,
  },

  chipsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 25,
    flexWrap: "wrap",
    justifyContent: "center",
  },

  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },

  chipText: {
    color: "#E5E7EB",
    fontSize: 12,
    fontWeight: "700",
  },

  statusBlock: {
    width: "100%",
    marginTop: 30,
  },

  progressTrack: {
    width: "100%",
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    marginBottom: 12,
  },

  progressFill: {
    height: "100%",
    backgroundColor: "#6366F1",
    shadowColor: "#22C55E",
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  statusText: {
    color: "#E5E7EB",
    fontSize: 13,
    fontWeight: "600",
  },

  footer: {
    position: "absolute",
    bottom: height * 0.06,
    width: "100%",
    alignItems: "center",
  },

  footerText: {
    fontSize: 13,
    color: "#94A3B8",
  },

  footerSub: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 4,
  },
});