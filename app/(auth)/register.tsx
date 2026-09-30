import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
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
import { auth, db } from "../../firebase/firebaseConfig";

export default function RegisterScreen() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const cleanName = useMemo(() => name.trim(), [name]);
  const cleanEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  const canSubmit =
    cleanName.length >= 3 && cleanEmail.length > 0 && password.length >= 6;

  const getRegisterErrorMessage = (code?: string, fallback?: string) => {
    const cleanCode = String(code || "");

    if (cleanCode.includes("email-already-in-use")) {
      return "Este correo ya está registrado.";
    }

    if (cleanCode.includes("invalid-email")) {
      return "El correo electrónico no tiene un formato válido.";
    }

    if (cleanCode.includes("weak-password")) {
      return "La contraseña debe tener al menos 6 caracteres.";
    }

    if (cleanCode.includes("network-request-failed")) {
      return "No pudimos conectar con el servidor. Revisa tu conexión.";
    }

    return fallback || "No se pudo crear la cuenta.";
  };

  const handleRegister = async () => {
    if (loading) return;

    if (cleanName.length < 3) {
      Alert.alert("Nombre inválido", "El nombre debe tener al menos 3 caracteres.");
      return;
    }

    if (!cleanEmail) {
      Alert.alert("Correo requerido", "Escribe tu correo electrónico.");
      return;
    }

    if (password.length < 6) {
      Alert.alert("Contraseña débil", "La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    try {
      setLoading(true);

      const credential = await createUserWithEmailAndPassword(
        auth,
        cleanEmail,
        password
      );

      await updateProfile(credential.user, {
        displayName: cleanName,
      });

      await setDoc(
        doc(db, "users", credential.user.uid),
        {
          uid: credential.user.uid,
          displayName: cleanName,
          email: cleanEmail,
          photoURL: credential.user.photoURL || null,
          role: "customer",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      router.replace("/(tabs)" as any);
    } catch (err: any) {
      Alert.alert(
        "Error al registrarte",
        getRegisterErrorMessage(err?.code, err?.message)
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
          <Ionicons name="person-add-outline" size={30} color="#FFFFFF" />
        </View>

        <Text style={styles.title}>Crear cuenta</Text>

        <Text style={styles.subtitle}>
          Regístrate para comprar, guardar favoritos y seguir tus órdenes.
        </Text>

        <Text style={styles.label}>Nombre completo</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="person-outline" size={20} color="#64748B" />
          <TextInput
            placeholder="Tu nombre"
            value={name}
            onChangeText={setName}
            style={styles.input}
            placeholderTextColor="#94A3B8"
            autoCapitalize="words"
            editable={!loading}
          />
        </View>

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
            placeholder="Mínimo 6 caracteres"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            style={styles.input}
            placeholderTextColor="#94A3B8"
            editable={!loading}
            returnKeyType="done"
            onSubmitEditing={handleRegister}
          />

          <Pressable
            onPress={() => setShowPassword((prev) => !prev)}
            hitSlop={10}
            disabled={loading}
          >
            <Ionicons
              name={showPassword ? "eye-off-outline" : "eye-outline"}
              size={22}
              color="#64748B"
            />
          </Pressable>
        </View>

        <Pressable
          style={[styles.button, (!canSubmit || loading) && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={!canSubmit || loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={19} color="#FFFFFF" />
              <Text style={styles.buttonText}>Registrarme</Text>
            </>
          )}
        </Pressable>

        <Pressable
          onPress={() => router.replace("/(auth)/login" as any)}
          disabled={loading}
        >
          <Text style={styles.link}>¿Ya tienes cuenta? Inicia sesión</Text>
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