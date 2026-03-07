// screens/HomeScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  ListRenderItemInfo,
  Platform,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type DimensionValue,
} from "react-native";

import { products } from "../constants/products";
import { useCart } from "../context/CartContext";
import { useThemeContext } from "../context/ThemeContext";

const { width } = Dimensions.get("window");
const BANNER_W = width;
const CARD_W = width / 2 - 24;

type Product = (typeof products)[number];

type Category = {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const BANNERS = [
  {
    id: "b1",
    title: "Colección Premium",
    subtitle: "Hasta 30% OFF en selección exclusiva",
    image: "https://images.unsplash.com/photo-1503342217505-b0a15cf70489?w=1600",
    cta: "Ver ahora",
    tag: "Exclusivo",
  },
  {
    id: "b2",
    title: "Tecnología Pro",
    subtitle: "Equipos de alto rendimiento 2025",
    image: "https://images.unsplash.com/photo-1518773553398-650c184e0bb3?w=1600",
    cta: "Explorar",
    tag: "Nuevo",
  },
  {
    id: "b3",
    title: "Hogar & Deco",
    subtitle: "Diseño minimalista para tu espacio",
    image: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1600",
    cta: "Descubrir",
    tag: "Tendencia",
  },
] as const;

const CATEGORIES: Category[] = [
  { id: "c1", name: "Ropa", icon: "shirt-outline" },
  { id: "c2", name: "Tecnología", icon: "hardware-chip-outline" },
  { id: "c3", name: "Hogar", icon: "home-outline" },
  { id: "c4", name: "Accesorios", icon: "watch-outline" },
];

/* ───────────────────────── Skeleton ───────────────────────── */

function Skeleton({
  colors,
}: {
  colors: ReturnType<typeof useThemeContext>["colors"];
}) {
  const Block = ({
    h,
    w,
    r = 10,
    mt = 0,
  }: {
    h: number;
    w: DimensionValue;
    r?: number;
    mt?: number;
  }) => (
    <View
      style={{
        height: h,
        width: w,
        borderRadius: r,
        backgroundColor: colors.backgroundSecondary,
        marginTop: mt,
      }}
    />
  );

  return (
    <View>
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 10,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <Block h={22} w={110} r={6} />
        <Block h={24} w={24} r={12} />
      </View>
      <View style={{ paddingHorizontal: 16, marginBottom: 12, gap: 8 }}>
        <Block h={42} w={"100%"} r={12} />
      </View>
      <Block h={190} w={"100%"} r={16} />
      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          gap: 6,
          marginTop: 8,
          marginBottom: 10,
        }}
      >
        <Block h={7} w={7} r={3.5} />
        <Block h={7} w={7} r={3.5} />
        <Block h={7} w={7} r={3.5} />
      </View>
      <View style={{ paddingHorizontal: 16 }}>
        <Block h={18} w={120} r={6} />
      </View>
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 16,
          gap: 10,
          marginTop: 10,
        }}
      >
        {[...Array(4)].map((_, i) => (
          <Block key={i} h={36} w={90} r={18} />
        ))}
      </View>
      <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
        <Block h={18} w={120} r={6} />
      </View>
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 16,
          gap: 14,
          marginTop: 10,
        }}
      >
        {[...Array(3)].map((_, i) => (
          <View key={i} style={{ width: 210 }}>
            <Block h={110} w={"100%"} r={12} />
            <Block h={16} w={"80%"} r={6} mt={8} />
            <Block h={16} w={90} r={6} mt={8} />
            <Block h={36} w={"100%"} r={10} mt={8} />
          </View>
        ))}
      </View>
    </View>
  );
}

/* ───────────────────────── Badge carrito ───────────────────────── */

function CartBadge({ count, color }: { count: number; color: string }) {
  return (
    <View style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name="cart-outline" size={24} color={color} />
      {count > 0 && (
        <View
          style={{
            position: "absolute",
            right: -2,
            top: -2,
            backgroundColor: "#EF4444",
            borderRadius: 9,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 4,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>
            {count > 99 ? "99+" : count}
          </Text>
        </View>
      )}
    </View>
  );
}

/* ───────────────────────── Pantalla principal ───────────────────────── */

export default function HomeScreen() {
  const { colors, isDarkMode } = useThemeContext();
  const navigation = useNavigation<any>();
  const { addItem, items } = useCart();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const pager = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true }
  );

  // 🔍 Filtro inteligente
  const filtered: Product[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byQuery = q
      ? products.filter((p) => p.name?.toLowerCase().includes(q))
      : products;

    if (!category) return byQuery;

    return byQuery.filter((p: any) =>
      String(p.category ?? "")
        .toLowerCase()
        .includes(category.toLowerCase())
    );
  }, [query, category]);

  const featured: Product[] = useMemo(
    () => filtered.filter((p: any) => p.isFeatured).slice(0, 8),
    [filtered]
  );

  const recommended: Product[] = useMemo(
    () => filtered.slice(0, 20),
    [filtered]
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 750);
  }, []);

  const cartCount = useMemo(
    () => items.reduce((acc: number, it: any) => acc + (it.quantity || 0), 0),
    [items]
  );

  // 🎚 Header animado (elevación + bg dinámico)
  const headerTranslate = scrollY.interpolate({
    inputRange: [0, 40],
    outputRange: [0, -8],
    extrapolate: "clamp",
  });

  const headerElevation = scrollY.interpolate({
    inputRange: [0, 40],
    outputRange: [0, 6],
    extrapolate: "clamp",
  });

  const headerBgOpacity = scrollY.interpolate({
    inputRange: [0, 40],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar
        barStyle={isDarkMode ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      {/* Header flotante */}
      <Animated.View
        style={[
          styles.topBar,
          {
            transform: [{ translateY: headerTranslate }],
            elevation: headerElevation as any,
            shadowOpacity: headerElevation.interpolate({
              inputRange: [0, 6],
              outputRange: [0, 0.14],
            }) as any,
            backgroundColor: headerBgOpacity.interpolate({
              inputRange: [0, 1],
              outputRange: ["transparent", colors.background],
            }) as any,
          },
        ]}
      >
        <View style={styles.brandLeft}>
          <LinearGradient
            colors={
              isDarkMode
                ? ["#1E293B", "#0F172A"]
                : ["#EEF2FF", "#E0ECFF"]
            }
            style={styles.brandIconWrap}
          >
            <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
          </LinearGradient>
          <View>
            <Text style={[styles.brand, { color: colors.text }]}>ALAÏA</Text>
            <Text style={[styles.brandSub, { color: colors.textSecondary }]}>
              Shopping reinventado
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <TouchableOpacity
            onPress={() => navigation.navigate("Profile")}
            accessibilityRole="button"
            accessibilityLabel="Ir a tu perfil"
            activeOpacity={0.9}
          >
            <Ionicons name="person-circle-outline" size={28} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate("Cart")}
            accessibilityRole="button"
            accessibilityLabel="Ir al carrito"
            activeOpacity={0.9}
          >
            <CartBadge count={cartCount} color={colors.text} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Contenido principal con scroll */}
      <Animated.FlatList
        data={[{ key: "content" }]}
        keyExtractor={(i) => i.key}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 32 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={refreshing ? <Skeleton colors={colors} /> : null}
        renderItem={() => (
          <>
            {/* Margin vertical para no quedar debajo del header */}
            <View style={{ height: Platform.OS === "ios" ? 80 : 72 }} />

            {/* Buscador */}
            <View
              style={[
                styles.searchBox,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  shadowColor: "#000",
                },
              ]}
            >
              <Ionicons
                name="search-outline"
                size={18}
                color={colors.textSecondary}
              />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar productos, marcas…"
                placeholderTextColor={colors.textSecondary}
                style={[styles.searchInput, { color: colors.text }]}
                returnKeyType="search"
              />
              {!!query && (
                <TouchableOpacity
                  onPress={() => setQuery("")}
                  accessibilityRole="button"
                  accessibilityLabel="Borrar búsqueda"
                >
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              )}
            </View>

            {/* Banner principal con overlay futurista */}
            <Animated.FlatList
              data={BANNERS}
              keyExtractor={(b) => b.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              pagingEnabled
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { x: pager } } }],
                { useNativeDriver: false }
              )}
              scrollEventThrottle={16}
              renderItem={({ item }) => (
                <View style={styles.bannerWrap}>
                  <Image source={{ uri: item.image }} style={styles.bannerImage} />
                  <LinearGradient
                    colors={
                      isDarkMode
                        ? ["rgba(15,23,42,0.1)", "rgba(15,23,42,0.95)"]
                        : ["rgba(15,23,42,0.1)", "rgba(15,23,42,0.85)"]
                    }
                    style={styles.bannerOverlay}
                  />
                  <View style={styles.bannerTextWrap}>
                    <View style={styles.bannerTagRow}>
                      <View style={styles.bannerTag}>
                        <Text style={styles.bannerTagText}>{item.tag}</Text>
                      </View>
                      <View style={styles.bannerMini}>
                        <Ionicons
                          name="time-outline"
                          size={13}
                          color="#E5E7EB"
                        />
                        <Text style={styles.bannerMiniText}>Esta semana</Text>
                      </View>
                    </View>
                    <Text style={styles.bannerTitle}>{item.title}</Text>
                    <Text style={styles.bannerSubtitle}>{item.subtitle}</Text>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      style={[styles.bannerCta, { backgroundColor: colors.primary }]}
                    >
                      <Text style={styles.bannerCtaText}>{item.cta}</Text>
                      <Ionicons name="chevron-forward" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />

            {/* Dots del pager */}
            <View style={styles.dotsRow}>
              {BANNERS.map((_, i) => {
                const inputRange = [
                  (i - 1) * BANNER_W,
                  i * BANNER_W,
                  (i + 1) * BANNER_W,
                ];
                const opacity = pager.interpolate({
                  inputRange,
                  outputRange: [0.3, 1, 0.3],
                  extrapolate: "clamp",
                });
                const scale = pager.interpolate({
                  inputRange,
                  outputRange: [1, 1.25, 1],
                });
                return (
                  <Animated.View
                    key={i}
                    style={[
                      styles.dot,
                      {
                        opacity,
                        transform: [{ scale }],
                        backgroundColor: colors.primary,
                      },
                    ]}
                  />
                );
              })}
            </View>

            {/* Categorías */}
            <SectionHeader
              title="Categorías"
              subtitle="Explora por tipo de producto"
              colors={colors}
            />
            <FlatList
              data={CATEGORIES}
              keyExtractor={(c) => c.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 2 }}
              ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
              renderItem={({ item }) => {
                const active =
                  category?.toLowerCase() === item.name.toLowerCase();
                return (
                  <TouchableOpacity
                    onPress={() => setCategory(active ? null : item.name)}
                    activeOpacity={0.92}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active
                          ? `${colors.primary}22`
                          : colors.card,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name={item.icon}
                      size={16}
                      color={active ? colors.primary : colors.text}
                    />
                    <Text
                      style={{
                        color: active ? colors.primary : colors.text,
                        fontWeight: "700",
                        fontSize: 13,
                      }}
                    >
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />

            {/* Destacados */}
            {featured.length > 0 && (
              <>
                <SectionHeader
                  title="Destacados"
                  subtitle="Selección recomendada para ti"
                  colors={colors}
                />
                <FlatList
                  data={featured}
                  keyExtractor={(it) => String(it.id)}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{
                    paddingHorizontal: 16,
                    paddingBottom: 4,
                  }}
                  ItemSeparatorComponent={() => <View style={{ width: 14 }} />}
                  renderItem={(info) => (
                    <ProductCard
                      info={info}
                      themeColors={colors}
                      onAdd={(prod) =>
                        addItem({
                          id: String(prod.id),
                          name: prod.name,
                          price: Number(prod.price) || 0,
                          quantity: 1,
                          image: (prod as any).image,
                          color: (prod as any).colors?.[0],
                          size: (prod as any).sizes?.[0],
                          category: (prod as any).category,
                        })
                      }
                      onPress={() =>
                        navigation.navigate("ProductDetail", {
                          productId: String(info.item.id),
                        })
                      }
                    />
                  )}
                />
              </>
            )}

            {/* Recomendados en grid */}
            <SectionHeader
              title="Recomendados"
              subtitle={
                category
                  ? `Resultados en ${category}`
                  : "Basado en lo más popular"
              }
              colors={colors}
            />
            <FlatList
              data={recommended}
              keyExtractor={(item) => String(item.id)}
              numColumns={2}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={styles.gridWrap}
              renderItem={({ item }) => (
                <ProductTile
                  product={item}
                  themeColors={colors}
                  onAdd={(prod) =>
                    addItem({
                      id: String(prod.id),
                      name: prod.name,
                      price: Number(prod.price) || 0,
                      quantity: 1,
                      image: (prod as any).image,
                      color: (prod as any).colors?.[0],
                      size: (prod as any).sizes?.[0],
                      category: (prod as any).category,
                    })
                  }
                  onPress={() =>
                    navigation.navigate("ProductDetail", {
                      productId: String(item.id),
                    })
                  }
                />
              )}
            />
          </>
        )}
      />
    </View>
  );
}

/* ───────────────────────── Subcomponentes ───────────────────────── */

function SectionHeader({
  title,
  subtitle,
  colors,
}: {
  title: string;
  subtitle?: string;
  colors: ReturnType<typeof useThemeContext>["colors"];
}) {
  return (
    <View style={styles.sectionHeader}>
      <View>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
        {subtitle ? (
          <Text
            style={[
              styles.sectionSubtitle,
              { color: colors.textSecondary },
            ]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ProductCard({
  info,
  themeColors,
  onAdd,
  onPress,
}: {
  info: ListRenderItemInfo<Product>;
  themeColors: ReturnType<typeof useThemeContext>["colors"];
  onAdd: (p: Product) => void;
  onPress: () => void;
}) {
  const { item } = info;
  const scale = useRef(new Animated.Value(1)).current;
  const adding = useRef(new Animated.Value(0)).current;

  const onIn = () =>
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start();
  const onOut = () =>
    Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }).start();

  const runAddedFeedback = () => {
    Animated.sequence([
      Animated.timing(adding, {
        toValue: 1,
        duration: 120,
        useNativeDriver: false,
      }),
      Animated.timing(adding, {
        toValue: 0,
        duration: 320,
        useNativeDriver: false,
      }),
    ]).start();
  };

  const bgInterpolate = adding.interpolate({
    inputRange: [0, 1],
    outputRange: [themeColors.primary, "#10B981"],
  });

  const rating = (item as any).rating ?? 4.6;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        activeOpacity={0.92}
        onPressIn={onIn}
        onPressOut={onOut}
        onPress={onPress}
        style={[
          styles.cardH,
          { backgroundColor: themeColors.card, shadowColor: "#000" },
        ]}
      >
        <View style={styles.cardHImgWrap}>
          <Image
            source={{ uri: (item as any).image }}
            style={styles.cardHImage}
          />
          {item && (item as any).isFeatured && (
            <View style={styles.cardHBadge}>
              <Ionicons name="sparkles-outline" size={12} color="#FDE68A" />
              <Text style={styles.cardHBadgeText}>Top</Text>
            </View>
          )}
        </View>
        <Text
          style={[styles.cardHName, { color: themeColors.text }]}
          numberOfLines={2}
        >
          {item.name}
        </Text>
        <View style={styles.cardHRow}>
          <Text
            style={[styles.cardHPrice, { color: themeColors.primary }]}
          >
            ${Number(item.price || 0).toFixed(2)}
          </Text>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={14} color="#FACC15" />
            <Text
              style={[
                styles.ratingText,
                { color: themeColors.text },
              ]}
            >
              {rating.toFixed(1)}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.addBtn]}
          onPress={() => {
            onAdd(item);
            runAddedFeedback();
          }}
          activeOpacity={0.9}
        >
          <Animated.View
            style={[styles.addBtnBg, { backgroundColor: bgInterpolate }]}
          />
          <Ionicons name="cart-outline" size={16} color="#fff" />
          <Text style={styles.addBtnText}>Agregar</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

function ProductTile({
  product,
  themeColors,
  onAdd,
  onPress,
}: {
  product: Product;
  themeColors: ReturnType<typeof useThemeContext>["colors"];
  onAdd: (p: Product) => void;
  onPress: () => void;
}) {
  const y = useRef(new Animated.Value(20)).current;
  const op = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.spring(y, { toValue: 0, useNativeDriver: true }),
      Animated.timing(op, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [y, op]);

  const pulse = useRef(new Animated.Value(0)).current;
  const runPulse = () => {
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.spring(pulse, { toValue: 0, friction: 4, useNativeDriver: true }),
    ]).start();
  };
  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.96],
  });

  return (
    <Animated.View style={{ transform: [{ translateY: y }], opacity: op }}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <TouchableOpacity
          activeOpacity={0.92}
          style={[
            styles.tile,
            { backgroundColor: themeColors.card, shadowColor: "#000" },
          ]}
          onPress={onPress}
        >
          <View style={styles.tileImgWrap}>
            <Image
              source={{ uri: (product as any).image }}
              style={styles.tileImage}
            />
          </View>
          <Text
            style={[styles.tileName, { color: themeColors.text }]}
            numberOfLines={2}
          >
            {product.name}
          </Text>
          <View style={styles.tileRow}>
            <Text
              style={[
                styles.tilePrice,
                { color: themeColors.primary },
              ]}
            >
              ${Number(product.price || 0).toFixed(2)}
            </Text>
            <TouchableOpacity
              onPress={() => {
                onAdd(product);
                runPulse();
              }}
              style={[
                styles.tileAdd,
                { backgroundColor: themeColors.primary },
              ]}
            >
              <Ionicons name="add" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

/* ───────────────────────── Estilos ───────────────────────── */

const styles = StyleSheet.create({
  topBar: {
    position: "absolute",
    left: 0,
    right: 0,
    top: Platform.OS === "ios" ? 8 : 2,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 18 : 12,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 20,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  brandLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { fontSize: 18, fontWeight: "900", letterSpacing: 0.5 },
  brandSub: { fontSize: 11, fontWeight: "700", opacity: 0.9 },

  searchBox: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    elevation: 3,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 2 },

  bannerWrap: {
    width: BANNER_W,
    height: 190,
    marginBottom: 8,
    borderRadius: 16,
    overflow: "hidden",
  },
  bannerImage: { width: "100%", height: "100%" },
  bannerOverlay: { ...StyleSheet.absoluteFillObject },
  bannerTextWrap: { position: "absolute", left: 16, right: 16, bottom: 16 },
  bannerTagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  bannerTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(248,250,252,0.18)",
  },
  bannerTagText: { color: "#F9FAFB", fontSize: 11, fontWeight: "800" },
  bannerMini: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.65)",
  },
  bannerMiniText: {
    color: "#E5E7EB",
    fontSize: 11,
    fontWeight: "700",
  },
  bannerTitle: { color: "#fff", fontSize: 20, fontWeight: "900" },
  bannerSubtitle: {
    color: "#E5E7EB",
    fontSize: 14,
    opacity: 0.95,
    marginTop: 2,
  },
  bannerCta: {
    marginTop: 8,
    alignSelf: "flex-start",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  bannerCtaText: { color: "#fff", fontSize: 12, fontWeight: "800" },

  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
    marginBottom: 10,
  },
  dot: { width: 7, height: 7, borderRadius: 3.5 },

  sectionHeader: {
    paddingHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { fontSize: 18, fontWeight: "800" },
  sectionSubtitle: { fontSize: 12, fontWeight: "700", opacity: 0.9 },

  chip: {
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  gridWrap: { paddingHorizontal: 16, marginTop: 4 },
  gridRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },

  cardH: {
    width: 210,
    borderRadius: 16,
    padding: 12,
    elevation: 4,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  cardHImgWrap: { borderRadius: 12, overflow: "hidden" },
  cardHImage: { width: "100%", height: 110 },
  cardHBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "rgba(15,23,42,0.75)",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cardHBadgeText: {
    color: "#FDE68A",
    fontSize: 10,
    fontWeight: "800",
  },
  cardHName: { fontSize: 14, fontWeight: "700", minHeight: 38, marginTop: 6 },
  cardHRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardHPrice: { fontSize: 15, fontWeight: "800" },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingText: { fontSize: 12, fontWeight: "700" },
  addBtn: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    overflow: "hidden",
  },
  addBtnBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
  },
  addBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },

  tile: {
    width: CARD_W,
    borderRadius: 16,
    padding: 10,
    elevation: 3,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  tileImgWrap: { borderRadius: 12, overflow: "hidden", marginBottom: 8 },
  tileImage: { width: "100%", height: 130 },
  tileName: { fontSize: 14, fontWeight: "700", minHeight: 36 },
  tileRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tilePrice: { fontSize: 15, fontWeight: "800" },
  tileAdd: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});

export { };
