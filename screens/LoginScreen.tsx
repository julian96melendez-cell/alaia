// app/(auth)/login.tsx

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
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

import Colors from "../constants/Colors";

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const cleanEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const canSubmit = cleanEmail.length > 0 && password.length > 0;

  const handleLogin = async () => {
    if (!canSubmit || loading) return;

    try {
      setLoading(true);

      const res = await fetch(
        "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=AIzaSyAp3S8iDDI2ZrkKfLo5tlecZ7m30g9sRVU",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: cleanEmail,
            password,
            returnSecureToken: true,
          }),
        }
      );

      const data = await res.json();

      console.log("REST STATUS:", res.status);


      if (!res.ok) {
        Alert.alert("Firebase REST error", JSON.stringify(data, null, 2));
        return;
      }

      Alert.alert("Éxito", "Firebase respondió correctamente");

      router.replace("/(tabs)" as any);
    } catch (err: any) {
      console.warn("No se pudo iniciar sesión");
      Alert.alert("Error de red", err?.message || "Sin conexión");
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
          />
        </View>

        <Text style={styles.label}>Contraseña</Text>

        <View style={styles.inputWrap}>
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

        <Pressable
          style={[styles.button, (!canSubmit || loading) && styles.disabled]}
          onPress={handleLogin}
          disabled={!canSubmit || loading}
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
          onPress={() => router.push("/(auth)/forgot-password" as any)}
          disabled={loading}
        >
          <Text style={styles.link}>¿Olvidaste tu contraseña?</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/(auth)/register" as any)}
          disabled={loading}
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
    marginBottom: 15,
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
    marginTop: 4,
    marginBottom: 18,
    flexDirection: "row",
    gap: 8,
  },
  disabled: {
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