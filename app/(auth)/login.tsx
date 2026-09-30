import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
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

function getLoginErrorMessage(code?: string) {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Correo o contraseña incorrectos.";
    case "auth/invalid-email":
      return "El correo electrónico no tiene un formato válido.";
    case "auth/user-disabled":
      return "Esta cuenta está deshabilitada.";
    case "auth/too-many-requests":
      return "Demasiados intentos. Intenta nuevamente más tarde.";
    case "auth/network-request-failed":
      return "No pudimos conectar con Firebase. Revisa tu conexión.";
    default:
      return "No se pudo iniciar sesión. Intenta nuevamente.";
  }
}

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const cleanEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  const emailValid = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail),
    [cleanEmail]
  );

  const passwordValid = password.trim().length >= 6;
  const canSubmit = emailValid && passwordValid && !loading;

  const handleLogin = async () => {
    if (loading) return;

    if (!auth) {
      Alert.alert("Error", "Firebase Auth no está inicializado.");
      return;
    }

    if (!cleanEmail) {
      Alert.alert("Correo requerido", "Escribe tu correo electrónico.");
      return;
    }

    if (!emailValid) {
      Alert.alert("Correo inválido", "Revisa el formato del correo.");
      return;
    }

    if (!passwordValid) {
      Alert.alert(
        "Contraseña inválida",
        "La contraseña debe tener al menos 6 caracteres."
      );
      return;
    }

    try {
      setLoading(true);

      const result = await signInWithEmailAndPassword(
        auth,
        cleanEmail,
        password.trim()
      );

      if (!result.user?.uid) {
        throw new Error("No se recibió usuario válido desde Firebase.");
      }

      router.replace("/(tabs)" as any);
    } catch (error: any) {
      console.log("LOGIN ERROR CODE:", error?.code);
      console.log("LOGIN ERROR MESSAGE:", error?.message);

      Alert.alert(
        "Error al iniciar sesión",
        getLoginErrorMessage(error?.code)
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
          <Ionicons name="sparkles-outline" size={30} color="#fff" />
        </View>

        <Text style={styles.title}>Bienvenido 👋</Text>

        <Text style={styles.subtitle}>
          Inicia sesión para continuar comprando en ALAIA.
        </Text>

        <Text style={styles.label}>Correo electrónico</Text>

        <View
          style={[
            styles.inputWrap,
            email.length > 0 && !emailValid && styles.inputErrorBorder,
          ]}
        >
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
            returnKeyType="next"
            textContentType="emailAddress"
          />
        </View>

        {email.length > 0 && !emailValid ? (
          <Text style={styles.fieldError}>Introduce un correo válido.</Text>
        ) : null}

        <Text style={styles.label}>Contraseña</Text>

        <View
          style={[
            styles.inputWrap,
            password.length > 0 && !passwordValid && styles.inputErrorBorder,
          ]}
        >
          <Ionicons name="lock-closed-outline" size={20} color="#64748B" />

          <TextInput
            placeholder="Tu contraseña"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            style={styles.input}
            placeholderTextColor="#94A3B8"
            editable={!loading}
            returnKeyType="done"
            textContentType="password"
            onSubmitEditing={handleLogin}
          />

          <Pressable
            onPress={() => setShowPassword((prev) => !prev)}
            disabled={loading}
            hitSlop={10}
          >
            <Ionicons
              name={showPassword ? "eye-off-outline" : "eye-outline"}
              size={22}
              color="#64748B"
            />
          </Pressable>
        </View>

        {password.length > 0 && !passwordValid ? (
          <Text style={styles.fieldError}>
            La contraseña debe tener al menos 6 caracteres.
          </Text>
        ) : null}

        <Pressable
          style={[styles.button, !canSubmit && styles.disabled]}
          onPress={handleLogin}
          disabled={!canSubmit}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="log-in-outline" size={19} color="#fff" />
              <Text style={styles.buttonText}>Ingresar</Text>
            </>
          )}
        </Pressable>

        <Pressable
          disabled={loading}
          onPress={() => router.push("/(auth)/forgot-password" as any)}
        >
          <Text style={styles.link}>¿Olvidaste tu contraseña?</Text>
        </Pressable>

        <Pressable
          disabled={loading}
          onPress={() => router.push("/(auth)/register" as any)}
        >
          <Text style={styles.linkStrong}>¿No tienes cuenta? Regístrate</Text>
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
    backgroundColor: "#fff",
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
    fontSize: 29,
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
    marginBottom: 8,
    backgroundColor: "#F9FAFB",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  inputErrorBorder: {
    borderColor: "#EF4444",
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    color: Colors.light.text,
    fontWeight: "700",
    fontSize: 15,
  },
  fieldError: {
    marginBottom: 10,
    color: "#EF4444",
    fontSize: 12,
    fontWeight: "700",
  },
  button: {
    width: "100%",
    paddingVertical: 15,
    borderRadius: 17,
    backgroundColor: Colors.light.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 18,
    flexDirection: "row",
    gap: 8,
  },
  disabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
  },
  link: {
    marginTop: 8,
    color: Colors.light.primary,
    fontWeight: "800",
    textAlign: "center",
  },
  linkStrong: {
    marginTop: 14,
    color: Colors.light.primary,
    fontWeight: "900",
    textAlign: "center",
  },
});