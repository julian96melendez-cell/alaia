// screens/HomeScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
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

import { useCart } from "../context/CartContext";
import { useThemeContext } from "../context/ThemeContext";
import { getAllProducts, type Product } from "../services/products";

const { width } = Dimensions.get("window");
const BANNER_W = width;
const CARD_W = width / 2 - 24;

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
    subtitle: "Equipos de alto rendimiento",
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

function isMongoObjectId(value?: unknown) {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value.trim());
}

function getCartProductId(product: Product) {
  const candidates = [
    product.mongoId,
    product.id,
    (product as any)._id,
    (product as any).productoId,
    (product as any).productId,
    (product as any).backendId,
    (product as any).mongoProductId,
  ];

  const found = candidates.find((value) => isMongoObjectId(value));
  return found ? String(found).trim() : "";
}

async function addProductToCartSafe(addItem: any, product: Product) {
  const productId = getCartProductId(product);

  if (!productId) {
    Alert.alert(
      "Producto no sincronizado",
      "Este producto no tiene un ObjectId válido de Mongo."
    );
    return;
  }

  const price = Number(product.price || 0);

  if (!Number.isFinite(price) || price <= 0) {
    Alert.alert("Producto inválido", "Este producto no tiene precio válido.");
    return;
  }

  await addItem({
    id: productId,
    name: product.name || "Producto",
    price,
    quantity: 1,
    image: product.image || product.images?.[0] || null,
    color: product.colors?.[0] || null,
    size: product.sizes?.[0] || null,
    category: product.category || "general",
    stock: Number(product.stock || 10),
    maxQty: Number(product.stock || 10),
  });
}

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
        backgroundColor: colors.card,
        marginTop: mt,
      }}
    />
  );

  return (
    <View>
      <View style={styles.skeletonHeader}>
        <Block h={22} w={110} r={6} />
        <Block h={24} w={24} r={12} />
      </View>

      <View style={styles.skeletonSearch}>
        <Block h={42} w="100%" r={12} />
      </View>

      <Block h={190} w="100%" r={16} />

      <View style={styles.skeletonDots}>
        <Block h={7} w={7} r={3.5} />
        <Block h={7} w={7} r={3.5} />
        <Block h={7} w={7} r={3.5} />
      </View>
    </View>
  );
}

function CartBadge({ count, color }: { count: number; color: string }) {
  return (
    <View style={styles.cartBadgeWrap}>
      <Ionicons name="cart-outline" size={24} color={color} />

      {count > 0 ? (
        <View style={styles.cartBadge}>
          <Text style={styles.cartBadgeText}>{count > 99 ? "99+" : count}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function HomeScreen() {
  const { colors, isDarkMode } = useThemeContext();
  const navigation = useNavigation<any>();
  const { addItem, items } = useCart();

  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const pager = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;

  const loadProducts = useCallback(async (forceRefresh = false) => {
    try {
      setLoadingProducts(true);
      const list = await getAllProducts(forceRefresh);
      setProducts(list);
    } catch (error: any) {
      console.log("HOME PRODUCTS ERROR:", error);
      Alert.alert(
        "Error cargando productos",
        error?.message || "No se pudieron cargar los productos desde Mongo."
      );
    } finally {
      setLoadingProducts(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadProducts(true);
  }, [loadProducts]);

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true }
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    const byQuery = q
      ? products.filter((p) =>
          `${p.name} ${p.category} ${p.description || ""}`
            .toLowerCase()
            .includes(q)
        )
      : products;

    if (!category) return byQuery;

    return byQuery.filter((p) =>
      String(p.category || "")
        .toLowerCase()
        .includes(category.toLowerCase())
    );
  }, [products, query, category]);

  const featured = useMemo(
    () => filtered.filter((p) => p.isFeatured || p.featured).slice(0, 8),
    [filtered]
  );

  const recommended = useMemo(() => filtered.slice(0, 20), [filtered]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadProducts(true);
  }, [loadProducts]);

  const cartCount = useMemo(
    () => items.reduce((acc: number, it: any) => acc + Number(it.quantity || 0), 0),
    [items]
  );

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
            colors={isDarkMode ? ["#1E293B", "#0F172A"] : ["#EEF2FF", "#E0ECFF"]}
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

        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => navigation.navigate("Profile")} activeOpacity={0.9}>
            <Ionicons name="person-circle-outline" size={28} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate("Cart")} activeOpacity={0.9}>
            <CartBadge count={cartCount} color={colors.text} />
          </TouchableOpacity>
        </View>
      </Animated.View>

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
        renderItem={() => (
          <>
            <View style={{ height: Platform.OS === "ios" ? 80 : 72 }} />

            {loadingProducts ? (
              <Skeleton colors={colors} />
            ) : (
              <>
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
                  <Ionicons name="search-outline" size={18} color={colors.textSecondary} />

                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Buscar productos, marcas…"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.searchInput, { color: colors.text }]}
                    returnKeyType="search"
                  />

                  {!!query ? (
                    <TouchableOpacity onPress={() => setQuery("")}>
                      <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  ) : null}
                </View>

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
                            <Ionicons name="time-outline" size={13} color="#E5E7EB" />
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
                  contentContainerStyle={styles.categoriesWrap}
                  ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
                  renderItem={({ item }) => {
                    const active = category?.toLowerCase() === item.name.toLowerCase();

                    return (
                      <TouchableOpacity
                        onPress={() => setCategory(active ? null : item.name)}
                        activeOpacity={0.92}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: active ? `${colors.primary}22` : colors.card,
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
                          style={[
                            styles.chipText,
                            { color: active ? colors.primary : colors.text },
                          ]}
                        >
                          {item.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                />

                {featured.length > 0 ? (
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
                      contentContainerStyle={styles.featuredWrap}
                      ItemSeparatorComponent={() => <View style={{ width: 14 }} />}
                      renderItem={(info) => (
                        <ProductCard
                          info={info}
                          themeColors={colors}
                          onAdd={(prod) => addProductToCartSafe(addItem, prod)}
                          onPress={() =>
                            navigation.navigate("ProductDetail", {
                              id: String(info.item.id),
                              name: String(info.item.name || ""),
                              price: String(info.item.price || 0),
                              image: String(info.item.image || ""),
                              category: String(info.item.category || ""),
                            })
                          }
                        />
                      )}
                    />
                  </>
                ) : null}

                <SectionHeader
                  title="Recomendados"
                  subtitle={category ? `Resultados en ${category}` : "Basado en lo más popular"}
                  colors={colors}
                />

                {recommended.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <Ionicons name="cube-outline" size={42} color="#94A3B8" />
                    <Text style={[styles.emptyTitle, { color: colors.text }]}>
                      No hay productos
                    </Text>
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                      Crea productos en el panel admin para que aparezcan aquí.
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    data={recommended}
                    keyExtractor={(item) => String(item.id)}
                    numColumns={2}
                    columnWrapperStyle={styles.gridRow}
                    contentContainerStyle={styles.gridWrap}
                    scrollEnabled={false}
                    renderItem={({ item }) => (
                      <ProductTile
                        product={item}
                        themeColors={colors}
                        onAdd={(prod) => addProductToCartSafe(addItem, prod)}
                        onPress={() =>
                          navigation.navigate("ProductDetail", {
                            id: String(item.id),
                            name: String(item.name || ""),
                            price: String(item.price || 0),
                            image: String(item.image || ""),
                            category: String(item.category || ""),
                          })
                        }
                      />
                    )}
                  />
                )}
              </>
            )}
          </>
        )}
      />
    </View>
  );
}

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
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
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
    Animated.spring(scale, {
      toValue: 1,
      friction: 4,
      useNativeDriver: true,
    }).start();

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
          {item.image ? (
            <Image source={{ uri: item.image }} style={styles.cardHImage} />
          ) : (
            <View style={styles.imageFallback}>
              <Ionicons name="image-outline" size={28} color="#94A3B8" />
            </View>
          )}

          {item.isFeatured || item.featured ? (
            <View style={styles.cardHBadge}>
              <Ionicons name="sparkles-outline" size={12} color="#FDE68A" />
              <Text style={styles.cardHBadgeText}>Top</Text>
            </View>
          ) : null}
        </View>

        <Text style={[styles.cardHName, { color: themeColors.text }]} numberOfLines={2}>
          {item.name}
        </Text>

        <View style={styles.cardHRow}>
          <Text style={[styles.cardHPrice, { color: themeColors.primary }]}>
            ${Number(item.price || 0).toFixed(2)}
          </Text>

          <View style={styles.ratingRow}>
            <Ionicons name="star" size={14} color="#FACC15" />
            <Text style={[styles.ratingText, { color: themeColors.text }]}>
              {Number(item.rating || 4.6).toFixed(1)}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            onAdd(item);
            runAddedFeedback();
          }}
          activeOpacity={0.9}
        >
          <Animated.View style={[styles.addBtnBg, { backgroundColor: bgInterpolate }]} />
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
  const pulse = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.spring(y, { toValue: 0, useNativeDriver: true }),
      Animated.timing(op, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [y, op]);

  const runPulse = () => {
    Animated.sequence([
      Animated.timing(pulse, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.spring(pulse, {
        toValue: 0,
        friction: 4,
        useNativeDriver: true,
      }),
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
            {product.image ? (
              <Image source={{ uri: product.image }} style={styles.tileImage} />
            ) : (
              <View style={styles.tileImageFallback}>
                <Ionicons name="image-outline" size={26} color="#94A3B8" />
              </View>
            )}
          </View>

          <Text style={[styles.tileName, { color: themeColors.text }]} numberOfLines={2}>
            {product.name}
          </Text>

          <View style={styles.tileRow}>
            <Text style={[styles.tilePrice, { color: themeColors.primary }]}>
              ${Number(product.price || 0).toFixed(2)}
            </Text>

            <TouchableOpacity
              onPress={() => {
                onAdd(product);
                runPulse();
              }}
              style={[styles.tileAdd, { backgroundColor: themeColors.primary }]}
            >
              <Ionicons name="add" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  skeletonHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  skeletonSearch: {
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  skeletonDots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
    marginBottom: 10,
  },
  cartBadgeWrap: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  cartBadge: {
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
  },
  cartBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
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
  brandLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  brandSub: {
    fontSize: 11,
    fontWeight: "700",
    opacity: 0.9,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
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
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 2,
  },
  bannerWrap: {
    width: BANNER_W,
    height: 190,
    marginBottom: 8,
    borderRadius: 16,
    overflow: "hidden",
  },
  bannerImage: {
    width: "100%",
    height: "100%",
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  bannerTextWrap: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
  },
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
  bannerTagText: {
    color: "#F9FAFB",
    fontSize: 11,
    fontWeight: "800",
  },
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
  bannerTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
  },
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
  bannerCtaText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
    marginBottom: 10,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  categoriesWrap: {
    paddingHorizontal: 16,
    paddingBottom: 2,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: "700",
    opacity: 0.9,
  },
  chip: {
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chipText: {
    fontWeight: "700",
    fontSize: 13,
  },
  featuredWrap: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  gridWrap: {
    paddingHorizontal: 16,
    marginTop: 4,
  },
  gridRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  emptyBox: {
    marginTop: 26,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: "900",
  },
  emptyText: {
    marginTop: 5,
    textAlign: "center",
    fontWeight: "600",
    lineHeight: 19,
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
  cardHImgWrap: {
    borderRadius: 12,
    overflow: "hidden",
  },
  cardHImage: {
    width: "100%",
    height: 110,
  },
  imageFallback: {
    width: "100%",
    height: 110,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
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
  cardHName: {
    fontSize: 14,
    fontWeight: "700",
    minHeight: 38,
    marginTop: 6,
  },
  cardHRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardHPrice: {
    fontSize: 15,
    fontWeight: "800",
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: "700",
  },
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
  addBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  tile: {
    width: CARD_W,
    borderRadius: 16,
    padding: 10,
    elevation: 3,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  tileImgWrap: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 8,
  },
  tileImage: {
    width: "100%",
    height: 130,
  },
  tileImageFallback: {
    width: "100%",
    height: 130,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  tileName: {
    fontSize: 14,
    fontWeight: "700",
    minHeight: 36,
  },
  tileRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tilePrice: {
    fontSize: 15,
    fontWeight: "800",
  },
  tileAdd: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});