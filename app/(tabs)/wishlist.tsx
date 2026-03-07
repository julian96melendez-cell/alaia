import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
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

type WishlistItem = {
  id: string;
  title: string;
  category: string;
  price: number;
  oldPrice?: number;
  rating: number;
  reviews: number;
  image: string;
  tag?: "Nuevo" | "Top" | "Limitado";
};

const INITIAL_ITEMS: WishlistItem[] = [
  {
    id: "1",
    title: "Smartwatch ALAIA Chronos",
    category: "Tecnología",
    price: 149,
    oldPrice: 199,
    rating: 4.7,
    reviews: 128,
    image: "https://images.pexels.com/photos/2773941/pexels-photo-2773941.jpeg",
    tag: "Top",
  },
  {
    id: "2",
    title: "Auriculares ALAIA AirSound",
    category: "Audio",
    price: 119,
    rating: 4.5,
    reviews: 82,
    image: "https://images.pexels.com/photos/374870/pexels-photo-374870.jpeg",
    tag: "Nuevo",
  },
  {
    id: "3",
    title: "Zapatillas Urban Flow",
    category: "Moda",
    price: 89,
    oldPrice: 120,
    rating: 4.3,
    reviews: 56,
    image: "https://images.pexels.com/photos/1598505/pexels-photo-1598505.jpeg",
    tag: "Limitado",
  },
];

export default function WishlistScreen() {
  const [items, setItems] = useState<WishlistItem[]>(INITIAL_ITEMS);

  const total = useMemo(
    () => items.reduce((acc, item) => acc + item.price, 0),
    [items]
  );

  const handleRemove = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleMoveToCart = (item: WishlistItem) => {
    // 🔜 Aquí en el futuro se integrará con el carrito real (Firestore / Context)
    Alert.alert("Carrito", `"${item.title}" se agregará al carrito en próximas versiones.`);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* HEADER */}
      <Animated.View entering={FadeInDown.duration(350)} style={styles.header}>
        <View>
          <Text style={styles.title}>Tus favoritos 💜</Text>
          <Text style={styles.subtitle}>
            Guarda aquí los productos que más te inspiran para decidir luego.
          </Text>
        </View>

        <View style={styles.badgeCircle}>
          <Ionicons name="heart" size={22} color="#F97384" />
        </View>
      </Animated.View>

      {/* RESUMEN */}
      <Animated.View
        entering={FadeInDown.delay(120).duration(350)}
        style={styles.summaryCard}
      >
        <View style={styles.summaryLeft}>
          <Text style={styles.summaryLabel}>Resumen</Text>
          <Text style={styles.summaryValue}>{items.length} artículos</Text>
          <Text style={styles.summaryHint}>
            Total estimado{" "}
            <Text style={styles.summaryHighlight}>${total.toFixed(2)}</Text>
          </Text>
        </View>
        <View style={styles.summaryRight}>
          <Ionicons name="sparkles-outline" size={22} color="#FFFFFF" />
          <Text style={styles.summaryRightText}>Próximas{"\n"}ofertas aquí</Text>
        </View>
      </Animated.View>

      {/* LISTA DE FAVORITOS */}
      <View style={{ marginTop: 10 }}>
        {items.map((item, index) => (
          <Animated.View
            key={item.id}
            entering={FadeInDown.delay(200 + index * 80).duration(350)}
            style={styles.card}
          >
            <View style={styles.imageWrap}>
              <Image source={{ uri: item.image }} style={styles.image} />
              {item.tag && (
                <View style={[styles.tag, getTagStyle(item.tag)]}>
                  <Text style={styles.tagText}>{item.tag}</Text>
                </View>
              )}
            </View>

            <View style={styles.cardBody}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <View style={styles.rowBetween}>
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
                    {item.rating.toFixed(1)} · {item.reviews}
                  </Text>
                </View>
              </View>

              <View style={styles.priceRow}>
                <Text style={styles.price}>${item.price.toFixed(2)}</Text>
                {item.oldPrice && (
                  <Text style={styles.oldPrice}>${item.oldPrice.toFixed(2)}</Text>
                )}
              </View>

              <View style={styles.actionsRow}>
                <Pressable
                  style={styles.primaryBtn}
                  onPress={() => handleMoveToCart(item)}
                >
                  <Ionicons name="cart-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.primaryBtnText}>Mover al carrito</Text>
                </Pressable>

                <Pressable
                  style={styles.iconBtn}
                  onPress={() => handleRemove(item.id)}
                >
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </Pressable>
              </View>
            </View>
          </Animated.View>
        ))}

        {items.length === 0 && (
          <Animated.View
            entering={FadeInDown.delay(200).duration(350)}
            style={styles.emptyWrap}
          >
            <Ionicons
              name="heart-dislike-outline"
              size={42}
              color={Colors.light.textSecondary}
            />
            <Text style={styles.emptyTitle}>Aún no tienes favoritos</Text>
            <Text style={styles.emptyText}>
              Explora el inicio y toca el icono de corazón para guardar productos
              aquí.
            </Text>
          </Animated.View>
        )}
      </View>

      <View style={{ height: 28 }} />
    </ScrollView>
  );
}

/* Utilidad para estilos de tags */
function getTagStyle(tag?: WishlistItem["tag"]) {
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 10,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: Colors.light.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    lineHeight: 18,
  },
  badgeCircle: {
    width: 46,
    height: 46,
    borderRadius: 999,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
  },

  summaryCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderRadius: 18,
    padding: 14,
    backgroundColor: "#0F172A",
    marginTop: 10,
  },
  summaryLeft: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    color: "#E5E7EB",
    opacity: 0.8,
    letterSpacing: 0.6,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
    marginTop: 4,
  },
  summaryHint: {
    fontSize: 12,
    color: "#E5E7EB",
    marginTop: 2,
  },
  summaryHighlight: {
    fontWeight: "800",
  },
  summaryRight: {
    width: 90,
    borderRadius: 14,
    backgroundColor: "#1D293B",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 4,
  },
  summaryRightText: {
    fontSize: 11,
    color: "#E5E7EB",
    textAlign: "center",
    lineHeight: 14,
  },

  card: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    marginTop: 16,
    padding: 10,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  imageWrap: {
    width: 96,
    height: 96,
    borderRadius: 16,
    overflow: "hidden",
    marginRight: 10,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  tag: {
    position: "absolute",
    top: 6,
    left: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  tagText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#111827",
    textTransform: "uppercase",
  },

  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.light.text,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  categoryText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ratingText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },

  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  price: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.light.primary,
  },
  oldPrice: {
    fontSize: 13,
    color: "#9CA3AF",
    textDecorationLine: "line-through",
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
    paddingVertical: 8,
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#FECACA",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF2F2",
  },

  emptyWrap: {
    marginTop: 40,
    alignItems: "center",
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginTop: 10,
    color: Colors.light.text,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    textAlign: "center",
    marginTop: 4,
  },
});