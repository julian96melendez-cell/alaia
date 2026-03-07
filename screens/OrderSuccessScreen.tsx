// screens/OrderSuccessScreen.tsx
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import ConfettiCannon from "react-native-confetti-cannon";
import { useThemeContext } from "../context/ThemeContext";

type ProductLite = {
  id?: string | number;
  name?: string;
  price?: number;
  image?: string;
  qty?: number;
};

type RouteParams = {
  product?: ProductLite;
  total?: number;
  orderId?: string;
};

type OrderSuccessScreenProps = {
  route: { params?: RouteParams };
};

export default function OrderSuccessScreen({ route }: OrderSuccessScreenProps) {
  const { colors, isDarkMode } = useThemeContext();
  const navigation = useNavigation<any>();

  const { product, total, orderId } = route?.params || {};

  /* ───────────────────────────────
   * ANIMACIONES
   * ─────────────────────────────── */
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const gradientAnim = useRef(new Animated.Value(0)).current;

  const orderNumber = useMemo(
    () => orderId || `#${Math.floor(Math.random() * 900000 + 100000)}`,
    [orderId]
  );

  const displayTotal = useMemo(() => {
    if (typeof total === "number") return total;
    if (product?.price) {
      const qty = product.qty ?? 1;
      return product.price * qty;
    }
    return 0;
  }, [total, product]);

  /* ───────────────────────────────
   * ANIMACIONES DE ENTRADA
   * ─────────────────────────────── */
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 60,
        useNativeDriver: true,
      }),
    ]).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(gradientAnim, {
          toValue: 1,
          duration: 9000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(gradientAnim, {
          toValue: 0,
          duration: 9000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, []);

  const translateX = gradientAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-40, 40],
  });

  const translateY = gradientAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-20, 20],
  });

  /* ───────────────────────────────
   * CORRECCIÓN DEL ERROR ❗
   * LinearGradient requiere un TUPLE, no un array.
   * ─────────────────────────────── */
  const gradientColors = isDarkMode
    ? (["#020617", "#0F172A", "#1E293B"] as const)
    : (["#E0F2FE", "#DBEAFE", "#E5DEFF"] as const);

  const highlightOverlay = isDarkMode
    ? "rgba(255,255,255,0.04)"
    : "rgba(255,255,255,0.26)";

  /* ───────────────────────────────
   * NAVEGACIÓN
   * ─────────────────────────────── */
  const goHome = () => navigation.navigate("Home");
  const goOrders = () => navigation.navigate("Orders");

  /* ───────────────────────────────
   * RENDER
   * ─────────────────────────────── */
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />

      {/* Fondo con gradiente animado */}
      <View style={StyleSheet.absoluteFill}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { transform: [{ translateX }, { translateY }] },
          ]}
        >
          {/* ✔ Sin error TS */}
          <LinearGradient
            colors={gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: highlightOverlay },
          ]}
        />
      </View>

      {/* Confetti */}
      <ConfettiCannon
        count={140}
        origin={{ x: 0, y: 0 }}
        fadeOut
        autoStart
        fallSpeed={2300}
        explosionSpeed={480}
        colors={["#FBBF24", "#E5E7EB", "#FFFFFF", "#F97316"]}
      />

      {/* Tarjeta */}
      <Animated.View
        style={[
          styles.card,
          {
            borderColor: isDarkMode ? "#334155" : "#E5E7EB",
            backgroundColor: isDarkMode
              ? "rgba(15,23,42,0.88)"
              : "rgba(255,255,255,0.9)",
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {/* Icono */}
        <View
          style={[
            styles.checkWrap,
            {
              backgroundColor: isDarkMode ? "#22C55E20" : "#22C55E18",
              borderColor: isDarkMode ? "#16A34A" : "#22C55E",
            },
          ]}
        >
          <Text style={styles.checkIcon}>✅</Text>
        </View>

        <Text style={[styles.title, { color: colors.text }]}>
          ¡Pedido confirmado!
        </Text>

        <Text
          style={[
            styles.subtitle,
            { color: isDarkMode ? "#9CA3AF" : "#4B5563" },
          ]}
        >
          Gracias por tu compra. Estamos preparando tu envío.
        </Text>

        {/* Divider */}
        <View
          style={[
            styles.hr,
            { backgroundColor: isDarkMode ? "#1F2937" : "#E5E7EB" },
          ]}
        />

        {/* Resumen */}
        <View style={styles.summary}>
          {product ? (
            <View style={styles.productRow}>
              {product.image ? (
                <Image source={{ uri: product.image }} style={styles.image} />
              ) : (
                <View style={[styles.image, styles.imagePlaceholder]}>
                  <Text style={{ color: "#9CA3AF", fontSize: 12 }}>
                    Sin imagen
                  </Text>
                </View>
              )}

              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.productName, { color: colors.text }]}
                  numberOfLines={2}
                >
                  {product.name || "Producto"}
                </Text>

                <Text
                  style={[
                    styles.muted,
                    { color: isDarkMode ? "#9CA3AF" : "#6B7280" },
                  ]}
                >
                  Cantidad: {product.qty ?? 1}
                </Text>
              </View>

              <Text style={[styles.total, { color: colors.primary }]}>
                ${(product.price ?? 0 * (product.qty ?? 1)).toFixed(2)}
              </Text>
            </View>
          ) : (
            <View style={{ alignItems: "center", gap: 6 }}>
              <Text
                style={[
                  styles.muted,
                  { color: isDarkMode ? "#9CA3AF" : "#6B7280" },
                ]}
              >
                Resumen no disponible
              </Text>
            </View>
          )}

          {/* Metadatos */}
          <View style={styles.meta}>
            <Text style={[styles.metaText, { color: colors.text }]}>
              Nº de pedido:{" "}
              <Text style={{ color: colors.primary }}>{orderNumber}</Text>
            </Text>

            <Text style={[styles.metaText, { color: colors.text }]}>
              Total:{" "}
              <Text style={{ color: colors.primary }}>
                ${displayTotal.toFixed(2)}
              </Text>
            </Text>

            <Text
              style={[
                styles.metaText,
                { color: isDarkMode ? "#A1AEC8" : "#6B7280" },
              ]}
            >
              Entrega estimada: 3–5 días hábiles
            </Text>
          </View>
        </View>

        {/* Botones */}
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={goOrders}
            activeOpacity={0.9}
            style={[styles.btnOutline, { borderColor: colors.primary }]}
          >
            <Text style={[styles.btnOutlineText, { color: colors.primary }]}>
              Ver pedidos
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={goHome}
            activeOpacity={0.93}
            style={[styles.btnPrimary, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.btnPrimaryText}>Volver al inicio</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

/* ───────────────────────────────
 * ESTILOS
 * ─────────────────────────────── */
const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center" },

  card: {
    width: "88%",
    maxWidth: 520,
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 22,
    paddingHorizontal: 18,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },

  checkWrap: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    borderWidth: 1.2,
  },

  checkIcon: { fontSize: 52 },

  title: { fontSize: 24, fontWeight: "800", textAlign: "center" },

  subtitle: { fontSize: 15, textAlign: "center", marginTop: 4 },

  hr: {
    height: StyleSheet.hairlineWidth,
    width: "100%",
    marginVertical: 18,
  },

  summary: { gap: 12 },

  productRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  image: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: "#020617",
  },

  imagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },

  productName: { fontSize: 16, fontWeight: "700" },

  muted: { fontSize: 13 },

  total: { fontSize: 16, fontWeight: "800" },

  meta: { marginTop: 10, gap: 6 },

  metaText: { fontSize: 14 },

  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 22,
  },

  btnOutline: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  btnOutlineText: { fontWeight: "700", fontSize: 15 },

  btnPrimary: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  btnPrimaryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
  },
});