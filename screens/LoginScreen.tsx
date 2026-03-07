// screens/LoginScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Easing,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";

// Firebase Auth
import {
    GoogleAuthProvider,
    OAuthProvider,
    sendPasswordResetEmail,
    signInWithCredential,
    signInWithEmailAndPassword,
} from "firebase/auth";

// Social providers
import * as AppleAuthentication from "expo-apple-authentication";
import * as AuthSession from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";

import { auth } from "../firebase/firebaseConfig";
import CustomInput from "../frontend/components/CustomInput";
import useTheme from "../hooks/useTheme";

WebBrowser.maybeCompleteAuthSession();

/* ───────────────────────── i18n ───────────────────────── */

const STR = {
  es: {
    welcome: "Bienvenido 👋",
    subtitle: "Inicia sesión para continuar",
    emailLabel: "Correo electrónico",
    emailPlaceholder: "tu@correo.com",
    pwdLabel: "Contraseña",
    pwdPlaceholder: "••••••••",
    remember: "Recordar correo",
    forgot: "¿Olvidaste tu contraseña?",
    signin: "Iniciar sesión",
    or: "o",
    google: "Google",
    apple: "Apple",
    noAccount: "¿No tienes cuenta?",
    register: "Regístrate",
    emailRequiredToReset: "Ingresa tu correo para restablecer la contraseña.",
    emailInvalid: "El correo ingresado no es válido.",
    userNotFound: "No existe una cuenta con este correo.",
    wrongPassword: "La contraseña es incorrecta.",
    tooMany: "Demasiados intentos. Inténtalo más tarde.",
    loginError: "Ocurrió un error al iniciar sesión.",
    welcomeBack: "¡Bienvenido! 🎉",
    loginSuccess: "Inicio de sesión exitoso.",
    resetSentTitle: "📩 Correo enviado",
    resetSentBody: "Revisa tu bandeja para restablecer tu contraseña.",
    resetFail: "No se pudo enviar el correo.",
    pwdStrength: "Seguridad",
    veryWeak: "Muy débil",
    weak: "Débil",
    ok: "Aceptable",
    strong: "Fuerte",
    excellent: "Excelente",
    cooldown: "Reintenta en {{s}}s",
  },
} as const;

const t = (k: keyof typeof STR.es, vars?: Record<string, string | number>) => {
  const s = STR.es[k];
  if (!vars) return s;
  return Object.keys(vars).reduce(
    (acc, key) => acc.replace(`{{${key}}}`, String(vars[key])),
    s
  );
};

/* ───────────────────────── Helpers ───────────────────────── */

const REMEMBER_EMAIL_KEY = "LOGIN_REMEMBER_EMAIL";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const passwordScore = (pwd: string) => {
  let score = 0;
  if (pwd.length >= 6) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[a-z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return Math.min(score, 4); // 0..4
};

const scoreLabel = [
  t("veryWeak"),
  t("weak"),
  t("ok"),
  t("strong"),
  t("excellent"),
];

const mapAuthError = (code?: string) => {
  switch (code) {
    case "auth/invalid-email":
      return t("emailInvalid");
    case "auth/user-not-found":
      return t("userNotFound");
    case "auth/wrong-password":
      return t("wrongPassword");
    case "auth/too-many-requests":
      return t("tooMany");
    default:
      return t("loginError");
  }
};

async function getAppleNonces() {
  const raw =
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2);
  const hashed = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    raw
  );
  return { raw, hashed };
}

/* ───────────────────────── Componente ───────────────────────── */

export default function LoginScreen({ navigation }: any) {
  const { theme, isDarkMode } = useTheme();
  const { width } = useWindowDimensions();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(true);
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [showStrength, setShowStrength] = useState(false);

  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Animaciones principales
  const fade = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;
  const shakeX = useRef(new Animated.Value(0)).current;
  const btnScale = useRef(new Animated.Value(1)).current;

  // Decoraciones futuristas (orbes)
  const orb1 = useRef(new Animated.Value(0)).current;
  const orb2 = useRef(new Animated.Value(0)).current;

  // Google config
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "";
  const androidClientId =
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? "";
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";

  const redirectUri = AuthSession.makeRedirectUri();

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId:
      Platform.select({
        ios: iosClientId,
        android: androidClientId,
        default: webClientId,
      }) || webClientId,
    iosClientId,
    androidClientId,
    webClientId,
    redirectUri,
    selectAccount: true,
    usePKCE: true,
  });

  /* ─────────── Efectos ─────────── */

  // Resultado Google
  useEffect(() => {
    (async () => {
      if (response?.type !== "success") return;
      const id_token = (response as any).params?.id_token;
      if (!id_token) {
        setGlobalError("Google no devolvió un token válido.");
        return;
      }
      try {
        setLoading(true);
        setGlobalError(null);
        const credential = GoogleAuthProvider.credential(id_token);
        await signInWithCredential(auth, credential);
        Alert.alert(t("welcomeBack"), t("loginSuccess"));
        // Importante: en tu AppNavigator el stack principal se llama "Main"
        navigation.replace("Main");
      } catch {
        setGlobalError("No fue posible iniciar sesión con Google.");
      } finally {
        setLoading(false);
      }
    })();
  }, [response, navigation]);

  // Animaciones de entrada + orbes
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const loopOrb = (val: Animated.Value, delay: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, {
            toValue: 1,
            duration: 9000,
            delay,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0,
            duration: 9000,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      ).start();
    };

    loopOrb(orb1, 400);
    loopOrb(orb2, 0);
  }, [fade, translateY, orb1, orb2]);

  // Validaciones
  const emailError = useMemo(
    () =>
      !email
        ? null
        : EMAIL_RE.test(email.trim())
        ? null
        : t("emailInvalid"),
    [email]
  );

  const pwdError = useMemo(
    () =>
      !password
        ? null
        : password.length >= 6
        ? null
        : "Mínimo 6 caracteres",
    [password]
  );

  const isValidForm =
    email.length > 0 &&
    password.length > 0 &&
    !emailError &&
    !pwdError;

  // Cargar correo recordado
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(REMEMBER_EMAIL_KEY);
        if (saved) setEmail(saved);
      } catch {
        // noop
      }
    })();
  }, []);

  const persistEmail = useCallback(async (value: string | null) => {
    try {
      if (value) await AsyncStorage.setItem(REMEMBER_EMAIL_KEY, value);
      else await AsyncStorage.removeItem(REMEMBER_EMAIL_KEY);
    } catch {
      // noop
    }
  }, []);

  // Limpieza cooldown al desmontar
  useEffect(() => {
    return () => {
      if (cooldownRef.current) {
        clearInterval(cooldownRef.current);
        cooldownRef.current = null;
      }
    };
  }, []);

  // Parar cooldown cuando llega a 0
  useEffect(() => {
    if (cooldown <= 0 && cooldownRef.current) {
      clearInterval(cooldownRef.current);
      cooldownRef.current = null;
    }
  }, [cooldown]);

  // Password strength
  const strength = passwordScore(password);
  const strengthPct = (strength / 4) * 100;

  useEffect(() => {
    setShowStrength(password.length > 0);
  }, [password]);

  // Micro-interacción botón login
  const onPressIn = () =>
    Animated.spring(btnScale, {
      toValue: 0.97,
      useNativeDriver: true,
    }).start();

  const onPressOut = () =>
    Animated.spring(btnScale, {
      toValue: 1,
      friction: 4,
      useNativeDriver: true,
    }).start();

  // Shake en error
  const triggerShake = () => {
    shakeX.setValue(0);
    Animated.sequence([
      Animated.timing(shakeX, {
        toValue: 12,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeX, {
        toValue: -12,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeX, {
        toValue: 8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeX, {
        toValue: -8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeX, {
        toValue: 0,
        duration: 40,
        useNativeDriver: true,
      }),
    ]).start();
  };

  /* ─────────── Handlers ─────────── */

  const handleLogin = useCallback(async () => {
    if (!isValidForm || loading || cooldown > 0) return;
    setLoading(true);
    setGlobalError(null);
    Keyboard.dismiss();

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      if (rememberEmail) {
        await persistEmail(email.trim());
      } else {
        await persistEmail(null);
      }
      Alert.alert(t("welcomeBack"), t("loginSuccess"));
      // Ir al stack principal definido como "Main" en AppNavigator
      navigation.replace("Main");
    } catch (error: any) {
      const msg = mapAuthError(error?.code);
      setGlobalError(msg);

      if (error?.code === "auth/too-many-requests") {
        setCooldown(30);
        if (!cooldownRef.current) {
          cooldownRef.current = setInterval(
            () => setCooldown((s) => s - 1),
            1000
          );
        }
      }
      triggerShake();
    } finally {
      setLoading(false);
    }
  }, [
    isValidForm,
    loading,
    cooldown,
    email,
    password,
    rememberEmail,
    persistEmail,
    navigation,
  ]);

  const handlePasswordReset = useCallback(async () => {
    setGlobalError(null);
    if (!email) {
      Alert.alert(t("forgot"), t("emailRequiredToReset"));
      return;
    }
    if (emailError) {
      Alert.alert("Correo inválido", t("emailInvalid"));
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email.trim());
      Alert.alert(t("resetSentTitle"), t("resetSentBody"));
    } catch (error: any) {
      Alert.alert(
        "Error",
        error?.code === "auth/user-not-found"
          ? t("userNotFound")
          : t("resetFail")
      );
    }
  }, [email, emailError]);

  const handleLoginWithGoogle = useCallback(async () => {
    setGlobalError(null);
    if (!request) {
      setGlobalError("Configuración incompleta de Google (clientId).");
      return;
    }
    try {
      await promptAsync();
    } catch {
      setGlobalError("Ocurrió un error al abrir Google.");
    }
  }, [request, promptAsync]);

  const handleLoginWithApple = useCallback(async () => {
    setGlobalError(null);
    try {
      const available = await AppleAuthentication.isAvailableAsync();
      if (!available) {
        Alert.alert(
          "Apple",
          "Iniciar sesión con Apple no está disponible en este dispositivo."
        );
        return;
      }
      const { raw, hashed } = await getAppleNonces();
      const result = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashed,
      });

      if (!result.identityToken) {
        setGlobalError("No se recibió el token de Apple.");
        return;
      }

      const provider = new OAuthProvider("apple.com");
      const credential = provider.credential({
        idToken: result.identityToken,
        rawNonce: raw,
      });

      setLoading(true);
      await signInWithCredential(auth, credential);
      Alert.alert(t("welcomeBack"), t("loginSuccess"));
      navigation.replace("Main");
    } catch (e: any) {
      if (e?.code === "ERR_CANCELED") return;
      setGlobalError("No fue posible iniciar sesión con Apple.");
    } finally {
      setLoading(false);
    }
  }, [navigation]);

  const signinA11yLabel =
    cooldown > 0
      ? `${t("signin")} (${t("cooldown", { s: cooldown })})`
      : t("signin");

  /* ─────────── Render ─────────── */

  const orb1Style = {
    transform: [
      {
        translateY: orb1.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -16],
        }),
      },
      {
        translateX: orb1.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 12],
        }),
      },
    ],
    opacity: isDarkMode ? 0.55 : 0.18,
  };

  const orb2Style = {
    transform: [
      {
        translateY: orb2.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -20],
        }),
      },
      {
        translateX: orb2.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -14],
        }),
      },
    ],
    opacity: isDarkMode ? 0.45 : 0.14,
  };

  const horizontalPadding = Math.max(20, (width - 540) / 2);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Fondo futurista: orbes suaves */}
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        <Animated.View
          style={[
            styles.orb,
            {
              backgroundColor: `${theme.primary}33`,
              top: -80,
              right: -60,
            },
            orb1Style,
          ]}
        />
        <Animated.View
          style={[
            styles.orb,
            {
              backgroundColor: isDarkMode
                ? "#22C55E22"
                : "rgba(56,189,248,0.22)",
              bottom: -120,
              left: -80,
              width: 240,
              height: 240,
            },
            orb2Style,
          ]}
        />
      </View>

      {/* Overlay de carga */}
      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      )}

      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingHorizontal: horizontalPadding,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Branding superior */}
        <Animated.View
          style={[
            styles.hero,
            { opacity: fade, transform: [{ translateY }] },
          ]}
          accessible
          accessibilityLabel={`${t("welcome")}. ${t("subtitle")}`}
        >
          <View
            style={[
              styles.brandRow,
              { opacity: isDarkMode ? 0.9 : 0.95 },
            ]}
          >
            <View
              style={[
                styles.brandIcon,
                { backgroundColor: `${theme.primary}22` },
              ]}
            >
              <Ionicons
                name="sparkles-outline"
                size={22}
                color={theme.primary}
              />
            </View>
            <View style={{ marginLeft: 8 }}>
              <Text
                style={[
                  styles.brandName,
                  { color: theme.text },
                ]}
              >
                ALAÏA
              </Text>
              <Text
                style={[
                  styles.brandTagline,
                  { color: theme.textSecondary },
                ]}
              >
                Shopping reinventado
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 16, alignItems: "center" }}>
            <Text style={[styles.title, { color: theme.text }]}>
              {t("welcome")}
            </Text>
            <Text
              style={[
                styles.subtitle,
                { color: theme.textSecondary },
              ]}
            >
              {t("subtitle")}
            </Text>
          </View>
        </Animated.View>

        {/* Card de login */}
        <Animated.View
          style={{
            transform: [{ translateX: shakeX }],
          }}
        >
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.card,
                borderColor: isDarkMode ? "#1F2A3A" : "#E5E7EB",
                shadowColor: "#000",
              },
            ]}
          >
            {/* Banner de error */}
            {!!globalError && (
              <View
                style={[
                  styles.errorBanner,
                ]}
              >
                <Ionicons
                  name="alert-circle"
                  size={18}
                  color={theme.primary}
                />
                <Text
                  style={[
                    styles.errorText,
                    { color: theme.text },
                  ]}
                >
                  {globalError}
                </Text>
                <TouchableOpacity
                  onPress={() => setGlobalError(null)}
                  hitSlop={{
                    top: 8,
                    bottom: 8,
                    left: 8,
                    right: 8,
                  }}
                >
                  <Ionicons
                    name="close"
                    size={18}
                    color={theme.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.form}>
              <CustomInput
                label={t("emailLabel")}
                icon="mail-outline"
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  if (globalError) setGlobalError(null);
                }}
                placeholder={t("emailPlaceholder")}
                keyboardType="email-address"
                autoCapitalize="none"
                error={emailError || undefined}
                accessibilityLabel={t("emailLabel")}
                returnKeyType="next"
                onSubmitEditing={() => Keyboard.dismiss()}
                testID="login-email"
              />

              <CustomInput
                label={t("pwdLabel")}
                icon="lock-closed-outline"
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  if (globalError) setGlobalError(null);
                }}
                placeholder={t("pwdPlaceholder")}
                secureTextEntry
                autoCapitalize="none"
                error={pwdError || undefined}
                accessibilityLabel={t("pwdLabel")}
                returnKeyType="go"
                onSubmitEditing={handleLogin}
                testID="login-password"
              />

              {/* Indicador de fuerza */}
              {showStrength && (
                <View
                  accessibilityLabel="Indicador de seguridad de contraseña"
                  style={styles.strengthWrap}
                >
                  <View
                    style={[
                      styles.strengthBarBg,
                      {
                        backgroundColor: isDarkMode
                          ? "#233043"
                          : "#E5E7EB",
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.strengthBarFill,
                        {
                          width: `${strengthPct}%`,
                          backgroundColor:
                            strength <= 1
                              ? "#EF4444"
                              : strength === 2
                              ? "#F59E0B"
                              : strength === 3
                              ? "#10B981"
                              : "#22C55E",
                          shadowColor: theme.primary,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.strengthRow}>
                    <Text
                      style={[
                        styles.strengthLabel,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {t("pwdStrength")}:{" "}
                      <Text
                        style={{
                          color: theme.text,
                          fontWeight: "800",
                        }}
                      >
                        {scoreLabel[strength]}
                      </Text>
                    </Text>
                  </View>
                </View>
              )}

              {/* Recordar / Reset */}
              <View style={styles.rowBetween}>
                <TouchableOpacity
                  onPress={() =>
                    setRememberEmail((v) => !v)
                  }
                  activeOpacity={0.8}
                  style={styles.rowCenter}
                  accessibilityRole="checkbox"
                  accessibilityState={{
                    checked: rememberEmail,
                  }}
                  testID="remember-email"
                >
                  <View
                    style={[
                      styles.checkbox,
                      {
                        borderColor: isDarkMode
                          ? "#334155"
                          : "#CBD5E1",
                        backgroundColor: rememberEmail
                          ? theme.primary
                          : "transparent",
                      },
                    ]}
                  >
                    {rememberEmail && (
                      <Ionicons
                        name="checkmark"
                        size={14}
                        color="#fff"
                      />
                    )}
                  </View>
                  <Text
                    style={{
                      color: theme.text,
                      fontWeight: "600",
                    }}
                  >
                    {t("remember")}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handlePasswordReset}
                  activeOpacity={0.8}
                  testID="login-forgot"
                >
                  <Text
                    style={{
                      color: theme.primary,
                      fontWeight: "800",
                    }}
                  >
                    {t("forgot")}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Botón principal */}
              <Animated.View
                style={{ transform: [{ scale: btnScale }] }}
              >
                <TouchableOpacity
                  activeOpacity={0.95}
                  onPressIn={onPressIn}
                  onPressOut={onPressOut}
                  onPress={handleLogin}
                  disabled={
                    !isValidForm || loading || cooldown > 0
                  }
                  style={[
                    styles.button,
                    {
                      backgroundColor:
                        isValidForm && cooldown <= 0
                          ? theme.primary
                          : isDarkMode
                          ? "#273247"
                          : "#CBD5E1",
                      shadowColor: theme.primary,
                      opacity: loading ? 0.85 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={signinA11yLabel}
                  accessibilityState={{
                    disabled:
                      !isValidForm || loading || cooldown > 0,
                  }}
                  testID="login-submit"
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <View style={styles.rowCenter}>
                      <Ionicons
                        name="log-in-outline"
                        size={18}
                        color="#fff"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.buttonText}>
                        {cooldown > 0
                          ? t("cooldown", { s: cooldown })
                          : t("signin")}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </Animated.View>

              {/* Divider */}
              <View style={styles.dividerWrap}>
                <View
                  style={[
                    styles.divider,
                    {
                      backgroundColor: isDarkMode
                        ? "#2A3448"
                        : "#E5E7EB",
                    },
                  ]}
                />
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontWeight: "800",
                  }}
                >
                  {t("or")}
                </Text>
                <View
                  style={[
                    styles.divider,
                    {
                      backgroundColor: isDarkMode
                        ? "#2A3448"
                        : "#E5E7EB",
                    },
                  ]}
                />
              </View>

              {/* Social */}
              <View style={styles.socialRow}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[
                    styles.socialBtn,
                    {
                      backgroundColor: theme.card,
                      borderColor: isDarkMode
                        ? "#2A3448"
                        : "#E5E7EB",
                    },
                  ]}
                  onPress={handleLoginWithGoogle}
                  accessibilityRole="button"
                  accessibilityLabel={`Continuar con ${t(
                    "google"
                  )}`}
                  testID="login-google"
                >
                  <Ionicons
                    name="logo-google"
                    size={18}
                    color={theme.text}
                  />
                  <Text
                    style={[
                      styles.socialTxt,
                      { color: theme.text },
                    ]}
                  >
                    {t("google")}
                  </Text>
                </TouchableOpacity>

                {Platform.OS === "ios" && (
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={
                      AppleAuthentication
                        .AppleAuthenticationButtonType.SIGN_IN
                    }
                    buttonStyle={
                      isDarkMode
                        ? AppleAuthentication
                            .AppleAuthenticationButtonStyle
                            .WHITE
                        : AppleAuthentication
                            .AppleAuthenticationButtonStyle
                            .BLACK
                    }
                    cornerRadius={12}
                    style={{ flex: 1, height: 44 }}
                    onPress={handleLoginWithApple}
                  />
                )}
              </View>

              {/* Ir a registro */}
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate("Register")
                }
                style={{ marginTop: 16 }}
                activeOpacity={0.8}
              >
                <Text
                  style={{
                    color: theme.textSecondary,
                    textAlign: "center",
                  }}
                >
                  {t("noAccount")}{" "}
                  <Text
                    style={{
                      color: theme.primary,
                      fontWeight: "900",
                    }}
                  >
                    {t("register")}
                  </Text>
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ───────────────────────── estilos ───────────────────────── */

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingTop: 64,
    paddingBottom: 28,
  },

  hero: {
    alignItems: "center",
    marginBottom: 18,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  brandIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: {
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  brandTagline: {
    fontSize: 12,
    fontWeight: "700",
    opacity: 0.9,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "700",
    opacity: 0.9,
    marginTop: 4,
  },

  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    elevation: 3,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
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
    borderColor: "#F97316",
    backgroundColor: "rgba(248,113,22,0.08)",
  },
  errorText: {
    flex: 1,
    fontWeight: "600",
  },

  form: {
    marginTop: 4,
  },

  strengthWrap: {
    marginTop: 6,
    marginBottom: 4,
  },
  strengthBarBg: {
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
  },
  strengthBarFill: {
    height: 8,
    borderRadius: 999,
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  strengthRow: {
    marginTop: 6,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: "700",
  },

  rowBetween: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowCenter: {
    flexDirection: "row",
    alignItems: "center",
  },

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
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.2,
  },

  dividerWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
    gap: 10,
  },
  divider: {
    flex: 1,
    height: 1,
    borderRadius: 999,
  },

  socialRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 10,
  },
  socialBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  socialTxt: {
    fontWeight: "900",
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    backgroundColor: "rgba(0,0,0,0.06)",
  },

  // Orbes decorativos
  orb: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 200,
  },
});