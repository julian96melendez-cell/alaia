import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useMemo, useState } from "react";
import {
  Alert,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  ZoomIn,
} from "react-native-reanimated";
import useTheme from "../hooks/useTheme";

export default function ForgotPasswordScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation();
  const [email, setEmail] = useState("");

  const isValid = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
    [email]
  );

  const handleReset = () => {
    Keyboard.dismiss();
    if (!isValid)
      return Alert.alert("Email incorrecto", "Introduce un correo válido.");
    Alert.alert("Listo ✨", "Si el correo existe, te enviaremos instrucciones.");
  };

  return (
    <LinearGradient
      colors={[theme.background, theme.card]}
      style={styles.container}
    >
      <Animated.View entering={FadeIn.duration(800)} style={{ marginBottom: 40 }}>
        <Animated.View
          entering={ZoomIn.delay(120)}
          style={styles.iconWrapper}
        >
          <Ionicons name="key-outline" size={36} color={theme.tint} />
        </Animated.View>

        <Animated.Text
          entering={FadeInDown.delay(150).duration(800)}
          style={[styles.title, { color: theme.text }]}
        >
          ¿Olvidaste tu contraseña?
        </Animated.Text>

        <Animated.Text
          entering={FadeInDown.delay(250).duration(800)}
          style={[
            styles.subtitle,
            { color: theme.textSecondary ?? "#999" },
          ]}
        >
          Introduce tu correo para restablecerla
        </Animated.Text>
      </Animated.View>

      {/* Campo email */}
      <Animated.View
        entering={FadeInUp.delay(350).duration(800)}
        style={[
          styles.inputContainer,
          {
            borderColor: isValid ? theme.tint : theme.border,
            backgroundColor: theme.card,
          },
        ]}
      >
        <Ionicons
          name="mail-outline"
          size={20}
          color={theme.textSecondary ?? "#888"}
        />
        <TextInput
          placeholder="Correo electrónico"
          placeholderTextColor={theme.textSecondary ?? "#888"}
          style={[styles.input, { color: theme.text }]}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        {email.length > 0 && (
          <Ionicons
            name={isValid ? "checkmark-circle" : "close-circle"}
            size={20}
            color={isValid ? "#22c55e" : "#ef4444"}
          />
        )}
      </Animated.View>

      {/* Botón principal */}
      <TouchableOpacity
        style={[
          styles.button,
          {
            backgroundColor: isValid ? theme.tint : theme.card, // 🔧 FIX AQUÍ
            opacity: isValid ? 1 : 0.5,
          },
        ]}
        onPress={handleReset}
        disabled={!isValid}
        activeOpacity={0.9}
      >
        <Text style={styles.buttonText}>Enviar instrucciones</Text>
      </TouchableOpacity>

      {/* Volver */}
      <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.8}>
        <Text style={[styles.link, { color: theme.tint }]}>
          Volver al inicio de sesión
        </Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 26,
    paddingTop: Platform.OS === "ios" ? 80 : 60,
  },

  /* Icono superior */
  iconWrapper: {
    width: 70,
    height: 70,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  /* Texto */
  title: {
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
    paddingHorizontal: 8,
  },

  /* Input */
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1.3,
    paddingHorizontal: 12,
    height: 52,
    marginBottom: 16,
    gap: 8,
    backdropFilter: "blur(10px)",
  },

  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 6,
  },

  /* Botones */
  button: {
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
    elevation: 3,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    marginTop: 10,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.4,
  },

  link: {
    textAlign: "center",
    marginTop: 22,
    fontSize: 15,
    fontWeight: "700",
  },
});