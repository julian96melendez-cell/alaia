import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { sendPasswordResetEmail } from "firebase/auth";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import Colors from "../../constants/Colors";
import { auth } from "../../firebase/firebaseConfig";

export default function ForgotPasswordScreen() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const cleanEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const canSubmit = cleanEmail.length > 0 && !loading;

  const getErrorMessage = (code?: string, fallback?: string) => {
    const cleanCode = String(code || "");

    if (cleanCode.includes("invalid-email")) {
      return "El correo electrónico no tiene un formato válido.";
    }

    if (cleanCode.includes("user-not-found")) {
      return "No encontramos una cuenta con ese correo.";
    }

    if (cleanCode.includes("too-many-requests")) {
      return "Demasiados intentos. Intenta más tarde.";
    }

    if (cleanCode.includes("network-request-failed")) {
      return "No pudimos conectar con el servidor. Revisa tu conexión.";
    }

    return fallback || "No se pudo enviar el correo de recuperación.";
  };

  const handleSendReset = async () => {
    if (!cleanEmail || loading) return;

    try {
      setLoading(true);

      await sendPasswordResetEmail(auth, cleanEmail);

      Alert.alert(
        "Correo enviado",
        "Te enviamos instrucciones para recuperar tu contraseña.",
        [
          {
            text: "Volver al login",
            onPress: () => router.replace("/(auth)/login" as any),
          },
        ]
      );
    } catch (err: any) {
      Alert.alert(
        "Error",
        getErrorMessage(err?.code, err?.message)
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <View style={styles.logoBox}>
          <Ionicons name="key-outline" size={30} color="#FFFFFF" />
        </View>

        <Text style={styles.title}>Recuperar contraseña</Text>

        <Text style={styles.subtitle}>
          Ingresa tu correo y te enviaremos instrucciones para restablecer tu contraseña.
        </Text>

        <Text style={styles.label}>Correo electrónico</Text>

        <View style={styles.inputWrap}>
          <Ionicons name="mail-outline" size={20} color="#64748B" />

          <TextInput
            placeholder="correo@ejemplo.com"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!loading}
            returnKeyType="send"
            onSubmitEditing={handleSendReset}
          />
        </View>

        <Pressable
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={handleSendReset}
          disabled={!canSubmit}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="send-outline" size={19} color="#FFFFFF" />
              <Text style={styles.buttonText}>Enviar instrucciones</Text>
            </>
          )}
        </Pressable>

        <Pressable
          onPress={() => router.replace("/(auth)/login" as any)}
          disabled={loading}
        >
          <Text style={styles.link}>← Volver al login</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: Colors.light.background,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 26,
    padding: 22,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  logoBox: {
    width: 60,
    height: 60,
    borderRadius: 22,
    backgroundColor: Colors.light.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: Colors.light.text,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginTop: 6,
    marginBottom: 24,
    fontWeight: "600",
    lineHeight: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: "900",
    color: Colors.light.text,
    marginBottom: 7,
  },
  inputWrap: {
    width: "100%",
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 16,
    marginBottom: 18,
    backgroundColor: "#F9FAFB",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    color: Colors.light.text,
    fontWeight: "700",
    fontSize: 15,
  },
  button: {
    width: "100%",
    paddingVertical: 15,
    borderRadius: 17,
    backgroundColor: Colors.light.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    flexDirection: "row",
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 16,
  },
  link: {
    marginTop: 8,
    color: Colors.light.primary,
    fontWeight: "900",
    textAlign: "center",
  },
});