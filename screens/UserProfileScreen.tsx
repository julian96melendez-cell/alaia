import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { getAuth, signOut, updatePassword, updateProfile } from "firebase/auth";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import useTheme from "../hooks/useTheme";

export default function UserProfileScreen() {
  const auth = getAuth();
  const user = auth.currentUser;

  const { colors, isDarkMode } = useTheme();

  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [photoURL, setPhotoURL] = useState(user?.photoURL || "");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // 📌 Seleccionar imagen
  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permiso requerido", "Debes permitir acceso a tus fotos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (!result.canceled) {
      setPhotoURL(result.assets[0].uri);
    }
  };

  // 📌 Guardar cambios
  const handleSave = async () => {
    if (!user) return;

    setLoading(true);
    try {
      await updateProfile(user, {
        displayName: displayName || user.displayName,
        photoURL: photoURL || user.photoURL,
      });

      if (newPassword.trim().length > 0) {
        await updatePassword(user, newPassword.trim());
      }

      Alert.alert("✔ Perfil actualizado", "Los cambios se guardaron correctamente.");
    } catch (error: any) {
      Alert.alert("❌ Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  // 📌 Cerrar sesión con router
  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace("/login");
    } catch (error: any) {
      Alert.alert("❌ Error al cerrar sesión", error.message);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      {/* HEADER */}
      <View
        style={[
          styles.header,
          { backgroundColor: colors.primary, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity onPress={pickImage} activeOpacity={0.8}>
          <Image
            source={
              photoURL
                ? { uri: photoURL }
                : require("@/assets/images/default-avatar.png")
            }
            style={styles.avatar}
          />
        </TouchableOpacity>

        <Text style={[styles.changePhoto, { color: "#fff" }]}>Cambiar foto</Text>

        <Text style={[styles.email, { color: "#fff" }]}>{user?.email}</Text>
      </View>

      {/* FORM */}
      <View style={styles.infoSection}>
        {/* Nombre */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>Nombre</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, color: colors.text }]}
          placeholder="Tu nombre"
          placeholderTextColor={colors.textSecondary}
          value={displayName}
          onChangeText={setDisplayName}
        />

        {/* Password */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          Nueva contraseña
        </Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, color: colors.text }]}
          placeholder="••••••••"
          placeholderTextColor={colors.textSecondary}
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
        />

        {/* GUARDAR */}
        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: colors.primary }]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Guardar cambios</Text>
          )}
        </TouchableOpacity>

        {/* LOGOUT */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={[styles.logoutText, { color: "#EF4444" }]}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// 🎨 Estilos mejorados
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  header: {
    alignItems: "center",
    paddingVertical: 45,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },

  avatar: {
    width: 115,
    height: 115,
    borderRadius: 58,
    borderWidth: 4,
    borderColor: "#fff",
  },

  changePhoto: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: "700",
  },

  email: {
    marginTop: 4,
    fontSize: 14,
    opacity: 0.85,
  },

  infoSection: {
    padding: 22,
  },

  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 18,
  },

  input: {
    padding: 12,
    borderRadius: 10,
    fontSize: 16,
    marginBottom: 4,
  },

  saveButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 28,
  },

  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },

  logoutButton: {
    marginTop: 20,
    alignItems: "center",
  },

  logoutText: {
    fontSize: 16,
    fontWeight: "700",
  },
});