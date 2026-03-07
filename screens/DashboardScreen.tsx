// screens/DashboardScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useCart } from "../context/CartContext";
import useTheme from "../hooks/useTheme";

export default function DashboardScreen() {
  const { colors, isDarkMode } = useTheme();
  const { cart, wishlist } = useCart() as any;

  const username = "Hacere";

  // Animaciones de entrada
  const fade = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

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
    ]).start();
  }, [fade, translateY]);

  // Datos derivados
  const cartCount = useMemo(() => (cart?.length ?? 0), [cart]);
  const wishlistCount = useMemo(() => (wishlist?.length ?? 0), [wishlist]);

  // Datos mock de métricas (podrás enlazar a Firestore después)
  const monthlySpend = 543.2;
  const activeOrders = 3;
  const avgRating = 4.8;
  const goalProgress = {
    savings: 0.65, // 65%
    orders: 0.4,
    wishlistToCart: 0.3,
  };

  // Componente para tarjeta animada
  const AnimatedCard: React.FC<{ children: React.ReactNode; style?: any }> = ({ children, style }) => {
    const scale = useRef(new Animated.Value(1)).current;
    const onPressIn = () => {
      Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start();
    };
    const onPressOut = () => {
      Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }).start();
    };
    return (
      <Animated.View style={{ transform: [{ scale }] }}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          style={style}
        >
          {children}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const ProgressBar = ({ value }: { value: number }) => (
    <View
      style={[
        styles.progressBg,
        { backgroundColor: isDarkMode ? "#1E293B" : "#E5E7EB" },
      ]}
    >
      <View
        style={[
          styles.progressFill,
          {
            width: `${Math.min(Math.max(value, 0), 1) * 100}%`,
            backgroundColor: colors.tint,
          },
        ]}
      />
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDarkMode ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER */}
        <Animated.View
          style={[
            styles.header,
            {
              opacity: fade,
              transform: [{ translateY }],
            },
          ]}
        >
          <View>
            <Text style={[styles.greeting, { color: colors.text }]}>
              Hola, {username} 👋
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Este es tu panel de resumen
            </Text>
          </View>
          <View
            style={[
              styles.badgeMode,
              { backgroundColor: isDarkMode ? "#020617" : "#E5E7EB" },
            ]}
          >
            <Ionicons
              name={isDarkMode ? "moon" : "sunny"}
              size={16}
              color={colors.tint}
            />
            <Text
              style={[
                styles.badgeModeText,
                { color: colors.textSecondary, marginLeft: 4 },
              ]}
            >
              {isDarkMode ? "Modo oscuro" : "Modo claro"}
            </Text>
          </View>
        </Animated.View>

        {/* TARJETAS PRINCIPALES */}
        <View style={styles.cardsRow}>
          <AnimatedCard
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                shadowColor: "#000",
              },
            ]}
          >
            <View style={styles.cardHeaderRow}>
              <Ionicons name="cart-outline" size={24} color={colors.tint} />
              <Text style={[styles.chip, { color: colors.textSecondary }]}>
                En revisión
              </Text>
            </View>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Carrito
            </Text>
            <Text style={[styles.cardValue, { color: colors.textSecondary }]}>
              {cartCount} producto{cartCount === 1 ? "" : "s"}
            </Text>
          </AnimatedCard>

          <AnimatedCard
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                shadowColor: "#000",
              },
            ]}
          >
            <View style={styles.cardHeaderRow}>
              <Ionicons name="heart-outline" size={24} color={colors.tint} />
              <Text style={[styles.chip, { color: colors.textSecondary }]}>
                Guardados
              </Text>
            </View>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Favoritos
            </Text>
            <Text style={[styles.cardValue, { color: colors.textSecondary }]}>
              {wishlistCount} artículo{wishlistCount === 1 ? "" : "s"}
            </Text>
          </AnimatedCard>
        </View>

        {/* MÉTRICAS GENERALES */}
        <View
          style={[
            styles.section,
            {
              backgroundColor: colors.card,
              shadowColor: "#000",
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Resumen general
          </Text>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <View style={styles.statIconWrap}>
                <Ionicons name="wallet-outline" size={20} color={colors.tint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                  Gastos este mes
                </Text>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  ${monthlySpend.toFixed(2)}
                </Text>
              </View>
            </View>

            <View style={styles.statItem}>
              <View style={styles.statIconWrap}>
                <Ionicons name="cube-outline" size={20} color={colors.tint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                  Pedidos activos
                </Text>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {activeOrders}
                </Text>
              </View>
            </View>

            <View style={styles.statItem}>
              <View style={styles.statIconWrap}>
                <Ionicons name="star-outline" size={20} color={colors.tint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                  Valoración promedio
                </Text>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {avgRating.toFixed(1)} ★
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* OBJETIVOS Y PROGRESO */}
        <View
          style={[
            styles.section,
            {
              backgroundColor: colors.card,
              shadowColor: "#000",
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Objetivos & progreso
          </Text>

          <View style={styles.goalRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.goalTitle, { color: colors.text }]}>
                Control de gastos
              </Text>
              <Text style={[styles.goalSubtitle, { color: colors.textSecondary }]}>
                Límite mensual: $800.00
              </Text>
            </View>
            <Text style={[styles.goalTag, { color: colors.tint }]}>
              {Math.round(goalProgress.savings * 100)}%
            </Text>
          </View>
          <ProgressBar value={goalProgress.savings} />

          <View style={styles.goalRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.goalTitle, { color: colors.text }]}>
                Pedidos completados
              </Text>
              <Text style={[styles.goalSubtitle, { color: colors.textSecondary }]}>
                Objetivo: 10 pedidos este mes
              </Text>
            </View>
            <Text style={[styles.goalTag, { color: colors.tint }]}>
              {Math.round(goalProgress.orders * 100)}%
            </Text>
          </View>
          <ProgressBar value={goalProgress.orders} />

          <View style={styles.goalRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.goalTitle, { color: colors.text }]}>
                De favoritos a carrito
              </Text>
              <Text style={[styles.goalSubtitle, { color: colors.textSecondary }]}>
                Convierte tus favoritos en compras
              </Text>
            </View>
            <Text style={[styles.goalTag, { color: colors.tint }]}>
              {Math.round(goalProgress.wishlistToCart * 100)}%
            </Text>
          </View>
          <ProgressBar value={goalProgress.wishlistToCart} />
        </View>

        {/* ACCESOS RÁPIDOS CON GRADIENTE */}
        <LinearGradient
          colors={
            isDarkMode
              ? [colors.card, "#020617"]
              : ["#EEF2FF", "#E0F2FE"]
          }
          style={styles.quickSection}
        >
          <View style={styles.quickHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Accesos rápidos
            </Text>
            <Text style={[styles.quickHint, { color: colors.textSecondary }]}>
              Accede a tus secciones más usadas
            </Text>
          </View>

          <View style={styles.quickRow}>
            <TouchableOpacity style={[styles.quickButton, { backgroundColor: "#0F172A22" }]}>
              <View style={[styles.quickIconWrap, { backgroundColor: colors.tint }]}>
                <Ionicons name="home-outline" size={20} color="#fff" />
              </View>
              <Text style={[styles.quickText, { color: colors.text }]}>Inicio</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.quickButton, { backgroundColor: "#0F172A22" }]}>
              <View style={[styles.quickIconWrap, { backgroundColor: colors.tint }]}>
                <Ionicons name="person-outline" size={20} color="#fff" />
              </View>
              <Text style={[styles.quickText, { color: colors.text }]}>Perfil</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.quickButton, { backgroundColor: "#0F172A22" }]}>
              <View style={[styles.quickIconWrap, { backgroundColor: colors.tint }]}>
                <Ionicons name="settings-outline" size={20} color="#fff" />
              </View>
              <Text style={[styles.quickText, { color: colors.text }]}>Ajustes</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* FOOTER */}
        <Text style={[styles.footer, { color: colors.textSecondary }]}>
          © 2025 HacereShop · Panel personal
        </Text>
      </ScrollView>
    </View>
  );
}

/* ───────────────────────── estilos ───────────────────────── */

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    paddingTop: Platform.OS === "ios" ? 16 : 8,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
    marginTop: 4,
  },
  greeting: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 4,
  },

  badgeMode: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeModeText: {
    fontSize: 11,
    fontWeight: "700",
  },

  cardsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  card: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 18,
    elevation: 3,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chip: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginTop: 10,
  },
  cardValue: {
    fontSize: 14,
    marginTop: 4,
    fontWeight: "600",
  },

  section: {
    borderRadius: 18,
    marginTop: 22,
    padding: 16,
    elevation: 2,
    shadowOpacity: 0.06,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 10,
  },

  statsRow: {
    marginTop: 4,
    gap: 14,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  statIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(148,163,184,0.12)",
    marginRight: 10,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  statValue: {
    fontSize: 15,
    fontWeight: "800",
    marginTop: 2,
  },

  goalRow: {
    marginTop: 12,
    marginBottom: 4,
    flexDirection: "row",
    alignItems: "center",
  },
  goalTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  goalSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  goalTag: {
    fontSize: 13,
    fontWeight: "800",
  },
  progressBg: {
    height: 7,
    borderRadius: 999,
    overflow: "hidden",
    marginBottom: 4,
  },
  progressFill: {
    height: 7,
    borderRadius: 999,
  },

  quickSection: {
    marginTop: 22,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  quickHeader: {
    marginBottom: 10,
  },
  quickHint: {
    fontSize: 13,
    fontWeight: "600",
  },

  quickRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  quickButton: {
    flex: 1,
    marginHorizontal: 4,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  quickIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  quickText: {
    fontSize: 13,
    fontWeight: "700",
  },

  footer: {
    textAlign: "center",
    fontSize: 12,
    marginTop: 30,
    marginBottom: 4,
    fontWeight: "600",
  },
});