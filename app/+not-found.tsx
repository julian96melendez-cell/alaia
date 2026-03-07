import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeInUp,
  FadeOutDown,
} from "react-native-reanimated";

export default function NotFoundScreen() {
  return (
    <View style={styles.root}>
      <Animated.View
        entering={FadeInUp.duration(500)}
        exiting={FadeOutDown.duration(400)}
        style={styles.box}
      >
        <Text style={styles.title}>Página no encontrada</Text>

        <Text style={styles.subtitle}>
          No pudimos encontrar la pantalla que estás buscando.
        </Text>

        <Link href="/" asChild>
          <Pressable style={styles.button}>
            <Text style={styles.buttonText}>Volver al inicio</Text>
          </Pressable>
        </Link>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
  },

  box: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    alignItems: "center",
  },

  title: {
    fontSize: 26,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 8,
  },

  subtitle: {
    fontSize: 16,
    textAlign: "center",
    color: "#6B7280",
    marginBottom: 24,
  },

  button: {
    backgroundColor: "#6366F1",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },

  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});