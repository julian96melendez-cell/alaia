// screens/EditProfileScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updateEmail,
  updatePassword,
  updateProfile,
} from "firebase/auth";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth } from "../firebase/firebaseConfig";
import useTheme from "../hooks/useTheme";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Score simple de contraseña (0..4)
const passwordScore = (pwd: string) => {
  let score = 0;
  if (pwd.length >= 6) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[a-z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return Math.min(score, 4);
};

const STRENGTH_LABELS = ["Muy débil", "Débil", "Aceptable", "Fuerte", "Excelente"];

export default function EditProfileScreen({ navigation }: any) {
  const { theme, isDarkMode } = useTheme();
  const user = auth.currentUser;

  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [newPassword, setNewPassword] = useState("");
  const [photoURL, setPhotoURL] = useState(
    user?.photoURL || "https://cdn-icons-png.flaticon.com/512/147/147144.png"
  );
  const [currentPassword, setCurrentPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Animaciones
  const fade = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const avatarScale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.spring(avatarScale, {
        toValue: 1,
        friction: 6,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fade, translateY, avatarScale]);

  const triggerShake = () => {
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 40, useNativeDriver: true }),
    ]).start();
  };

  // Validaciones memorizadas
  const emailError = useMemo(() => {
    if (!email) return "El correo es obligatorio.";
    if (!EMAIL_RE.test(email.trim())) return "El correo no es válido.";
    return null;
  }, [email]);

  const pwdStrength = passwordScore(newPassword);
  const showPwdStrength = newPassword.length > 0;
  const pwdStrengthPct = (pwdStrength / 4) * 100;

  const hasChanges = useMemo(() => {
    return (
      displayName !== (user?.displayName || "") ||
      email !== (user?.email || "") ||
      newPassword.length > 0 ||
      photoURL !== (user?.photoURL || "https://cdn-icons-png.flaticon.com/512/147/147144.png")
    );
  }, [displayName, email, newPassword, photoURL, user]);

  // 📸 Elegir nueva foto
  const pickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert("Permiso denegado", "Debes permitir acceso a la galería.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled) {
        setPhotoURL(result.assets[0].uri);
      }
    } catch (e) {
      Alert.alert("Error", "No fue posible abrir la galería.");
    }
  };

  // 🔐 Reautenticación (necesaria para cambiar email o contraseña)
  const reauthenticateUser = async () => {
    if (!user || !currentPassword) {
      throw new Error("Debes ingresar tu contraseña actual para continuar.");
    }
    const credential = EmailAuthProvider.credential(user.email!, currentPassword);
    await reauthenticateWithCredential(user, credential);
  };

  const mapFirebaseError = (code?: string) => {
    switch (code) {
      case "auth/wrong-password":
        return "La contraseña actual es incorrecta.";
      case "auth/weak-password":
        return "La nueva contraseña es demasiado débil.";
      case "auth/invalid-email":
        return "El correo ingresado no es válido.";
      case "auth/email-already-in-use":
        return "Este correo ya está vinculado a otra cuenta.";
      case "auth/requires-recent-login":
        return "Por seguridad, vuelve a iniciar sesión para hacer este cambio.";
      default:
        return "Ocurrió un error al actualizar tu perfil.";
    }
  };

  // 💾 Guardar cambios
  const handleSaveChanges = async () => {
    if (!user) {
      Alert.alert("Sesión requerida", "Inicia sesión nuevamente para editar tu perfil.");
      return;
    }

    Keyboard.dismiss();
    setGlobalError(null);

    if (!displayName.trim()) {
      setGlobalError("El nombre es obligatorio.");
      triggerShake();
      return;
    }

    if (emailError) {
      setGlobalError(emailError);
      triggerShake();
      return;
    }

    if (!hasChanges) {
      Alert.alert("Sin cambios", "No hay cambios para guardar.");
      return;
    }

    const emailChanged = email.trim() !== user.email;
    const wantsNewPassword = newPassword.length > 0;

    if ((emailChanged || wantsNewPassword) && !currentPassword) {
      setGlobalError("Debes introducir tu contraseña actual para cambiar correo o contraseña.");
      triggerShake();
      return;
    }

    try {
      setLoading(true);

      // Reautenticación si es necesario
      if (emailChanged || wantsNewPassword) {
        await reauthenticateUser();
      }

      // Actualizar nombre / foto
      if (displayName.trim() !== user.displayName || photoURL !== user.photoURL) {
        await updateProfile(user, {
          displayName: displayName.trim(),
          photoURL,
        });
      }

      // Actualizar email
      if (emailChanged) {
        await updateEmail(user, email.trim());
      }

      // Actualizar password
      if (wantsNewPassword) {
        await updatePassword(user, newPassword);
      }

      Alert.alert("✅ Perfil actualizado", "Tus cambios se guardaron correctamente.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      console.error("❌ Error al actualizar perfil:", error);
      const message = mapFirebaseError(error?.code);
      setGlobalError(message);
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Ionicons name="alert-circle-outline" size={40} color={theme.tint} />
        <Text style={{ marginTop: 10, color: theme.text, fontWeight: "600" }}>
          No hay sesión activa.
        </Text>
      </View>
    );
  }

  const disabledSave = loading || !hasChanges;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header minimal */}
      <View style={[styles.header, { borderBottomColor: isDarkMode ? "#1E293B" : "#E5E7EB" }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Editar perfil</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingHorizontal: 20, paddingBottom: 32 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Intro */}
        <Animated.View
          style={{
            opacity: fade,
            transform: [{ translateY }],
          }}
        >
          <Text style={[styles.title, { color: theme.text }]}>Tu información</Text>

          {/* ❗ CAMBIO: theme.subtext → theme.textSecondary */}
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Personaliza tu perfil. Los cambios sensibles requieren tu contraseña actual.
          </Text>
        </Animated.View>

        {/* Error global */}
        {!!globalError && (
          <Animated.View
            style={[
              styles.errorBanner,
              {
                borderColor: theme.tint,
                backgroundColor: `${theme.tint}12`,
                transform: [{ translateX: shake }],
              },
            ]}
          >
            <Ionicons name="alert-circle" size={18} color={theme.tint} />
            <Text style={[styles.errorText, { color: theme.text }]}>{globalError}</Text>
            <TouchableOpacity onPress={() => setGlobalError(null)} hitSlop={8}>
              {/* ❗ theme.subtext → theme.textSecondary */}
              <Ionicons name="close" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Avatar */}
        <Animated.View
          style={[
            styles.avatarContainer,
            {
              transform: [{ scale: avatarScale }],
            },
          ]}
        >
          <TouchableOpacity onPress={pickImage} activeOpacity={0.9}>
            <Image
              source={{ uri: photoURL }}
              style={[styles.avatar, { borderColor: theme.tint }]}
            />
            <View style={[styles.cameraIcon, { backgroundColor: theme.tint }]}>
              <Ionicons name="camera" size={18} color="#FFF" />
            </View>
          </TouchableOpacity>

          {/* ❗ theme.subtext → theme.textSecondary */}
          <Text style={[styles.avatarHint, { color: theme.textSecondary }]}>
            Toca la foto para cambiar tu avatar
          </Text>
        </Animated.View>

        {/* Inputs */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.card,
              borderColor: isDarkMode ? "#1F2937" : "#E5E7EB",
            },
          ]}
        >
          {/* Nombre */}
          <View style={styles.field}>
            {/* ❗ theme.subtext → theme.textSecondary */}
            <Text style={[styles.label, { color: theme.textSecondary }]}>
              Nombre completo
            </Text>

            <View
              style={[
                styles.inputRow,
                { borderColor: isDarkMode ? "#334155" : "#CBD5E1", backgroundColor: theme.background },
              ]}
            >
              <Ionicons name="person-outline" size={18} color={theme.textSecondary} />

              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="Tu nombre"
                placeholderTextColor={theme.textSecondary}
                value={displayName}
                onChangeText={(v) => {
                  setDisplayName(v);
                  if (globalError) setGlobalError(null);
                }}
                returnKeyType="next"
              />
            </View>
          </View>

          {/* Email */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>
              Correo electrónico
            </Text>

            <View
              style={[
                styles.inputRow,
                { borderColor: isDarkMode ? "#334155" : "#CBD5E1", backgroundColor: theme.background },
              ]}
            >
              <Ionicons name="mail-outline" size={18} color={theme.textSecondary} />

              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="Correo"
                placeholderTextColor={theme.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  if (globalError) setGlobalError(null);
                }}
              />
            </View>

            {emailError && (
              <Text style={[styles.helperText, { color: "#EF4444" }]}>{emailError}</Text>
            )}
          </View>

          {/* Nueva contraseña */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>
              Nueva contraseña (opcional)
            </Text>

            <View
              style={[
                styles.inputRow,
                { borderColor: isDarkMode ? "#334155" : "#CBD5E1", backgroundColor: theme.background },
              ]}
            >
              <Ionicons name="lock-closed-outline" size={18} color={theme.textSecondary} />

              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="Mínimo 6 caracteres"
                placeholderTextColor={theme.textSecondary}
                secureTextEntry
                autoCapitalize="none"
                value={newPassword}
                onChangeText={(v) => {
                  setNewPassword(v);
                  if (globalError) setGlobalError(null);
                }}
              />
            </View>

            {showPwdStrength && (
              <View style={styles.strengthWrap}>
                <View
                  style={[
                    styles.strengthBarBg,
                    { backgroundColor: isDarkMode ? "#1F2937" : "#E5E7EB" },
                  ]}
                >
                  <View
                    style={[
                      styles.strengthBarFill,
                      {
                        width: `${pwdStrengthPct}%`,
                        backgroundColor:
                          pwdStrength <= 1
                            ? "#EF4444"
                            : pwdStrength === 2
                            ? "#F59E0B"
                            : pwdStrength === 3
                            ? "#10B981"
                            : "#22C55E",
                      },
                    ]}
                  />
                </View>

                {/* ❗ theme.subtext → theme.textSecondary */}
                <Text style={[styles.strengthLabel, { color: theme.textSecondary }]}>
                  Seguridad:{" "}
                  <Text style={{ color: theme.text, fontWeight: "800" }}>
                    {STRENGTH_LABELS[pwdStrength]}
                  </Text>
                </Text>
              </View>
            )}
          </View>

          {/* Contraseña actual */}
          {(email !== user.email || newPassword.length > 0) && (
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>
                Contraseña actual (requerida para cambios sensibles)
              </Text>

              <View
                style={[
                  styles.inputRow,
                  { borderColor: isDarkMode ? "#334155" : "#CBD5E1", backgroundColor: theme.background },
                ]}
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={18}
                  color={theme.textSecondary}
                />

                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="Contraseña actual"
                  placeholderTextColor={theme.textSecondary}
                  secureTextEntry
                  autoCapitalize="none"
                  value={currentPassword}
                  onChangeText={(v) => {
                    setCurrentPassword(v);
                    if (globalError) setGlobalError(null);
                  }}
                />
              </View>
            </View>
          )}
        </View>

        {/* Botón guardar */}
        <TouchableOpacity
          activeOpacity={0.95}
          style={[
            styles.button,
            {
              backgroundColor: disabledSave ? (isDarkMode ? "#273247" : "#CBD5E1") : theme.tint,
              shadowColor: theme.tint,
              opacity: loading ? 0.85 : 1,
            },
          ]}
          onPress={handleSaveChanges}
          disabled={disabledSave}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="save-outline" size={18} color="#FFF" />
              <Text style={styles.buttonText}>Guardar cambios</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ───────────────────────── estilos ───────────────────────── */

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: {
    height: 54,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  headerTitle: { fontSize: 18, fontWeight: "800" },

  container: {
    flexGrow: 1,
    paddingTop: 18,
  },

  title: {
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 4,
  },

  subtitle: {
    fontSize: 13,
    marginBottom: 18,
    fontWeight: "600",
  },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },

  errorText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },

  avatarContainer: {
    alignItems: "center",
    marginBottom: 20,
    marginTop: 4,
  },

  avatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 3,
  },

  cameraIcon: {
    position: "absolute",
    bottom: 0,
    right: (112 - 32) / 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#0F172A",
  },

  avatarHint: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
  },

  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    marginBottom: 18,
    elevation: 3,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },

  field: {
    marginBottom: 12,
  },

  label: {
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },

  input: {
    flex: 1,
    fontSize: 15,
  },

  helperText: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: "600",
  },

  strengthWrap: { marginTop: 6 },

  strengthBarBg: { height: 7, borderRadius: 999, overflow: "hidden" },

  strengthBarFill: { height: 7, borderRadius: 999 },

  strengthLabel: { fontSize: 11, fontWeight: "700", marginTop: 4 },

  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 4,
    gap: 8,
    elevation: 3,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },

  buttonText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "800",
  },
});