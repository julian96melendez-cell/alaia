// app/splash.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
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

const { width, height } = Dimensions.get("window");

export default function SplashScreen() {
  // Animaciones
  const fadeLogo = useRef(new Animated.Value(0)).current;
  const scaleLogo = useRef(new Animated.Value(0.6)).current;
  const fadeText = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Entrada del logo
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeLogo, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.spring(scaleLogo, {
          toValue: 1,
          tension: 40,
          friction: 6,
          useNativeDriver: true,
        }),
      ]),

      Animated.timing(fadeText, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();

    // Navegación automática
    const timer = setTimeout(async () => {
      const token = await AsyncStorage.getItem("userToken");

      if (token) {
        router.replace("/(tabs)");
      } else {
        router.replace("/(auth)/login");
      }
    }, 2800);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      {/* Círculos decorativos */}
      <View style={styles.circle1} />
      <View style={styles.circle2} />
      <View style={styles.circle3} />

      {/* LOGO */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: fadeLogo,
            transform: [{ scale: scaleLogo }],
          },
        ]}
      >
        <Image
          source={require("../assets/logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>

      {/* TEXTO */}
      <Animated.View style={[styles.titleContainer, { opacity: fadeText }]}>
        <Text style={styles.title}>A L A Ï A</Text>
        <Text style={styles.subtitle}>Tu mundo conectando contigo</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  /* Círculos decorativos */
  circle1: {
    position: "absolute",
    width: width * 1.2,
    height: width * 1.2,
    borderRadius: width * 0.6,
    backgroundColor: "#E0E7FF",
    top: -width * 0.6,
    left: -width * 0.3,
    opacity: 0.25,
  },
  circle2: {
    position: "absolute",
    width: width * 1,
    height: width * 1,
    borderRadius: width * 0.5,
    backgroundColor: "#C7D2FE",
    bottom: -width * 0.5,
    right: -width * 0.4,
    opacity: 0.22,
  },
  circle3: {
    position: "absolute",
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: width * 0.4,
    backgroundColor: "#EEF2FF",
    bottom: -width * 0.2,
    left: -width * 0.1,
    opacity: 0.25,
  },

  /* Logo */
  logoContainer: {
    zIndex: 20,
  },
  logo: {
    width: 155,
    height: 155,
  },

  /* Texto */
  titleContainer: {
    marginTop: 20,
    alignItems: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 6,
    color: "#4F46E5",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 16,
    color: "#6B7280",
  },
});