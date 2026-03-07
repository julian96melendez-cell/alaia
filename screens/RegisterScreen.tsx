// screens/RegisterScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Easing,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import { auth, db, storage } from "../firebase/firebaseConfig";
import CustomInput from "../frontend/components/CustomInput";
import useTheme from "../hooks/useTheme";

/* ───────────────────────── constants / helpers ───────────────────────── */
const DRAFT_KEY = "REGISTER_DRAFT_v1";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const passwordScore = (pwd: string) => {
  let s = 0;
  if (pwd.length >= 6) s++;
  if (/[A-Z]/.test(pwd)) s++;
  if (/[a-z]/.test(pwd)) s++;
  if (/\d/.test(pwd)) s++;
  if (/[^A-Za-z0-9]/.test(pwd)) s++;
  return Math.min(s, 4); // 0..4
};
const scoreLabel = ["Muy débil", "Débil", "Aceptable", "Fuerte", "Excelente"] as const;

const mapFirebaseError = (code?: string) => {
  switch (code) {
    case "auth/email-already-in-use":
      return "Este correo ya está registrado.";
    case "auth/invalid-email":
      return "El correo no es válido.";
    case "auth/weak-password":
      return "La contraseña es demasiado débil.";
    case "auth/network-request-failed":
      return "Sin conexión o inestable. Intenta nuevamente.";
    default:
      return "Ocurrió un error al registrarte.";
  }
};

/** Sube una imagen local (URI) a Firebase Storage y devuelve su URL pública */
async function uploadImageToStorage(localUri: string, uid: string) {
  const res = await fetch(localUri);
  const buffer = await res.arrayBuffer();
  const fileRef = ref(storage, `users/${uid}.jpg`);
  await uploadBytes(fileRef, buffer, { contentType: "image/jpeg" });
  return await getDownloadURL(fileRef);
}

/* ───────────────────────── subcomponentes ───────────────────────── */
function PasswordMeter({
  value,
  isDark,
  textColor,
}: {
  value: string;
  isDark: boolean;
  textColor: string | undefined;
}) {
  const s = passwordScore(value);
  const pct = (s / 4) * 100;
  if (!value) return null;

  const effectiveColor = textColor || (isDark ? "#CBD5E1" : "#4B5563");

  return (
    <View
      style={styles.meterWrap}
      accessibilityLabel="Indicador de seguridad de contraseña"
      testID="pwd-meter"
    >
      <View style={[styles.meterBg, { backgroundColor: isDark ? "#243143" : "#E5E7EB" }]}>
        <View
          style={[
            styles.meterFill,
            {
              width: `${pct}%`,
              backgroundColor:
                s <= 1 ? "#EF4444" : s === 2 ? "#F59E0B" : s === 3 ? "#10B981" : "#22C55E",
            },
          ]}
        />
      </View>
      <Text style={[styles.meterLabel, { color: effectiveColor }]}>
        Seguridad:{" "}
        <Text style={{ fontWeight: "800", color: effectiveColor }}>{scoreLabel[s]}</Text>
      </Text>
    </View>
  );
}

/* ───────────────────────── main component ───────────────────────── */
export default function RegisterScreen({ navigation }: any) {
  const { theme, isDarkMode } = useTheme();

  // UI State
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [photoURL, setPhotoURL] = useState<string | undefined>();
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [secure, setSecure] = useState(true);

  // Animación de entrada
  const fade = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(18)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(y, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [fade, y]);

  // Validaciones instantáneas
  const nameError = useMemo(() => {
    if (!displayName) return null;
    return displayName.trim().length >= 2 ? null : "Ingresa al menos 2 caracteres";
  }, [displayName]);

  const emailError = useMemo(() => {
    if (!email) return null;
    return EMAIL_RE.test(email.trim()) ? null : "Correo inválido";
  }, [email]);

  const pwdError = useMemo(() => {
    if (!password) return null;
    return password.length >= 6 ? null : "Mínimo 6 caracteres";
  }, [password]);

  const canSubmit =
    !!displayName && !!email && !!password && !nameError && !emailError && !pwdError && acceptTerms;

  // Borrador local (auto-save)
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(DRAFT_KEY);
        if (saved) {
          const json = JSON.parse(saved);
          setDisplayName(json.displayName ?? "");
          setEmail(json.email ?? "");
          setPhotoURL(json.photoURL ?? undefined);
        }
      } catch {
        // ignorar errores de lectura
      }
    })();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      AsyncStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ displayName, email, photoURL })
      ).catch(() => {});
    }, 350);
    return () => clearTimeout(timeout);
  }, [displayName, email, photoURL]);

  const clearDraft = () => AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});

  /* ─────────────── Image picking (Cámara / Galería) ─────────────── */
  const askMediaPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return status === "granted";
  };
  const askCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return status === "granted";
  };

  const pickFromLibrary = async () => {
    const ok = await askMediaPermission();
    if (!ok) {
      Alert.alert("Permiso denegado", "Necesitas permitir acceso a la galería.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (!res.canceled) setPhotoURL(res.assets[0].uri);
  };

  const takePhoto = async () => {
    const ok = await askCameraPermission();
    if (!ok) {
      Alert.alert("Permiso denegado", "Necesitas permitir acceso a la cámara.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (!res.canceled) setPhotoURL(res.assets[0].uri);
  };

  const choosePhoto = () => {
    Alert.alert("Foto de perfil", "Selecciona una opción", [
      { text: "Cámara", onPress: takePhoto },
      { text: "Galería", onPress: pickFromLibrary },
      { text: "Cancelar", style: "cancel" },
    ]);
  };

  // Registrar, subir foto, guardar perfil y redirigir
  const handleRegister = async () => {
    if (!canSubmit || loading || uploading) return;

    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      // 1) Subir foto si existe
      let finalPhotoURL = photoURL;
      if (photoURL) {
        setUploading(true);
        try {
          finalPhotoURL = await uploadImageToStorage(photoURL, cred.user.uid);
        } finally {
          setUploading(false);
        }
      }

      const fallbackAvatar =
        "https://cdn-icons-png.flaticon.com/512/147/147144.png";

      // 2) Actualizar perfil de Auth
      await updateProfile(cred.user, {
        displayName: displayName.trim(),
        photoURL: finalPhotoURL || fallbackAvatar,
      });

      // 3) Guardar documento de usuario en Firestore
      await setDoc(
        doc(db, "users", cred.user.uid),
        {
          uid: cred.user.uid,
          displayName: displayName.trim(),
          email: cred.user.email,
          photoURL: finalPhotoURL || fallbackAvatar,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          role: "user",
          onboarded: false,
        },
        { merge: true }
      );

      // 4) Limpiar borrador y redirigir
      clearDraft();
      Alert.alert("✅ Cuenta creada", "¡Bienvenido! Tu cuenta ha sido creada con éxito.");

      navigation.reset({
        index: 0,
        routes: [{ name: "MainTabs" as never }],
      });
    } catch (e: any) {
      Alert.alert("Error", mapFirebaseError(e?.code));
    } finally {
      setLoading(false);
    }
  };

  const textSecondary = theme.colors.textSecondary ?? (isDarkMode ? "#9CA3AF" : "#6B7280");

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { backgroundColor: theme.colors.background },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header / Branding */}
        <Animated.View
          style={[styles.header, { opacity: fade, transform: [{ translateY: y }] }]}
        >
          <View
            style={[
              styles.brandIcon,
              { backgroundColor: `${theme.colors.primary}22` },
            ]}
          >
            <Ionicons
              name="sparkles-outline"
              size={20}
              color={theme.colors.primary}
            />
          </View>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            Crear cuenta
          </Text>
          <Text style={[styles.subtitle, { color: textSecondary }]}>
            Únete y empieza a explorar
          </Text>
        </Animated.View>

        {/* Avatar */}
        <TouchableOpacity
          onPress={choosePhoto}
          activeOpacity={0.9}
          style={styles.avatarContainer}
          accessibilityRole="button"
          accessibilityLabel="Seleccionar imagen de perfil"
          testID="register-avatar"
        >
          <Image
            source={{
              uri: photoURL || "https://cdn-icons-png.flaticon.com/512/147/147144.png",
            }}
            style={[styles.avatar, { borderColor: theme.colors.primary }]}
          />
          <View
            style={[styles.cameraIcon, { backgroundColor: theme.colors.primary }]}
          >
            {uploading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Ionicons name="camera" size={18} color="#FFF" />
            )}
          </View>
        </TouchableOpacity>

        {/* Formulario */}
        <View style={styles.form}>
          <CustomInput
            label="Nombre completo"
            icon="person-outline"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Ej. Sofía Torres"
            autoCapitalize="words"
            error={nameError || undefined}
            testID="register-name"
          />

          <CustomInput
            label="Correo electrónico"
            icon="mail-outline"
            value={email}
            onChangeText={setEmail}
            placeholder="tu@correo.com"
            keyboardType="email-address"
            autoCapitalize="none"
            error={emailError || undefined}
            testID="register-email"
          />

          <CustomInput
            label="Contraseña"
            icon="lock-closed-outline"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry={secure}
            autoCapitalize="none"
            error={pwdError || undefined}
            rightIcon={secure ? "eye-off-outline" : "eye-outline"}
            onRightIconPress={() => setSecure((v) => !v)}
            testID="register-password"
          />

          <PasswordMeter
            value={password}
            isDark={isDarkMode}
            textColor={theme.colors.textSecondary}
          />

          {/* Acepto términos */}
          <TouchableOpacity
            onPress={() => setAcceptTerms((v) => !v)}
            activeOpacity={0.85}
            style={styles.rowBetween}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acceptTerms }}
            testID="register-terms"
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: isDarkMode ? "#334155" : "#CBD5E1",
                  backgroundColor: acceptTerms ? theme.colors.primary : "transparent",
                },
              ]}
            >
              {acceptTerms && (
                <Ionicons name="checkmark" size={14} color="#fff" />
              )}
            </View>
            <Text style={{ color: theme.colors.text }}>
              Acepto los{" "}
              <Text
                style={{ color: theme.colors.primary, fontWeight: "800" }}
              >
                términos y condiciones
              </Text>
            </Text>
          </TouchableOpacity>

          {/* Botón Registrar */}
          <TouchableOpacity
            activeOpacity={0.95}
            onPress={handleRegister}
            disabled={!canSubmit || loading || uploading}
            style={[
              styles.button,
              {
                backgroundColor: canSubmit
                  ? theme.colors.primary
                  : isDarkMode
                  ? "#273247"
                  : "#CBD5E1",
                shadowColor: theme.colors.primary,
                opacity: loading || uploading ? 0.85 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit || loading || uploading }}
            testID="register-submit"
          >
            {loading || uploading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={styles.rowCenter}>
                <Ionicons
                  name="person-add-outline"
                  size={18}
                  color="#fff"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.buttonText}>Crear cuenta</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerWrap}>
            <View
              style={[
                styles.divider,
                { backgroundColor: isDarkMode ? "#2A3448" : "#E5E7EB" },
              ]}
            />
            <Text
              style={{ color: textSecondary, fontWeight: "800" }}
            >
              o
            </Text>
            <View
              style={[
                styles.divider,
                { backgroundColor: isDarkMode ? "#2A3448" : "#E5E7EB" },
              ]}
            />
          </View>

          {/* Ir a Login */}
          <TouchableOpacity
            onPress={() => navigation.navigate("Login" as never)}
            style={{ marginTop: 8 }}
            activeOpacity={0.8}
            testID="register-go-login"
          >
            <Text
              style={{
                color: textSecondary,
                textAlign: "center",
              }}
            >
              ¿Ya tienes cuenta?{" "}
              <Text
                style={{ color: theme.colors.primary, fontWeight: "900" }}
              >
                Inicia sesión
              </Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ───────────────────────── estilos ───────────────────────── */
const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 28,
  },
  header: { alignItems: "center", marginBottom: 18 },
  brandIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: { fontSize: 26, fontWeight: "900", letterSpacing: 0.2 },
  subtitle: { fontSize: 14, fontWeight: "700", opacity: 0.9 },

  form: { marginTop: 6 },

  avatarContainer: { alignSelf: "center", position: "relative", marginBottom: 18 },
  avatar: { width: 110, height: 110, borderRadius: 55, borderWidth: 3 },
  cameraIcon: {
    position: "absolute",
    bottom: 0,
    right: 0,
    borderRadius: 18,
    padding: 6,
  },

  meterWrap: { marginTop: 6, marginBottom: 2 },
  meterBg: { height: 8, borderRadius: 999, overflow: "hidden" },
  meterFill: { height: 8, borderRadius: 999 },
  meterLabel: { fontSize: 12, marginTop: 6, fontWeight: "700" },

  rowBetween: { marginTop: 12, flexDirection: "row", alignItems: "center" },
  rowCenter: { flexDirection: "row", alignItems: "center" },

  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },

  button: {
    marginTop: 14,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.2 },

  dividerWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
    gap: 10,
  },
  divider: { flex: 1, height: 1, borderRadius: 999 },
});