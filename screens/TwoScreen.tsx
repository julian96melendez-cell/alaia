// screens/TwoScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Image,
  ListRenderItemInfo,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/AppNavigator";

import useTheme from "../hooks/useTheme";

// ──────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────
type Product = {
  id: string;
  name: string;
  price: number;
  image: string;
  rating?: number;
  reviews?: number;
  category?: "Tecnología" | "Ropa" | "Hogar" | "Accesorios";
  isFeatured?: boolean;
};

type Banner = {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  cta?: string;
};

const { width } = Dimensions.get("window");
const HEADER_H = 64;
const HERO_H = Math.min(240, width * 0.6);
const GRID_GAP = 12;
const COL_W = (width - 16 * 2 - GRID_GAP) / 2;

// ──────────────────────────────────────────────
// Mock (puedes reemplazar por Firestore)
// ──────────────────────────────────────────────
const BANNERS: Banner[] = [
  {
    id: "b1",
    title: "Premium Days",
    subtitle: "Hasta 35% OFF en audio",
    image: "https://images.unsplash.com/photo-1518449038883-7db3bd3c5862?w=1600",
    cta: "Explorar",
  },
  {
    id: "b2",
    title: "Home & Deco",
    subtitle: "Nuevo minimalismo 2025",
    image: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1600",
    cta: "Ver más",
  },
  {
    id: "b3",
    title: "Lanzamientos Pro",
    subtitle: "Tecnología que inspira",
    image: "https://images.unsplash.com/photo-1518773553398-650c184e0bb3?w=1600",
    cta: "Descubrir",
  },
];

const ALL_PRODUCTS: Product[] = [
  {
    id: "p1",
    name: "Auriculares ANC Max",
    price: 139.99,
    image: "https://images.unsplash.com/photo-1518449038883-7db3bd3c5862?w=800",
    rating: 4.7,
    reviews: 98,
    category: "Tecnología",
    isFeatured: true,
  },
  {
    id: "p2",
    name: "Smartwatch ALAÏA Fit",
    price: 119.99,
    image: "https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=800",
    rating: 4.6,
    reviews: 133,
    category: "Tecnología",
    isFeatured: true,
  },
  {
    id: "p3",
    name: "Mochila Minimal Pro",
    price: 69.99,
    image: "https://images.unsplash.com/photo-1520975922203-b0dc1a2a6f3a?w=800",
    rating: 4.5,
    reviews: 80,
    category: "Accesorios",
  },
  {
    id: "p4",
    name: "Lámpara Minimalista",
    price: 49.99,
    image: "https://images.unsplash.com/photo-1606813902911-8a9fdd9af099?w=800",
    rating: 4.6,
    reviews: 72,
    category: "Hogar",
  },
  {
    id: "p5",
    name: "Camiseta Premium",
    price: 29.99,
    image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800",
    rating: 4.4,
    reviews: 51,
    category: "Ropa",
  },
  {
    id: "p6",
    name: "Barra de Sonido Atmos",
    price: 219.0,
    image: "https://images.unsplash.com/photo-1593359677879-4f72a6f2fbb9?w=800",
    rating: 4.8,
    reviews: 201,
    category: "Tecnología",
  },
  {
    id: "p7",
    name: "Set Tazas Nordic (x2)",
    price: 24.5,
    image: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=800",
    rating: 4.3,
    reviews: 33,
    category: "Hogar",
  },
  {
    id: "p8",
    name: "Sneakers Urban Edge",
    price: 89.0,
    image: "https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=800",
    rating: 4.5,
    reviews: 144,
    category: "Ropa",
  },
];

const CATEGORIES = ["Todos", "Tecnología", "Ropa", "Hogar", "Accesorios"] as const;
type Category = (typeof CATEGORIES)[number];

// ──────────────────────────────────────────────
// Componente principal
// ──────────────────────────────────────────────
export default function TwoScreen() {
  const { theme, isDarkMode } = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [selected, setSelected] = useState<Category>("Todos");
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const headerY = useRef(new Animated.Value(0)).current;
  const bannerX = useRef(new Animated.Value(0)).current;

  // Auto-rotación de banners
  useEffect(() => {
    let mounted = true;
    const loop = () => {
      if (!mounted) return;
      Animated.sequence([
        Animated.timing(bannerX, {
          toValue: width,
          duration: 3200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(bannerX, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]).start(() => loop());
    };
    loop();
    return () => {
      mounted = false;
      bannerX.stopAnimation();
    };
  }, [bannerX]);

  // Filtrado
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ALL_PRODUCTS.filter((p) => {
      const hitCat = selected === "Todos" ? true : p.category === selected;
      const hitQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q);
      return hitCat && hitQuery;
    });
  }, [selected, query]);

  // Pull-to-refresh
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    const t = setTimeout(() => setRefreshing(false), 900);
    return () => clearTimeout(t);
  }, []);

  // Navegación con React Navigation
  const goDetail = useCallback(
    (item: Product) => {
      navigation.navigate("ProductDetail", {
        productId: item.id,
      });
    },
    [navigation]
  );

  // Animaciones header
  const headerTranslate = headerY.interpolate({
    inputRange: [0, 40],
    outputRange: [0, -24],
    extrapolate: "clamp",
  });
  const searchOpacity = headerY.interpolate({
    inputRange: [0, 24, 80],
    outputRange: [1, 0.9, 0],
    extrapolate: "clamp",
  });

  // Chips categorías
  const renderChip = useCallback(
    (cat: Category) => {
      const active = selected === cat;
      return (
        <TouchableOpacity
          key={cat}
          onPress={() => setSelected(cat)}
          activeOpacity={0.9}
          style={[
            styles.chip,
            {
              backgroundColor: active
                ? theme.primary
                : isDarkMode
                ? "#0B1220"
                : "#F1F5F9",
              borderColor: active
                ? theme.primary
                : isDarkMode
                ? "#233046"
                : "#E5E7EB",
            },
          ]}
        >
          <Text
            style={[
              styles.chipText,
              { color: active ? "#fff" : theme.text },
            ]}
          >
            {cat}
          </Text>
        </TouchableOpacity>
      );
    },
    [isDarkMode, selected, theme.primary, theme.text]
  );

  // Banner
  const renderBanner = useCallback(
    (b: Banner) => (
      <View key={b.id} style={styles.heroCard}>
        <Image source={{ uri: b.image }} style={styles.heroImage} />
        <View style={styles.heroOverlay} />
        <View style={styles.heroTextBlock}>
          <Text style={styles.heroTitle}>{b.title}</Text>
          <Text style={styles.heroSubtitle}>{b.subtitle}</Text>
          <View style={[styles.cta, { backgroundColor: theme.primary }]}>
            <Text style={styles.ctaText}>{b.cta || "Ver más"}</Text>
            <Ionicons name="chevron-forward" size={16} color="#fff" />
          </View>
        </View>
      </View>
    ),
    [theme.primary]
  );

  // Grid
  const renderGridItem = useCallback(
    ({ item, index }: ListRenderItemInfo<Product>) => {
      const imgH = index % 3 === 0 ? 160 : 200;
      return (
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={() => goDetail(item)}
          style={[
            styles.card,
            { backgroundColor: theme.card, width: COL_W },
          ]}
        >
          <Image
            source={{ uri: item.image }}
            style={[styles.cardImg, { height: imgH }]}
          />
          <Text
            style={[styles.cardName, { color: theme.text }]}
            numberOfLines={2}
          >
            {item.name}
          </Text>
          <View style={styles.cardRow}>
            <Text style={[styles.cardPrice, { color: theme.primary }]}>
              ${item.price.toFixed(2)}
            </Text>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={14} color="#F59E0B" />
              <Text
                style={[styles.ratingText, { color: theme.text }]}
              >
                {(item.rating ?? 4.6).toFixed(1)}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [goDetail, theme.card, theme.primary, theme.text]
  );

  const keyExtractor = useCallback((p: Product) => p.id, []);

  const ListHeader = useCallback(
    () => (
      <>
        {/* Carrusel */}
        <View style={{ height: HERO_H, marginBottom: 12 }}>
          <Animated.View
            style={{
              flexDirection: "row",
              width: width * BANNERS.length,
              transform: [
                {
                  translateX: Animated.modulo(
                    Animated.multiply(bannerX, -1),
                    width * BANNERS.length
                  ),
                },
              ],
            }}
          >
            {BANNERS.map(renderBanner)}
          </Animated.View>
        </View>

        {/* Chips */}
        <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
          <FlatList
            data={CATEGORIES as unknown as string[]}
            keyExtractor={(c) => c}
            renderItem={({ item }) => renderChip(item as Category)}
            horizontal
            showsHorizontalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
          />
        </View>
      </>
    ),
    [renderBanner, renderChip, bannerX]
  );

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.background },
      ]}
    >
      {/* Header flotante */}
      <Animated.View
        style={[
          styles.header,
          { transform: [{ translateY: headerTranslate }] },
        ]}
      >
        <Text style={[styles.brand, { color: theme.text }]}>
          Descubrir
        </Text>
        <Animated.View
          style={[
            styles.searchBox,
            { backgroundColor: theme.card, opacity: searchOpacity },
          ]}
        >
          <Ionicons
            name="search-outline"
            size={18}
            color={theme.textSecondary ?? "#94A3B8"}
          />
          <TextInput
            placeholder="Buscar productos, marcas…"
            placeholderTextColor={theme.textSecondary ?? "#94A3B8"}
            value={query}
            onChangeText={setQuery}
            style={[styles.searchInput, { color: theme.text }]}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")}>
              <Ionicons
                name="close-circle"
                size={18}
                color={theme.textSecondary ?? "#94A3B8"}
              />
            </TouchableOpacity>
          )}
        </Animated.View>
      </Animated.View>

      {/* Lista */}
      <Animated.FlatList
        contentContainerStyle={{
          paddingTop: HEADER_H + 8,
          paddingBottom: 24,
          paddingHorizontal: 16,
        }}
        data={filtered}
        keyExtractor={keyExtractor}
        numColumns={2}
        columnWrapperStyle={{
          justifyContent: "space-between",
          marginBottom: GRID_GAP,
        }}
        renderItem={renderGridItem}
        ListHeaderComponent={ListHeader}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: headerY } } }] as any,
          { useNativeDriver: true }
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
          />
        }
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingTop: 64 }}>
            <Ionicons
              name="sparkles-outline"
              size={44}
              color={theme.primary}
            />
            <Text
              style={{
                marginTop: 10,
                fontWeight: "800",
                color: theme.text,
              }}
            >
              Nada por aquí…
            </Text>
            <Text
              style={{
                marginTop: 4,
                color: theme.textSecondary ?? "#94A3B8",
              }}
            >
              Prueba otra categoría o término de búsqueda.
            </Text>
          </View>
        }
      />
    </View>
  );
}

// ──────────────────────────────────────────────
// Estilos
// ──────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    position: "absolute",
    top: Platform.OS === "ios" ? 8 : 0,
    left: 0,
    right: 0,
    paddingTop: Platform.OS === "ios" ? 12 : 10,
    paddingBottom: 8,
    paddingHorizontal: 16,
    zIndex: 10,
  },
  brand: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.2,
    marginBottom: 10,
  },
  searchBox: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    elevation: 3,
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 2 },

  heroCard: { width, height: HERO_H, justifyContent: "flex-end" },
  heroImage: { ...StyleSheet.absoluteFillObject },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  heroTextBlock: { padding: 16 },
  heroTitle: { color: "#fff", fontSize: 22, fontWeight: "800" },
  heroSubtitle: { color: "#fff", fontSize: 14, marginTop: 2 },
  cta: {
    alignSelf: "flex-start",
    marginTop: 8,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ctaText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  chipText: { fontSize: 13, fontWeight: "800" },

  card: {
    borderRadius: 16,
    padding: 10,
    elevation: 3,
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  cardImg: { width: "100%", borderRadius: 12, marginBottom: 8 },
  cardName: { fontSize: 13, fontWeight: "700", minHeight: 34 },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  cardPrice: { fontSize: 14, fontWeight: "800" },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingText: { fontSize: 12, fontWeight: "700" },
});