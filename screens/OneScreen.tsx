// screens/OneScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import { MotiView } from "moti";
import React, { useCallback, useMemo, useState } from "react";
import {
  Image,
  ListRenderItemInfo,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  Extrapolate,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

import useTheme from "../hooks/useTheme";

/* ──────────────────────────────────────────────
 * Tipos y datos base
 * ────────────────────────────────────────────── */

type Item = {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  badge?: string;
  category?: string;
};

const INITIAL_DATA: Item[] = [
  {
    id: "1",
    title: "Ofertas especiales de la semana",
    subtitle: "Hasta un 40% de descuento en tecnología seleccionada.",
    image:
      "https://images.unsplash.com/photo-1607083206869-4c0fdf3b09d2?auto=format&fit=crop&w=900&q=80",
    badge: "Destacado",
    category: "Promociones",
  },
  {
    id: "2",
    title: "Nuevos lanzamientos 2025",
    subtitle: "Descubre lo último en gadgets inteligentes.",
    image:
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80",
    badge: "Nuevo",
    category: "Tecnología",
  },
  {
    id: "3",
    title: "Consejos para aprovechar tu smartwatch",
    subtitle: "Personaliza, entrena y mejora tu salud a diario.",
    image:
      "https://images.unsplash.com/photo-1598970434795-0c54fe7c0642?auto=format&fit=crop&w=900&q=80",
    badge: "Guía",
    category: "Lifestyle",
  },
];

const HEADER_H = 56;
const CARD_SPACING = 14;

/* Pequeño helper para los colores del tema sin depender
 * de todas las keys exactas del objeto theme.colors */
type ThemeColors = {
  primary: string;
  card: string;
  text: string;
  textSecondary?: string;
  background: string;
  [key: string]: any;
};

/* ──────────────────────────────────────────────
 * Pantalla principal
 * ────────────────────────────────────────────── */

export default function OneScreen() {
  const { theme, isDarkMode } = useTheme();
  const colors = theme.colors as ThemeColors;

  const [data, setData] = useState<Item[]>(INITIAL_DATA);
  const [refreshing, setRefreshing] = useState(false);

  // Scroll compartido para efectos globales (header + parallax)
  const scrollY = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  /* Header animado (elevación, sombra y ligera opacidad al hacer scroll) */
  const headerAnimatedStyle = useAnimatedStyle(() => {
    const elevation = interpolate(scrollY.value, [0, 24], [0, 6], Extrapolate.CLAMP);
    const shadowOpacity = interpolate(scrollY.value, [0, 24], [0, 0.16], Extrapolate.CLAMP);
    const translateY = interpolate(scrollY.value, [0, 40], [0, -6], Extrapolate.CLAMP);

    return {
      transform: [{ translateY }],
      elevation,
      shadowOpacity,
      backgroundColor: colors.card,
      shadowColor: "#000",
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      borderBottomWidth: 1,
      borderBottomColor: isDarkMode ? "#111827" : "rgba(15,23,42,0.06)",
    };
  }, [colors.card, isDarkMode]);

  const tint = useMemo(() => colors.primary, [colors.primary]);

  /* Pull to refresh */
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setData((prev) => [
        {
          id: Math.random().toString(),
          title: "🔥 Nueva promoción exclusiva",
          subtitle: "Solo por tiempo limitado. No te lo pierdas.",
          image:
            "https://images.unsplash.com/photo-1580894732444-8ecded7900a0?auto=format&fit=crop&w=900&q=80",
          badge: "Exclusivo",
          category: "Promociones",
        },
        ...prev,
      ]);
      setRefreshing(false);
    }, 900);
  }, []);

  const keyExtractor = useCallback((item: Item) => item.id, []);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<Item>) => (
      <Card item={item} index={index} colors={colors} scrollY={scrollY} />
    ),
    [colors, scrollY]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />

      {/* HEADER FIJO ANIMADO */}
      <Animated.View style={[styles.headerWrap, headerAnimatedStyle]}>
        <View style={styles.headerInner}>
          <View style={styles.headerLeft}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Explorar</Text>
            <View style={styles.headerBadge}>
              <Ionicons name="sparkles-outline" size={14} color={tint} />
              <Text style={[styles.headerBadgeText, { color: tint }]}>Descubre</Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={onRefresh}
              activeOpacity={0.85}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="refresh-outline" size={22} color={tint} />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      {/* LISTA PRINCIPAL */}
      <Animated.FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: HEADER_H + 12,
          paddingHorizontal: 14,
          paddingBottom: 80,
        }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tint} />
        }
        ListHeaderComponent={
          <HeroHeader colors={colors} tint={tint} isDarkMode={isDarkMode} />
        }
      />
    </View>
  );
}

/* ──────────────────────────────────────────────
 * Hero / Encabezado de sección
 * ────────────────────────────────────────────── */

function HeroHeader({
  colors,
  tint,
  isDarkMode,
}: {
  colors: ThemeColors;
  tint: string;
  isDarkMode: boolean;
}) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: -10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "timing", duration: 420 }}
      style={{ marginBottom: 4 }}
    >
      <View style={[styles.heroCard, { backgroundColor: colors.card }]}>
        <View style={styles.heroLeft}>
          <Text style={[styles.heroTitle, { color: colors.text }]}>Novedades</Text>
          <Text style={[styles.heroSub, { color: colors.textSecondary || "#6B7280" }]}>
            Revisa lo último y encuentra tu próxima compra inteligente.
          </Text>

          <View style={styles.heroChipsRow}>
            <Chip label="Tech" icon="hardware-chip-outline" tint={tint} />
            <Chip label="Ofertas" icon="pricetag-outline" tint={tint} />
            <Chip label="Recomendado" icon="thumbs-up-outline" tint={tint} />
          </View>
        </View>

        <View
          style={[
            styles.heroIconBubble,
            {
              backgroundColor: isDarkMode ? "#020617" : "#EEF2FF",
              borderColor: isDarkMode ? "#1F2937" : "#E5E7EB",
            },
          ]}
        >
          <Ionicons name="flash-outline" size={26} color={tint} />
        </View>
      </View>
    </MotiView>
  );
}

function Chip({ label, icon, tint }: { label: string; icon: keyof typeof Ionicons.glyphMap; tint: string }) {
  return (
    <View style={styles.chip}>
      <Ionicons name={icon} size={12} color={tint} style={{ marginRight: 4 }} />
      <Text style={[styles.chipText, { color: tint }]}>{label}</Text>
    </View>
  );
}

/* ──────────────────────────────────────────────
 * Card con animaciones avanzadas
 * ────────────────────────────────────────────── */

type CardProps = {
  item: Item;
  index: number;
  colors: ThemeColors;
  scrollY: SharedValue<number>;
};

const Card = React.memo(function Card({ item, index, colors, scrollY }: CardProps) {
  // Parallax suave basado en el scroll
  const animatedCardStyle = useAnimatedStyle(() => {
    const offset = index * (100 + CARD_SPACING); // aproximado, suficiente para efecto sutil
    const translateY = interpolate(
      scrollY.value,
      [offset - 80, offset, offset + 80],
      [10, 0, -10],
      Extrapolate.CLAMP
    );

    const scale = interpolate(
      scrollY.value,
      [offset - 140, offset, offset + 140],
      [0.96, 1, 0.97],
      Extrapolate.CLAMP
    );

    return {
      transform: [{ translateY }, { scale }],
    };
  });

  return (
    <Animated.View style={[styles.cardOuter, animatedCardStyle]}>
      <MotiView
        from={{ opacity: 0, translateY: 16, scale: 0.96 }}
        animate={{ opacity: 1, translateY: 0, scale: 1 }}
        transition={{
          type: "timing",
          duration: 420,
          delay: 60 + index * 70,
        }}
      >
        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.card }]}
          activeOpacity={0.92}
          onPress={() => {
            // Aquí podrías navegar a un detalle, p.ej:
            // navigation.navigate("ArticleDetail", { item })
          }}
        >
          {/* Imagen con leve overlay */}
          <View style={styles.imageWrap}>
            <Image source={{ uri: item.image }} style={styles.image} />
            {item.badge && (
              <View style={styles.badge}>
                <Text style={styles.badgeLabel}>{item.badge}</Text>
              </View>
            )}
          </View>

          {/* Texto y metadatos */}
          <View style={styles.text}>
            {item.category && (
              <Text style={[styles.category, { color: colors.textSecondary || "#64748B" }]}>
                {item.category.toUpperCase()}
              </Text>
            )}
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary || "#6B7280" }]} numberOfLines={2}>
              {item.subtitle}
            </Text>

            <View style={styles.rowBottom}>
              <View style={styles.metaRow}>
                <Ionicons name="time-outline" size={14} color={colors.textSecondary || "#9CA3AF"} />
                <Text style={[styles.metaText, { color: colors.textSecondary || "#9CA3AF" }]}>
                  Lectura rápida
                </Text>
              </View>

              <Ionicons
                name="chevron-forward-outline"
                size={20}
                color={colors.textSecondary || "#9CA3AF"}
              />
            </View>
          </View>
        </TouchableOpacity>
      </MotiView>
    </Animated.View>
  );
});

/* ───────────────────────────────── styles ───────────────────────────────── */

const styles = StyleSheet.create({
  container: { flex: 1 },

  /* Header */
  headerWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: HEADER_H,
    zIndex: 10,
    justifyContent: "center",
  },
  headerInner: {
    height: HEADER_H,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  headerTitle: { fontSize: 22, fontWeight: "800", letterSpacing: 0.2 },
  headerBadge: {
    marginLeft: 10,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(148,163,184,0.08)",
  },
  headerBadgeText: { fontSize: 11, fontWeight: "800" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 12 },

  /* Hero */
  heroCard: {
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    marginBottom: 6,
  },
  heroLeft: { flex: 1, paddingRight: 10 },
  heroTitle: { fontSize: 16, fontWeight: "800" },
  heroSub: { marginTop: 4, fontSize: 13, fontWeight: "600" },
  heroChipsRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, gap: 6 },
  heroIconBubble: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(148,163,184,0.08)",
  },
  chipText: { fontSize: 11, fontWeight: "800" },

  /* Cards */
  cardOuter: {
    marginVertical: CARD_SPACING / 2,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    padding: 10,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  imageWrap: {
    width: 88,
    height: 88,
    borderRadius: 14,
    overflow: "hidden",
    marginRight: 12,
  },
  image: { width: "100%", height: "100%" },
  badge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "rgba(15,23,42,0.78)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeLabel: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },

  text: { flex: 1 },
  category: { fontSize: 11, fontWeight: "800", marginBottom: 2 },
  title: { fontSize: 16, fontWeight: "800", marginBottom: 2 },
  subtitle: { fontSize: 13, lineHeight: 20, fontWeight: "600" },

  rowBottom: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 11, fontWeight: "700" },
});