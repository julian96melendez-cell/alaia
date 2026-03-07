import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  useColorScheme,
  View
} from "react-native";

export default function LoadingScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";

  const spinValue = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 🔄 Rotación infinita
    Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1700,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // 🌫️ Fade-in
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

    // 🌬️ Movimiento flotante
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -12,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 2,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // ✨ Glow pulsante
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, []);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const glowSize = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 28], // glow dinámico
  });

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: isDark ? "#0F172A" : "#F8FAFC" },
      ]}
    >
      {/* 🌀 Orbes de fondo */}
      <Animated.View
        style={[
          styles.orb,
          {
            backgroundColor: isDark ? "#3B82F622" : "#6366F122",
            top: -80,
            right: -60,
            transform: [{ scale: fadeAnim }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.orb,
          {
            backgroundColor: isDark ? "#22C55E22" : "#0EA5E922",
            bottom: -90,
            left: -70,
            width: 240,
            height: 240,
            transform: [{ scale: fadeAnim }],
          },
        ]}
      />

      {/* 🔄 Logo con spin + flotación + glow */}
      <Animated.View
        style={{
          transform: [{ translateY: floatAnim }],
          alignItems: "center",
        }}
      >
        <Animated.Image
          source={{
            uri: "https://cdn-icons-png.flaticon.com/512/147/147144.png",
          }}
          style={[
            styles.logo,
            {
              transform: [{ rotate: spin }],
            },
          ]}
        />

        {/* Glow dinámico */}
        <Animated.View
          style={[
            styles.glow,
            {
              width: glowSize,
              height: glowSize,
              backgroundColor: isDark
                ? "rgba(99,102,241,0.35)"
                : "rgba(79,70,229,0.35)",
            },
          ]}
        />
      </Animated.View>

      {/* ✨ Texto animado */}
      <Animated.Text
        style={[
          styles.text,
          {
            opacity: fadeAnim,
            color: isDark ? "#E2E8F0" : "#4F46E5",
            transform: [
              {
                translateY: fadeAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [16, 0],
                }),
              },
            ],
          },
        ]}
      >
        Cargando ShiboApp...
      </Animated.Text>
    </View>
  );
}

/* ──────────────────────────────────────────────
   🎨 Estilos premium / futuristas
────────────────────────────────────────────── */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  orb: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 200,
    opacity: 0.25,
  },

  logo: {
    width: 110,
    height: 110,
    borderRadius: 60,
  },

  glow: {
    position: "absolute",
    borderRadius: 200,
    opacity: 0.8,
    marginTop: 110,
  },

  text: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 40,
  },
});