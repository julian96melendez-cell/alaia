// app/error.tsx
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import {
    Animated,
    Appearance,
    Dimensions,
    Easing,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";

const { width } = Dimensions.get("window");

export default function GlobalErrorScreen() {
  const { error } = useLocalSearchParams();
  const colorScheme = Appearance.getColorScheme();
  const isDark = colorScheme === "dark";

  // Animaciones
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(slide, {
        toValue: 0,
        duration: 600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: isDark ? "#0F172A" : "#F8FAFC" },
      ]}
    >
      <Animated.View
        style={[
          styles.card,
          {
            opacity: fade,
            transform: [{ translateY: slide }],
            backgroundColor: isDark ? "#1E293B" : "#FFFFFF",
            shadowColor: isDark ? "#000" : "#4F46E5",
          },
        ]}
      >
        <View style={styles.iconWrapper}>
          <Ionicons
            name="warning-outline"
            size={48}
            color={isDark ? "#FACC15" : "#EAB308"}
          />
        </View>

        <Text style={[styles.title, { color: isDark ? "#F8FAFC" : "#1F2937" }]}>
          ¡Ups! Algo salió mal
        </Text>

        <Text
          style={[
            styles.subtitle,
            { color: isDark ? "#CBD5E1" : "#6B7280" },
          ]}
        >
          Se produjo un error inesperado.  
          Intenta una de las siguientes opciones:
        </Text>

        {/* Mostrar el error real (opcional) */}
        {error && (
          <Text
            style={[
              styles.errorMessage,
              { color: isDark ? "#FCA5A5" : "#EF4444" },
            ]}
          >
            {String(error)}
          </Text>
        )}

        <View style={styles.buttons}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.button,
              {
                backgroundColor: pressed
                  ? "#6366F155"
                  : isDark
                  ? "#334155"
                  : "#E0E7FF",
              },
            ]}
          >
            <Ionicons name="arrow-back-outline" size={20} color="#4F46E5" />
            <Text style={styles.buttonText}>Volver atrás</Text>
          </Pressable>

          <Pressable
            onPress={() => router.replace("/")}
            style={({ pressed }) => [
              styles.buttonPrimary,
              {
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons name="refresh-outline" size={20} color="#FFF" />
            <Text style={styles.buttonPrimaryText}>Reiniciar App</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  card: {
    width: "100%",
    borderRadius: 20,
    padding: 26,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },

  iconWrapper: {
    alignSelf: "center",
    marginBottom: 14,
  },

  title: {
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
  },

  subtitle: {
    fontSize: 15,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 12,
    lineHeight: 20,
  },

  errorMessage: {
    fontSize: 13,
    marginBottom: 16,
    textAlign: "center",
    fontWeight: "600",
  },

  buttons: {
    marginTop: 12,
  },

  button: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    justifyContent: "center",
    borderRadius: 12,
    marginBottom: 10,
  },

  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 6,
    color: "#4F46E5",
  },

  buttonPrimary: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#4F46E5",
  },

  buttonPrimaryText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
    marginLeft: 6,
  },
});