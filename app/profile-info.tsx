import { updateProfile } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
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
import { useAuth } from "../context/AuthContext";
import { auth, db } from "../firebase/firebaseConfig";

export default function ProfileInfoScreen() {
  const { user } = useAuth();

  const [name, setName] = useState(user?.displayName || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(user?.displayName || "");
  }, [user?.displayName]);

  const email = user?.email || "Sin correo";

  const hasChanges = useMemo(() => {
    return name.trim() !== (user?.displayName || "").trim();
  }, [name, user?.displayName]);

  const validate = () => {
    const cleanName = name.trim();

    if (!cleanName) {
      setError("El nombre no puede estar vacío.");
      return false;
    }

    if (cleanName.length < 3) {
      setError("El nombre debe tener al menos 3 caracteres.");
      return false;
    }

    if (cleanName.length > 50) {
      setError("El nombre no puede superar 50 caracteres.");
      return false;
    }

    setError(null);
    return true;
  };

  const saveProfile = async () => {
    if (saving) return;
    if (!validate()) return;

    try {
      setSaving(true);

      const cleanName = name.trim();

      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: cleanName,
        });
      }

      if (user?.uid) {
        await setDoc(
          doc(db, "users", user.uid),
          {
            displayName: cleanName,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      Alert.alert("Perfil actualizado", "Tus cambios se guardaron correctamente.");
    } catch (err: any) {
      Alert.alert(
        "Error",
        err?.message || "No se pudo actualizar el perfil. Intenta de nuevo."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.screenTitle}>Mi información</Text>
          <Text style={styles.screenSubtitle}>
            Actualiza los datos visibles de tu cuenta.
          </Text>

          <Text style={styles.label}>Nombre</Text>

          <TextInput
            value={name}
            onChangeText={(value) => {
              setName(value);
              if (error) setError(null);
            }}
            placeholder="Tu nombre"
            placeholderTextColor="#94A3B8"
            style={[styles.input, error && styles.inputError]}
            editable={!saving}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={saveProfile}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.label}>Correo</Text>

          <View style={styles.readOnlyBox}>
            <Text style={styles.readOnlyText}>{email}</Text>
          </View>

          <Text style={styles.helperText}>
            El correo no se puede modificar desde esta pantalla por seguridad.
          </Text>
        </View>

        <Pressable
          style={[styles.saveBtn, (!hasChanges || saving) && styles.disabledBtn]}
          onPress={saveProfile}
          disabled={!hasChanges || saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveText}>
              {hasChanges ? "Guardar cambios" : "Sin cambios"}
            </Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  content: {
    padding: 20,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
    marginBottom: 20,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: Colors.light.text,
  },
  screenSubtitle: {
    marginTop: 4,
    marginBottom: 20,
    fontSize: 13,
    lineHeight: 19,
    color: Colors.light.textSecondary,
    fontWeight: "600",
  },
  label: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 8,
    color: Colors.light.text,
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 10,
    color: Colors.light.text,
  },
  inputError: {
    borderColor: "#EF4444",
  },
  error: {
    color: "#EF4444",
    marginBottom: 12,
    fontWeight: "700",
  },
  readOnlyBox: {
    backgroundColor: "#F3F4F6",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  readOnlyText: {
    fontSize: 15,
    color: "#6B7280",
    fontWeight: "600",
  },
  helperText: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  saveBtn: {
    backgroundColor: Colors.light.primary,
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: "center",
  },
  disabledBtn: {
    opacity: 0.55,
  },
  saveText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
});