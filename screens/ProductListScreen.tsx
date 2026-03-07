// screens/ProductListScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  ListRenderItem,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useCart } from "../context/CartContext";
import useTheme from "../hooks/useTheme";

// Firebase
import {
  collection,
  DocumentData,
  endAt,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  Query,
  QueryDocumentSnapshot,
  startAfter,
  startAt,
  Timestamp,
} from "firebase/firestore";

const db = getFirestore();

const { width } = Dimensions.get("window");
const CARD_WIDTH = width / 2 - 24;

// ────────────────────────────── Types ──────────────────────────────
export type Product = {
  id: string;
  name: string;
  nameLower?: string;
  price: number;
  image: string;
  rating?: number;
  reviews?: number;
  category?: string;
  isFeatured?: boolean;
  createdAt?: Timestamp;
  description?: string;
};

type FireProduct = Omit<Product, "id">;

// Theme colors inferidos desde useTheme (sin pelear con TS)
type ThemeColors = ReturnType<typeof useTheme>["colors"];

// ────────────────────────────── Constantes ──────────────────────────────
const PAGE_SIZE = 12;
const FAV_KEY = "ALAIA_FAV_PRODUCTS";
const SEARCH_DEBOUNCE_MS = 350;

// ────────────────────────────── Card Component ──────────────────────────────
type ProductCardProps = {
  item: Product;
  isFavorite: boolean;
  colors: ThemeColors;
  isDarkMode: boolean;
  onToggleFavorite: () => void;
  onAddToCart: () => void;
  onOpenDetail: () => void;
};

const ProductCard = memo(function ProductCard({
  item,
  isFavorite,
  colors,
  isDarkMode,
  onToggleFavorite,
  onAddToCart,
  onOpenDetail,
}: ProductCardProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: true,
    }).start();
  }, [scale]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [scale]);

  const showBadge = item.isFeatured || item.createdAt;

  return (
    <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onOpenDetail}
        style={[
          styles.cardInner,
          {
            backgroundColor: colors.card,
            shadowColor: isDarkMode ? "#000" : "#CBD5E1",
          },
        ]}
      >
        {/* Favorito */}
        <TouchableOpacity
          style={styles.favoriteIcon}
          onPress={onToggleFavorite}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isFavorite ? "heart" : "heart-outline"}
            size={22}
            color={isFavorite ? "#EF4444" : "#A1A1AA"}
          />
        </TouchableOpacity>

        {/* Badge destacado / nuevo */}
        {showBadge && (
          <View
            style={[
              styles.badge,
              {
                backgroundColor:
                  colors.primary + (isDarkMode ? "44" : "22"),
              },
            ]}
          >
            <Ionicons
              name={item.isFeatured ? "sparkles-outline" : "flame-outline"}
              size={13}
              color={colors.primary}
            />
            <Text style={[styles.badgeText, { color: colors.primary }]}>
              {item.isFeatured ? "Destacado" : "Nuevo"}
            </Text>
          </View>
        )}

        {/* Imagen */}
        <Image source={{ uri: item.image }} style={styles.image} />

        {/* Nombre */}
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
          {item.name}
        </Text>

        {/* Precio + rating */}
        <View style={styles.rowBetween}>
          <Text style={[styles.price, { color: colors.primary }]}>
            ${item.price.toFixed(2)}
          </Text>

          {(item.rating ?? 0) > 0 && (
            <View style={styles.rating}>
              <Ionicons name="star" size={14} color="#FBBF24" />
              <Text
                style={[styles.ratingText, { color: colors.text }]}
              >
                {item.rating?.toFixed(1)}
              </Text>
              {item.reviews ? (
                <Text
                  style={[
                    styles.ratingReviews,
                    { color: colors.textSecondary || "#9CA3AF" },
                  ]}
                >
                  ({item.reviews})
                </Text>
              ) : null}
            </View>
          )}
        </View>

        {/* Botón carrito */}
        <TouchableOpacity
          style={[styles.cartButton, { backgroundColor: colors.primary }]}
          onPress={onAddToCart}
          activeOpacity={0.92}
        >
          <Ionicons name="cart-outline" size={18} color="#fff" />
          <Text style={styles.cartButtonText}>Agregar</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ────────────────────────────── Header Component ──────────────────────────────
type HeaderProps = {
  queryText: string;
  onChangeText: (t: string) => void;
  colors: ThemeColors;
  isDarkMode: boolean;
};

const ListHeader = memo(function ListHeader({
  queryText,
  onChangeText,
  colors,
  isDarkMode,
}: HeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTopRow}>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>
            Productos
          </Text>
          <Text
            style={[
              styles.subtitle,
              { color: colors.textSecondary || "#64748B" },
            ]}
          >
            Explora el catálogo y descubre novedades
          </Text>
        </View>
        <View
          style={[
            styles.pill,
            {
              backgroundColor: isDarkMode ? "#020617" : "#E5E7EB",
              borderColor: isDarkMode ? "#1E293B" : "#CBD5E1",
            },
          ]}
        >
          <Ionicons
            name="sparkles-outline"
            size={14}
            color={colors.primary}
          />
          <Text
            style={[
              styles.pillText,
              { color: colors.textSecondary || "#64748B" },
            ]}
          >
            Smart feed
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.searchBox,
          {
            backgroundColor: colors.card,
            borderColor: isDarkMode ? "#1F2933" : "#E5E7EB",
          },
        ]}
      >
        <Ionicons
          name="search-outline"
          size={18}
          color={colors.textSecondary || "#94A3B8"}
        />

        <TextInput
          value={queryText}
          onChangeText={onChangeText}
          placeholder="Buscar por nombre…"
          placeholderTextColor={colors.textSecondary || "#94A3B8"}
          style={[styles.searchInput, { color: colors.text }]}
          returnKeyType="search"
        />

        {!!queryText && (
          <TouchableOpacity onPress={() => onChangeText("")}>
            <Ionicons
              name="close-circle"
              size={18}
              color={colors.textSecondary || "#94A3B8"}
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});

// ────────────────────────────── Empty & Footer ──────────────────────────────
const ListEmpty = memo(function ListEmpty({
  loading,
  colors,
}: {
  loading: boolean;
  colors: ThemeColors;
}) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <Text style={{ color: colors.text, marginTop: 8 }}>
          Cargando productos…
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <Ionicons name="cube-outline" size={48} color={colors.primary} />
      <Text
        style={{
          color: colors.text,
          fontWeight: "800",
          marginTop: 8,
        }}
      >
        Sin resultados
      </Text>
      <Text
        style={{
          color: colors.textSecondary || "#6B7280",
          marginTop: 2,
        }}
      >
        Prueba con otro término de búsqueda.
      </Text>
    </View>
  );
});

const ListFooter = memo(function ListFooter({
  loadingMore,
  reachedEnd,
  colors,
}: {
  loadingMore: boolean;
  reachedEnd: boolean;
  colors: ThemeColors;
}) {
  if (loadingMore) {
    return (
      <View style={{ paddingVertical: 16, alignItems: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (reachedEnd) {
    return (
      <View style={{ paddingVertical: 12, alignItems: "center" }}>
        <Text
          style={{
            color: colors.textSecondary || "#6B7280",
            fontSize: 12,
            fontWeight: "700",
          }}
        >
          No hay más productos
        </Text>
      </View>
    );
  }

  return null;
});

// ────────────────────────────── MAIN SCREEN ──────────────────────────────
export default function ProductListScreen() {
  const { colors, isDarkMode } = useTheme();
  const navigation = useNavigation<any>();
  const { addItem } = useCart();

  // Favoritos
  const [favorites, setFavorites] = useState<string[]>([]);

  // Búsqueda con debounce
  const [queryText, setQueryText] = useState<string>("");
  const [internalSearch, setInternalSearch] = useState<string>("");
  const debTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Data / paginación
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  const lastDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const reachedEndRef = useRef<boolean>(false);
  const reqIdRef = useRef<number>(0);

  // ───────────── Favoritos persistidos ─────────────
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(FAV_KEY);
        if (raw) setFavorites(JSON.parse(raw));
      } catch {
        // noop
      }
    })();
  }, []);

  const toggleFavorite = useCallback(async (id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];

      AsyncStorage.setItem(FAV_KEY, JSON.stringify(next)).catch(() => {});

      return next;
    });
  }, []);

  // ───────────── Debounce búsqueda ─────────────
  useEffect(() => {
    if (debTimer.current) clearTimeout(debTimer.current);
    debTimer.current = setTimeout(() => {
      setInternalSearch(queryText.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debTimer.current) clearTimeout(debTimer.current);
    };
  }, [queryText]);

  // ───────────── Mapeo de documentos ─────────────
  const mapDoc = useCallback(
    (d: QueryDocumentSnapshot<DocumentData>): Product => {
      const data = d.data() as FireProduct;

      return {
        id: d.id,
        name: data.name ?? "Producto",
        nameLower: data.nameLower,
        price: Number(data.price ?? 0),
        image: String(data.image ?? ""),
        rating: typeof data.rating === "number" ? data.rating : undefined,
        reviews:
          typeof data.reviews === "number" ? data.reviews : undefined,
        category: data.category,
        createdAt: data.createdAt,
        isFeatured: Boolean(data.isFeatured),
        description: data.description,
      };
    },
    []
  );

  // ───────────── Query builders ─────────────
  const buildBaseQuery = useCallback((): Query<DocumentData> => {
    if (!lastDocRef.current) {
      return query(
        collection(db, "products"),
        orderBy("createdAt", "desc"),
        limit(PAGE_SIZE)
      );
    }

    return query(
      collection(db, "products"),
      orderBy("createdAt", "desc"),
      startAfter(lastDocRef.current),
      limit(PAGE_SIZE)
    );
  }, []);

  const buildSearchQuery = useCallback(
    (term: string): Query<DocumentData> => {
      const qLower = term.toLowerCase();

      if (!lastDocRef.current) {
        return query(
          collection(db, "products"),
          orderBy("nameLower"),
          startAt(qLower),
          endAt(qLower + "\uf8ff"),
          limit(PAGE_SIZE)
        );
      }

      return query(
        collection(db, "products"),
        orderBy("nameLower"),
        startAt(qLower),
        endAt(qLower + "\uf8ff"),
        startAfter(lastDocRef.current),
        limit(PAGE_SIZE)
      );
    },
    []
  );

  // ───────────── Carga inicial ─────────────
  const loadFirstPage = useCallback(
    async (term: string) => {
      const myReq = ++reqIdRef.current;
      try {
        setLoading(true);
        reachedEndRef.current = false;
        lastDocRef.current = null;

        const q =
          term.length >= 2
            ? buildSearchQuery(term)
            : buildBaseQuery();
        const snap = await getDocs(q);

        if (reqIdRef.current !== myReq) return;

        const list = snap.docs.map(mapDoc);
        setProducts(list);

        if (snap.docs.length > 0) {
          lastDocRef.current = snap.docs[snap.docs.length - 1];
        }

        if (snap.docs.length < PAGE_SIZE) {
          reachedEndRef.current = true;
        }
      } catch (e) {
        console.error("loadFirstPage:", e);
        Alert.alert("Error", "No se pudieron cargar los productos.");
      } finally {
        if (reqIdRef.current === myReq) {
          setLoading(false);
        }
      }
    },
    [buildBaseQuery, buildSearchQuery, mapDoc]
  );

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || reachedEndRef.current) return;

    setLoadingMore(true);

    try {
      const term = internalSearch;
      const q =
        term.length >= 2
          ? buildSearchQuery(term)
          : buildBaseQuery();
      const snap = await getDocs(q);

      if (snap.empty) {
        reachedEndRef.current = true;
        return;
      }

      const list = snap.docs.map(mapDoc);
      setProducts((prev) => [...prev, ...list]);
      lastDocRef.current = snap.docs[snap.docs.length - 1];

      if (snap.docs.length < PAGE_SIZE) {
        reachedEndRef.current = true;
      }
    } catch (e) {
      console.error("loadMore:", e);
    } finally {
      setLoadingMore(false);
    }
  }, [
    internalSearch,
    buildBaseQuery,
    buildSearchQuery,
    mapDoc,
    loading,
    loadingMore,
  ]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFirstPage(internalSearch);
    setRefreshing(false);
  }, [loadFirstPage, internalSearch]);

  // Cargar al cambiar búsqueda
  useEffect(() => {
    loadFirstPage(internalSearch);
  }, [internalSearch, loadFirstPage]);

  // ───────────── Render item ─────────────
  const renderProduct: ListRenderItem<Product> = useCallback(
    ({ item }) => {
      const isFavorite = favorites.includes(item.id);

      const handleAdd = () =>
        addItem({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: 1,
          image: item.image,
          color: undefined,
          size: undefined,
          category: item.category,
        });

      const handleOpenDetail = () =>
        navigation.navigate("ProductDetail", { product: item });

      return (
        <ProductCard
          item={item}
          isFavorite={isFavorite}
          colors={colors}
          isDarkMode={isDarkMode}
          onToggleFavorite={() => toggleFavorite(item.id)}
          onAddToCart={handleAdd}
          onOpenDetail={handleOpenDetail}
        />
      );
    },
    [favorites, addItem, navigation, colors, isDarkMode, toggleFavorite]
  );

  const keyExtractor = useCallback((p: Product) => p.id, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={products}
        keyExtractor={keyExtractor}
        renderItem={renderProduct}
        numColumns={2}
        columnWrapperStyle={{ justifyContent: "space-between" }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        ListHeaderComponent={
          <ListHeader
            queryText={queryText}
            onChangeText={setQueryText}
            colors={colors}
            isDarkMode={isDarkMode}
          />
        }
        ListEmptyComponent={
          <ListEmpty loading={loading} colors={colors} />
        }
        ListFooterComponent={
          <ListFooter
            loadingMore={loadingMore}
            reachedEnd={reachedEndRef.current}
            colors={colors}
          />
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        onEndReachedThreshold={0.3}
        onEndReached={loadMore}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// ───────────────────────────── Styles ─────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 40,
  },

  header: { paddingHorizontal: 0, paddingTop: 16, paddingBottom: 8 },
  headerTopRow: {
    paddingHorizontal: 16,
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillText: { fontSize: 11, fontWeight: "700" },

  searchBox: {
    marginTop: 8,
    marginHorizontal: 16,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1.2,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 2 },

  // Cards
  card: {
    marginBottom: 20,
    width: CARD_WIDTH,
  },
  cardInner: {
    borderRadius: 16,
    padding: 12,
    elevation: 4,
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  favoriteIcon: { position: "absolute", top: 10, right: 10, zIndex: 2 },

  badge: {
    position: "absolute",
    top: 12,
    left: 10,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 10, fontWeight: "800" },

  image: {
    width: "100%",
    height: 140,
    borderRadius: 12,
    marginBottom: 10,
    resizeMode: "cover",
  },

  name: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
    minHeight: 38,
  },

  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },

  price: { fontSize: 16, fontWeight: "800" },

  rating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  ratingText: { fontSize: 12, fontWeight: "700" },
  ratingReviews: { fontSize: 11, fontWeight: "600" },

  cartButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingVertical: 10,
    marginTop: 4,
    gap: 6,
  },
  cartButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
});