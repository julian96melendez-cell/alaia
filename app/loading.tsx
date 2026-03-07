// app/loading.tsx
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef } from "react";
import {
    Animated,
    Dimensions,
    Easing,
    Image,
    StyleSheet,
    Text,
    View,
} from "react-native";

const { width } = Dimensions.get("window");
const GLOW_SIZE = width * 1.5;

export default function LoadingScreen() {
  const scale = useRef(new Animated.Value(0.9)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0.4)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const floatY = useRef(new Animated.Value(0)).current;
  const ringRotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in inicial del contenido
    Animated.timing(fade, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();

    // Pulso del logo (respira)
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.06,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.92,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Flotación vertical suave
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, {
          toValue: -8,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(floatY, {
          toValue: 8,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(floatY, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Rotación suave del “halo” exterior
    Animated.loop(
      Animated.timing(ringRotate, {
        toValue: 1,
        duration: 9000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // Rotación continua del núcleo
    Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: 6500,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // Glow del fondo que respira
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 0.95,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0.35,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Barra de progreso infinita (efecto “carga continua”)
    Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [fade, glow, progress, ringRotate, rotate, scale, floatY]);

  const spin = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const ringSpin = ringRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "-360deg"],
  });

  return (
    <LinearGradient
      colors={["#020617", "#020617", "#020617"]}
      style={styles.container}
    >
      {/* Glows de fondo */}
      <Animated.View
        style={[
          styles.glowOrb,
          {
            opacity: glow,
          },
        ]}
      />
      <View style={styles.glowOrbSmall} />

      {/* Círculo decorativo girando alrededor del logo */}
      <Animated.View
        style={[
          styles.outerRing,
          {
            transform: [{ rotate: ringSpin }],
            opacity: fade,
          },
        ]}
      />

      {/* Núcleo con logo futurista */}
      <Animated.View
        style={[
          styles.wrapper,
          {
            opacity: fade,
            transform: [{ scale }, { translateY: floatY }, { rotate: spin }],
          },
        ]}
      >
        <Image
          source={require("../assets/loading-art.png")} // Tu arte futurista
          style={styles.image}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Barra de progreso + textos */}
      <View style={styles.progressContainer}>
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                transform: [
                  {
                    scaleX: progress,
                  },
                ],
              },
            ]}
          />
        </View>

        <Animated.Text style={[styles.textMain, { opacity: fade }]}>
          Cargando experiencia Alaïa...
        </Animated.Text>
        <Animated.Text style={[styles.textSub, { opacity: fade }]}>
          Optimizando tu panel, pedidos y recomendaciones en tiempo real.
        </Animated.Text>
      </View>

      {/* Marca discreta abajo */}
      <Animated.View style={[styles.brandFooter, { opacity: fade }]}>
        <Text style={styles.brandText}>ALAIA • shopping inteligente</Text>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  glowOrb: {
    position: "absolute",
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    borderRadius: GLOW_SIZE / 2,
    backgroundColor: "#4F46E5",
    top: "5%",
    left: "50%",
    transform: [{ translateX: -(GLOW_SIZE / 2) }],
  },

  glowOrbSmall: {
    position: "absolute",
    width: GLOW_SIZE * 0.6,
    height: GLOW_SIZE * 0.6,
    borderRadius: (GLOW_SIZE * 0.6) / 2,
    backgroundColor: "#0EA5E9",
    opacity: 0.22,
    bottom: "-12%",
    right: "-25%",
  },

  outerRing: {
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 2,
    borderColor: "rgba(148,163,184,0.45)",
    position: "absolute",
  },

  wrapper: {
    width: 230,
    height: 230,
    justifyContent: "center",
    alignItems: "center",
  },

  image: {
    width: "90%",
    height: "90%",
  },

  progressContainer: {
    width: "72%",
    marginTop: 26,
    alignItems: "center",
  },

  progressTrack: {
    width: "100%",
    height: 7,
    borderRadius: 999,
    backgroundColor: "#111827",
    overflow: "hidden",
    marginBottom: 10,
  },

  progressFill: {
    flex: 1,
    backgroundColor: "#6366F1",
    borderRadius: 999,
    transform: [{ scaleX: 0 }],
  },

  textMain: {
    fontSize: 14,
    fontWeight: "700",
    color: "#E5E7EB",
    letterSpacing: 0.5,
  },

  textSub: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "500",
    color: "#9CA3AF",
    textAlign: "center",
  },

  brandFooter: {
    position: "absolute",
    bottom: 26,
    alignItems: "center",
  },
  brandText: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#6B7280",
    fontWeight: "700",
  },
});