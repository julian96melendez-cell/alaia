import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import Colors from "../../constants/Colors";
import { useCart } from "../../context/CartContext";
import { useAppNavigation } from "../../navigation/useAppNavigation";
import { getAllProducts, type Product } from "../../services/products";

type WishlistProduct = Product & {
  oldPrice?: number;
  reviews?: number;
  tag?: "Nuevo" | "Top" | "Limitado";
};

function isMongoObjectId(value?: unknown) {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value.trim());
}

function getCartProductId(product: WishlistProduct) {
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

function getTagStyle(tag?: WishlistProduct["tag"]) {
  switch (tag) {
    case "Nuevo":
      return { backgroundColor: "#DBEAFE" };
    case "Top":
      return { backgroundColor: "#FEF3C7" };
    case "Limitado":
      return { backgroundColor: "#FEE2E2" };
    default:
      return { backgroundColor: "#E5E7EB" };
  }
}

function normalizeWishlistProduct(product: Product, index: number): WishlistProduct {
  return {
    ...product,
    tag: index === 0 ? "Top" : index === 1 ? "Nuevo" : undefined,
    reviews: Number((product as any).reviews || 0),
    rating: Number(product.rating || 4.6),
    stock: Number(product.stock || 10),
  };
}

export default function WishlistScreen() {
  const nav = useAppNavigation();
  const { addItem } = useCart();

  const [items, setItems] = useState<WishlistProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const loadWishlistProducts = useCallback(async () => {
    try {
      setLoading(true);

      const products = await getAllProducts(true);

      const validProducts = products
        .filter((product) => getCartProductId(product as WishlistProduct))
        .map(normalizeWishlistProduct);

      setItems(validProducts);
    } catch (error: any) {
      console.log("WISHLIST LOAD ERROR:", error);
      Alert.alert(
        "Error",
        error?.message || "No se pudieron cargar tus favoritos."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWishlistProducts();
  }, [loadWishlistProducts]);

  const total = useMemo(
    () => items.reduce((acc, item) => acc + Number(item.price || 0), 0),
    [items]
  );

  const savings = useMemo(
    () =>
      items.reduce((acc, item) => {
        if (!item.oldPrice) return acc;
        return acc + (item.oldPrice - item.price);
      }, 0),
    [items]
  );

  const removeItem = (id: string) => {
    Alert.alert("Eliminar favorito", "¿Deseas quitar este producto?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: () => setItems((prev) => prev.filter((item) => item.id !== id)),
      },
    ]);
  };

  const moveToCart = async (item: WishlistProduct) => {
    try {
      const productId = getCartProductId(item);

      if (!productId) {
        Alert.alert(
          "Producto no sincronizado",
          `"${item.name}" no tiene un ObjectId válido de Mongo.`
        );
        return;
      }

      await addItem(
        {
          id: productId,
          name: item.name,
          price: Number(item.price || 0),
          quantity: 1,
          image: item.image || item.images?.[0] || null,
          category: item.category,
          stock: Number(item.stock || 10),
          maxQty: Number(item.stock || 10),
        },
        1
      );

      setItems((prev) => prev.filter((x) => x.id !== item.id));

      Alert.alert("Agregado al carrito", `"${item.name}" fue agregado.`);
    } catch (error) {
      console.log("MOVE TO CART ERROR:", error);
      Alert.alert("Error", "No se pudo mover el producto al carrito.");
    }
  };

  const clearWishlist = () => {
    if (!items.length) return;

    Alert.alert("Vaciar favoritos", "¿Deseas eliminar todos tus favoritos?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Vaciar",
        style: "destructive",
        onPress: () => setItems([]),
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={Colors.light.primary} />
        <Text style={styles.loadingText}>Cargando favoritos…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View entering={FadeInDown.duration(350)} style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Favoritos</Text>
          <Text style={styles.subtitle}>
            Productos sincronizados desde Mongo/admin.
          </Text>
        </View>

        <View style={styles.badgeCircle}>
          <Ionicons name="heart" size={23} color="#F97384" />
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(100)} style={styles.summaryCard}>
        <View>
          <Text style={styles.summaryLabel}>Resumen</Text>
          <Text style={styles.summaryValue}>{items.length} artículos</Text>
          <Text style={styles.summaryHint}>
            Total estimado{" "}
            <Text style={styles.summaryStrong}>${total.toFixed(2)}</Text>
          </Text>
          {savings > 0 && (
            <Text style={styles.savings}>Ahorras ${savings.toFixed(2)}</Text>
          )}
        </View>

        <View style={styles.summaryActions}>
          <Pressable
            style={styles.summaryBtn}
            onPress={() => nav.push("/(tabs)/cart")}
          >
            <Ionicons name="cart-outline" size={17} color="#fff" />
            <Text style={styles.summaryBtnText}>Carrito</Text>
          </Pressable>

          <Pressable
            style={[styles.summaryBtn, styles.clearBtn]}
            onPress={clearWishlist}
            disabled={!items.length}
          >
            <Ionicons name="trash-outline" size={17} color="#fff" />
          </Pressable>
        </View>
      </Animated.View>

      {items.length === 0 ? (
        <Animated.View entering={FadeInDown.delay(150)} style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <Ionicons name="heart-dislike-outline" size={42} color="#94A3B8" />
          </View>

          <Text style={styles.emptyTitle}>No hay favoritos válidos</Text>
          <Text style={styles.emptyText}>
            Crea productos desde el panel admin o revisa que tengan mongoId válido.
          </Text>

          <Pressable
            style={styles.exploreBtn}
            onPress={() => nav.replace(nav.routes.home)}
          >
            <Ionicons name="sparkles-outline" size={17} color="#fff" />
            <Text style={styles.exploreText}>Explorar productos</Text>
          </Pressable>
        </Animated.View>
      ) : (
        <View style={styles.list}>
          {items.map((item, index) => (
            <Animated.View
              key={item.id}
              entering={FadeInDown.delay(180 + index * 80)}
              style={styles.card}
            >
              <Pressable
                style={styles.imageWrap}
                onPress={() => nav.push(nav.routes.product(item.id))}
              >
                {item.image || item.images?.[0] ? (
                  <Image
                    source={{ uri: item.image || item.images?.[0] }}
                    style={styles.image}
                  />
                ) : (
                  <View style={styles.imageFallback}>
                    <Ionicons name="image-outline" size={30} color="#94A3B8" />
                  </View>
                )}

                {item.tag && (
                  <View style={[styles.tag, getTagStyle(item.tag)]}>
                    <Text style={styles.tagText}>{item.tag}</Text>
                  </View>
                )}
              </Pressable>

              <View style={styles.cardBody}>
                <Pressable onPress={() => nav.push(nav.routes.product(item.id))}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {item.name}
                  </Text>
                </Pressable>

                <View style={styles.infoRow}>
                  <View style={styles.categoryRow}>
                    <Ionicons
                      name="apps-outline"
                      size={14}
                      color={Colors.light.textSecondary}
                    />
                    <Text style={styles.categoryText}>{item.category}</Text>
                  </View>

                  <View style={styles.ratingRow}>
                    <Ionicons name="star" size={14} color="#FACC15" />
                    <Text style={styles.ratingText}>
                      {Number(item.rating || 4.6).toFixed(1)}
                    </Text>
                  </View>
                </View>

                <View style={styles.priceRow}>
                  <Text style={styles.price}>
                    ${Number(item.price || 0).toFixed(2)}
                  </Text>
                  {item.oldPrice && (
                    <Text style={styles.oldPrice}>
                      ${item.oldPrice.toFixed(2)}
                    </Text>
                  )}
                </View>

                <View style={styles.stockRow}>
                  <Ionicons
                    name={
                      Number(item.stock || 0) <= 3
                        ? "alert-circle-outline"
                        : "checkmark-circle-outline"
                    }
                    size={14}
                    color={Number(item.stock || 0) <= 3 ? "#F59E0B" : "#22C55E"}
                  />
                  <Text
                    style={[
                      styles.stockText,
                      {
                        color:
                          Number(item.stock || 0) <= 3 ? "#F59E0B" : "#22C55E",
                      },
                    ]}
                  >
                    {Number(item.stock || 0) <= 3
                      ? `Solo quedan ${Number(item.stock || 0)}`
                      : "Disponible"}
                  </Text>
                </View>

                <View style={styles.actionsRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => moveToCart(item)}
                  >
                    <Ionicons name="cart-outline" size={16} color="#fff" />
                    <Text style={styles.primaryBtnText}>Mover al carrito</Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
                    onPress={() => removeItem(item.id)}
                  >
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  </Pressable>
                </View>
              </View>
            </Animated.View>
          ))}
        </View>
      )}

      <View style={{ height: 28 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    backgroundColor: Colors.light.background,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 10,
    color: Colors.light.textSecondary,
    fontWeight: "800",
  },
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 10,
  },
  pressed: {
    opacity: 0.65,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: "900",
    color: Colors.light.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    lineHeight: 18,
    fontWeight: "600",
  },
  badgeCircle: {
    width: 48,
    height: 48,
    borderRadius: 999,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderRadius: 20,
    padding: 16,
    backgroundColor: "#0F172A",
    marginTop: 8,
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    color: "#E5E7EB",
    opacity: 0.8,
    letterSpacing: 0.6,
    fontWeight: "800",
  },
  summaryValue: {
    fontSize: 19,
    fontWeight: "900",
    color: "#FFFFFF",
    marginTop: 4,
  },
  summaryHint: {
    fontSize: 12,
    color: "#CBD5E1",
    marginTop: 2,
  },
  summaryStrong: {
    fontWeight: "900",
    color: "#fff",
  },
  savings: {
    marginTop: 4,
    color: "#22C55E",
    fontWeight: "900",
    fontSize: 12,
  },
  summaryActions: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 8,
  },
  summaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.light.primary,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
  },
  clearBtn: {
    backgroundColor: "#EF4444",
    width: 42,
    justifyContent: "center",
  },
  summaryBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 12,
  },
  list: {
    marginTop: 4,
  },
  card: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    marginTop: 16,
    padding: 10,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  imageWrap: {
    width: 100,
    height: 110,
    borderRadius: 16,
    overflow: "hidden",
    marginRight: 12,
    backgroundColor: "#E5E7EB",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imageFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E5E7EB",
  },
  tag: {
    position: "absolute",
    top: 7,
    left: 7,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  tagText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#111827",
    textTransform: "uppercase",
  },
  cardBody: {
    flex: 1,
    justifyContent: "space-between",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: Colors.light.text,
    lineHeight: 19,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "center",
    marginTop: 6,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  categoryText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontWeight: "600",
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ratingText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontWeight: "700",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  price: {
    fontSize: 17,
    fontWeight: "900",
    color: Colors.light.primary,
  },
  oldPrice: {
    fontSize: 13,
    color: "#9CA3AF",
    textDecorationLine: "line-through",
    fontWeight: "700",
  },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 5,
  },
  stockText: {
    fontSize: 12,
    fontWeight: "800",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    gap: 8,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: Colors.light.primary,
    borderRadius: 999,
    paddingVertical: 9,
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#FECACA",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF2F2",
  },
  emptyWrap: {
    marginTop: 52,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  emptyIcon: {
    width: 78,
    height: 78,
    borderRadius: 28,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: "900",
    marginTop: 12,
    color: Colors.light.text,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    textAlign: "center",
    marginTop: 5,
    lineHeight: 19,
  },
  exploreBtn: {
    marginTop: 16,
    flexDirection: "row",
    gap: 7,
    backgroundColor: Colors.light.primary,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 14,
    alignItems: "center",
  },
  exploreText: {
    color: "#fff",
    fontWeight: "900",
  },
});