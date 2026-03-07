// screens/ProductDetailScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import {
  NavigationProp,
  RouteProp,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  ListRenderItem,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useCart } from "../context/CartContext";
import useTheme from "../hooks/useTheme";

const { width } = Dimensions.get("window");
const HERO_H = Math.min(420, width * 1.05);

/* ────────────────────────────────
 * Tipado
 * ───────────────────────────────*/
export type Product = {
  id: string;
  name: string;
  price: number;
  image: string;
  images?: string[];
  brand?: string;
  category?: string;
  description?: string;
  rating?: number;
  reviews?: number;
  colors?: string[];
  sizes?: string[];
};

/* Ruta real usada por Navigation */
type RouteParams = {
  ProductDetail: { product?: Product };
};

type DetailRoute = RouteProp<RouteParams, "ProductDetail">;
type Nav = NavigationProp<Record<string, object | undefined>>;

/* ────────────────────────────────
 * Mock de recomendados y reseñas
 * ───────────────────────────────*/
const RECOMMENDED: Product[] = [
  {
    id: "r1",
    name: "Smartwatch ALAÏA Fit",
    price: 119.99,
    image:
      "https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=800",
    rating: 4.6,
    reviews: 133,
    category: "Tecnología",
  },
  {
    id: "r2",
    name: "Auriculares ANC Max",
    price: 139.99,
    image:
      "https://images.unsplash.com/photo-1518449038883-7db3bd3c5862?w=800",
    rating: 4.7,
    reviews: 98,
    category: "Tecnología",
  },
  {
    id: "r3",
    name: "Mochila Minimal Pro",
    price: 69.99,
    image:
      "https://images.unsplash.com/photo-1520975922203-b0dc1a2a6f3a?w=800",
    rating: 4.5,
    reviews: 80,
    category: "Accesorios",
  },
];

type Review = {
  id: string;
  user: string;
  rating: number;
  text: string;
};

const SAMPLE_REVIEWS: Review[] = [
  {
    id: "rv1",
    user: "María P.",
    rating: 5,
    text: "Calidad excelente y batería real de 30h. Volvería a comprar.",
  },
  {
    id: "rv2",
    user: "Jorge L.",
    rating: 4,
    text: "Son cómodos y el ANC funciona muy bien. Envío rápido.",
  },
  {
    id: "rv3",
    user: "Ana G.",
    rating: 5,
    text: "Empaque premium, sonido nítido y buenos graves. Recomendado.",
  },
];

/* ────────────────────────────────
 * Subcomponentes UI
 * ───────────────────────────────*/
const RatingStars = memo(({ value = 4.5 }: { value?: number }) => {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);

  return (
    <View style={{ flexDirection: "row" }}>
      {Array.from({ length: full }).map((_, i) => (
        <Ionicons key={`f${i}`} name="star" size={16} color="#FACC15" />
      ))}
      {half && <Ionicons name="star-half" size={16} color="#FACC15" />}
      {Array.from({ length: empty }).map((_, i) => (
        <Ionicons key={`e${i}`} name="star-outline" size={16} color="#FACC15" />
      ))}
    </View>
  );
});

const ReviewItem = memo(
  ({
    item,
    textColor,
    secondaryColor,
    cardBg,
  }: {
    item: Review;
    textColor: string;
    secondaryColor: string;
    cardBg: string;
  }) => (
    <View style={[styles.reviewRow, { backgroundColor: cardBg }]}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
        <Ionicons name="person-circle-outline" size={22} color={textColor} />
        <Text style={[styles.reviewUser, { color: textColor }]}>{item.user}</Text>
      </View>

      <RatingStars value={item.rating} />

      <Text style={[styles.reviewText, { color: secondaryColor }]}>
        {item.text}
      </Text>
    </View>
  )
);

const RecommendedCard = memo(
  ({
    item,
    onPress,
    cardBg,
    textColor,
    primary,
  }: {
    item: Product;
    onPress: () => void;
    cardBg: string;
    textColor: string;
    primary: string;
  }) => (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={onPress}
      style={[styles.recCard, { backgroundColor: cardBg }]}
    >
      <Image source={{ uri: item.image }} style={styles.recImg} />
      <Text style={[styles.recName, { color: textColor }]} numberOfLines={2}>
        {item.name}
      </Text>
      <Text style={[styles.recPrice, { color: primary }]}>
        ${item.price.toFixed(2)}
      </Text>
      <View style={styles.recRating}>
        <Ionicons name="star" size={14} color="#F59E0B" />
        <Text style={[styles.recRatingText, { color: textColor }]}>
          {(item.rating ?? 4.5).toFixed(1)}
        </Text>
      </View>
    </TouchableOpacity>
  )
);

/* ────────────────────────────────
 * Pantalla principal
 * ───────────────────────────────*/
export default function ProductDetailScreen() {
  const { theme, isDarkMode } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<DetailRoute>();
  const { addItem } = useCart();

  const primary = theme.colors.primary;
  const text = theme.colors.text;
  const textSecondary = theme.colors.textSecondary ?? "#64748B";
  const card = theme.colors.card;
  const background = theme.colors.background;

  /* Producto recibido por params o fallback */
  const product = useMemo<Product>(() => {
    return (
      route.params?.product || {
        id: "P123",
        name: "Auriculares Bluetooth Pro",
        price: 89.99,
        image:
          "https://cdn.pixabay.com/photo/2016/11/29/04/07/music-1868612_1280.jpg",
        brand: "ALAÏA",
        category: "Tecnología",
        description:
          "Auriculares inalámbricos con cancelación de ruido activa, sonido envolvente y hasta 30 horas de batería.",
        rating: 4.7,
        reviews: 128,
        colors: ["Negro", "Blanco", "Azul"],
        sizes: ["Única"],
      }
    );
  }, [route.params]);

  const gallery = useMemo(
    () => (product.images?.length ? product.images : [product.image]),
    [product]
  );

  const [activeIdx, setActiveIdx] = useState(0);

  /* Variantes */
  const [selectedColor, setSelectedColor] = useState(product.colors?.[0]);
  const [selectedSize, setSelectedSize] = useState(product.sizes?.[0]);

  /* Cantidad */
  const [qty, setQty] = useState(1);
  const scaleCTA = useRef(new Animated.Value(1)).current;

  const bumpCTA = useCallback(() => {
    Animated.sequence([
      Animated.spring(scaleCTA, { toValue: 1.05, useNativeDriver: true }),
      Animated.spring(scaleCTA, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const scrollY = useRef(new Animated.Value(0)).current;

  const heroTranslate = scrollY.interpolate({
    inputRange: [-HERO_H, 0, HERO_H],
    outputRange: [-HERO_H * 0.15, 0, HERO_H * 0.15],
  });

  const heroScale = scrollY.interpolate({
    inputRange: [-HERO_H, 0, HERO_H],
    outputRange: [1.2, 1, 1],
  });

  const handleChangeQty = useCallback((d: 1 | -1) => {
    setQty((prev) => Math.max(1, prev + d));
  }, []);

  const handleAddToCart = useCallback(() => {
    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      quantity: qty,
      image: gallery[activeIdx],
      color: selectedColor,
      size: selectedSize,
      category: product.category,
    });

    bumpCTA();
    Alert.alert("Agregado", `${product.name} x${qty} añadido al carrito.`);
  }, [
    addItem,
    product,
    qty,
    gallery,
    activeIdx,
    selectedColor,
    selectedSize,
    bumpCTA,
  ]);

  const handleBuyNow = useCallback(() => {
    handleAddToCart();
    Alert.alert("Comprar ahora", "Ir al checkout…");
  }, [handleAddToCart]);

  /* Thumbnails */
  const renderThumb: ListRenderItem<string> = useCallback(
    ({ item, index }) => {
      const active = index === activeIdx;

      return (
        <Pressable
          onPress={() => setActiveIdx(index)}
          style={[styles.thumb, active && styles.thumbActive]}
        >
          <Image source={{ uri: item }} style={styles.thumbImg} />
        </Pressable>
      );
    },
    [activeIdx]
  );

  /* Recomendados */
  const renderRecommended: ListRenderItem<Product> = useCallback(
    ({ item }) => (
      <RecommendedCard
        item={item}
        onPress={() => navigation.navigate("ProductDetail", { product: item })}
        cardBg={card}
        textColor={text}
        primary={primary}
      />
    ),
    [navigation, card, text, primary]
  );

  /* ────────────────────────────────
   * UI principal
   * ───────────────────────────────*/
  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      {/* Barra Superior */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={text} />
        </TouchableOpacity>

        <Text style={[styles.brand, { color: text }]}>ALAÏA</Text>

        <TouchableOpacity onPress={() => Alert.alert("Compartir", "Link copiado")}>
          <Ionicons name="share-social-outline" size={22} color={text} />
        </TouchableOpacity>
      </View>

      {/* Scroll */}
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
      >
        {/* HERO */}
        <Animated.View
          style={[
            styles.heroWrap,
            { transform: [{ translateY: heroTranslate }, { scale: heroScale }] },
          ]}
        >
          <Image source={{ uri: gallery[activeIdx] }} style={styles.heroImage} />

          {/* Thumbs */}
          {gallery.length > 1 && (
            <View style={styles.thumbRow}>
              <FlatList
                horizontal
                data={gallery}
                keyExtractor={(u, i) => `${u}-${i}`}
                renderItem={renderThumb}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16 }}
              />
            </View>
          )}
        </Animated.View>

        {/* Info */}
        <View style={styles.inner}>
          <Text style={[styles.title, { color: text }]}>{product.name}</Text>

          <Text style={[styles.brandLine, { color: textSecondary }]}>
            Marca: {product.brand} • {product.category}
          </Text>

          {/* Precio */}
          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: primary }]}>
              ${product.price.toFixed(2)}
            </Text>

            <View style={styles.ratingRow}>
              <RatingStars value={product.rating ?? 4.6} />
              <Text style={[styles.ratingText, { color: text }]}>
                {(product.rating ?? 4.6).toFixed(1)} ({product.reviews ?? 40})
              </Text>
            </View>
          </View>

          {/* Variantes */}
          <View style={styles.optionsRow}>
            {/* Colores */}
            {product.colors?.length ? (
              <View style={styles.optionCol}>
                <Text style={[styles.optionLabel, { color: textSecondary }]}>
                  Color
                </Text>
                <FlatList
                  horizontal
                  data={product.colors}
                  keyExtractor={(c) => c}
                  renderItem={({ item }) => {
                    const active = item === selectedColor;
                    return (
                      <Pressable
                        onPress={() => setSelectedColor(item)}
                        style={[
                          styles.pill,
                          {
                            backgroundColor: `${primary}22`,
                            borderColor: active ? primary : "transparent",
                            borderWidth: active ? 2 : 0,
                          },
                        ]}
                      >
                        <Text style={[styles.pillText, { color: text }]}>
                          {item}
                        </Text>
                      </Pressable>
                    );
                  }}
                />
              </View>
            ) : null}

            {/* Tallas */}
            {product.sizes?.length ? (
              <View style={styles.optionCol}>
                <Text style={[styles.optionLabel, { color: textSecondary }]}>
                  Tamaño
                </Text>
                <FlatList
                  horizontal
                  data={product.sizes}
                  keyExtractor={(s) => s}
                  renderItem={({ item }) => {
                    const active = item === selectedSize;
                    return (
                      <Pressable
                        onPress={() => setSelectedSize(item)}
                        style={[
                          styles.pill,
                          {
                            backgroundColor: `${primary}22`,
                            borderColor: active ? primary : "transparent",
                            borderWidth: active ? 2 : 0,
                          },
                        ]}
                      >
                        <Text style={[styles.pillText, { color: text }]}>
                          {item}
                        </Text>
                      </Pressable>
                    );
                  }}
                />
              </View>
            ) : null}
          </View>

          {/* Descripción */}
          {product.description ? (
            <>
              <Text style={[styles.sectionTitle, { color: text }]}>
                Descripción
              </Text>
              <Text
                style={[
                  styles.description,
                  { color: isDarkMode ? "#CBD5E1" : "#475569" },
                ]}
              >
                {product.description}
              </Text>
            </>
          ) : null}

          {/* Reseñas */}
          <Text style={[styles.sectionTitle, { color: text }]}>Reseñas</Text>
          {SAMPLE_REVIEWS.map((rv) => (
            <ReviewItem
              key={rv.id}
              item={rv}
              textColor={text}
              secondaryColor={textSecondary}
              cardBg={card}
            />
          ))}

          {/* Recomendados */}
          <Text style={[styles.sectionTitle, { color: text }]}>
            También te puede gustar
          </Text>
          <FlatList
            horizontal
            data={RECOMMENDED}
            keyExtractor={(i) => i.id}
            renderItem={renderRecommended}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: 6, paddingRight: 16 }}
            ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
            ListHeaderComponent={<View style={{ width: 16 }} />}
          />
        </View>
      </Animated.ScrollView>

      {/* CTA inferior */}
      <Animated.View
        style={[
          styles.bottomBar,
          { backgroundColor: card, transform: [{ scale: scaleCTA }] },
        ]}
      >
        {/* Qty */}
        <View style={styles.qtyWrap}>
          <TouchableOpacity
            onPress={() => handleChangeQty(-1)}
            disabled={qty <= 1}
          >
            <Ionicons
              name="remove-circle-outline"
              size={28}
              color={qty <= 1 ? "#9CA3AF" : primary}
            />
          </TouchableOpacity>

          <Text style={styles.qtyText}>{qty}</Text>

          <TouchableOpacity onPress={() => handleChangeQty(1)}>
            <Ionicons name="add-circle-outline" size={28} color={primary} />
          </TouchableOpacity>
        </View>

        {/* Agregar */}
        <TouchableOpacity
          style={[styles.secondaryBtn, { borderColor: primary }]}
          onPress={handleAddToCart}
          activeOpacity={0.9}
        >
          <Ionicons name="cart-outline" size={18} color={primary} />
          <Text style={[styles.secondaryText, { color: primary }]}>
            Agregar
          </Text>
        </TouchableOpacity>

        {/* Comprar */}
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: primary }]}
          onPress={handleBuyNow}
          activeOpacity={0.95}
        >
          <Ionicons name="flash-outline" size={18} color="#fff" />
          <Text style={styles.primaryText}>Comprar ahora</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

/* ────────────────────────────────
 * Estilos
 * ───────────────────────────────*/
const styles = StyleSheet.create({
  container: { flex: 1 },

  topBar: {
    height: 56,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 6 : 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  brand: { fontSize: 16, fontWeight: "800", letterSpacing: 0.6 },

  heroWrap: {
    width,
    height: HERO_H,
    justifyContent: "center",
    alignItems: "center",
  },
  heroImage: {
    width,
    height: HERO_H,
    resizeMode: "cover",
  },

  thumbRow: {
    position: "absolute",
    bottom: 14,
    width: "100%",
  },
  thumb: {
    width: 54,
    height: 54,
    borderRadius: 10,
    marginRight: 8,
    overflow: "hidden",
    opacity: 0.75,
    borderWidth: 1,
    borderColor: "transparent",
  },
  thumbActive: { opacity: 1, borderColor: "#fff" },
  thumbImg: { width: "100%", height: "100%" },

  inner: { paddingHorizontal: 16, paddingTop: 16 },
  title: { fontSize: 22, fontWeight: "800" },
  brandLine: { marginTop: 4, fontSize: 13 },

  priceRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  price: { fontSize: 28, fontWeight: "800" },

  ratingRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  ratingText: { fontSize: 13, fontWeight: "700" },

  optionsRow: { marginTop: 12, gap: 16 },
  optionCol: {},
  optionLabel: { fontSize: 13, fontWeight: "800", marginBottom: 6 },

  pill: {
    marginRight: 8,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: "flex-start",
  },
  pillText: { fontSize: 12, fontWeight: "700" },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginTop: 18,
    marginBottom: 8,
  },
  description: { fontSize: 15, lineHeight: 22 },

  reviewRow: {
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    elevation: 2,
  },
  reviewUser: { marginLeft: 6, fontSize: 13, fontWeight: "700" },
  reviewText: { fontSize: 14 },

  recCard: {
    width: 150,
    borderRadius: 16,
    padding: 10,
    elevation: 2,
  },
  recImg: { width: "100%", height: 96, borderRadius: 10, marginBottom: 8 },
  recName: { fontSize: 13, fontWeight: "700", minHeight: 34 },
  recPrice: { fontSize: 13, fontWeight: "800" },
  recRating: { flexDirection: "row", alignItems: "center", gap: 4 },
  recRatingText: { fontSize: 12, fontWeight: "700" },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },

  qtyWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 0.6,
  },
  qtyText: { fontSize: 18, fontWeight: "800" },

  secondaryBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  secondaryText: { fontSize: 14, fontWeight: "800" },

  primaryBtn: {
    flex: 1.4,
    borderRadius: 12,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  primaryText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});