import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import Colors from "../../constants/Colors";
import { HOME_FEATURED_PRODUCTS } from "../../services/cards";

export default function CategoryScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug?: string }>();

  const categorySlug = String(slug || "");
  const title = categorySlug
    ? categorySlug.charAt(0).toUpperCase() + categorySlug.slice(1)
    : "Categoría";

  const products = HOME_FEATURED_PRODUCTS.filter(
    (product) => product.categorySlug === categorySlug
  );

  const openProduct = (product: (typeof HOME_FEATURED_PRODUCTS)[number]) => {
    router.push({
      pathname: "/product/[id]",
      params: {
        id: product.id,
        name: product.title,
        price: String(product.price),
        image: product.image,
        category: product.categorySlug,
      },
    } as any);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>
            {products.length} producto(s) disponibles
          </Text>
        </View>

        <View style={styles.iconBox}>
          <Ionicons name="grid-outline" size={22} color="#fff" />
        </View>
      </View>

      {products.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="cube-outline" size={44} color="#94A3B8" />
          <Text style={styles.emptyTitle}>Sin productos</Text>
          <Text style={styles.emptyText}>
            Todavía no hay productos disponibles en esta categoría.
          </Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {products.map((product) => (
            <Pressable
              key={product.id}
              style={({ pressed }) => [
                styles.card,
                pressed && styles.pressed,
              ]}
              onPress={() => openProduct(product)}
            >
              <Image source={{ uri: product.image }} style={styles.cardImg} />

              <Text style={styles.cardTitle} numberOfLines={2}>
                {product.title}
              </Text>

              <View style={styles.cardBottom}>
                <Text style={styles.cardPrice}>
                  ${Number(product.price || 0).toFixed(2)}
                </Text>

                <Ionicons
                  name="chevron-forward-circle"
                  size={20}
                  color={Colors.light.primary}
                />
              </View>
            </Pressable>
          ))}
        </View>
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.99 }],
  },
  hero: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    marginBottom: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: Colors.light.text,
  },
  subtitle: {
    marginTop: 4,
    color: Colors.light.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: Colors.light.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    justifyContent: "space-between",
  },
  card: {
    width: "47%",
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 10,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  cardImg: {
    width: "100%",
    height: 128,
    borderRadius: 14,
    backgroundColor: "#E5E7EB",
  },
  cardTitle: {
    marginTop: 9,
    minHeight: 38,
    fontWeight: "900",
    color: Colors.light.text,
    fontSize: 14,
    lineHeight: 19,
  },
  cardBottom: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardPrice: {
    fontWeight: "900",
    color: Colors.light.primary,
    fontSize: 15,
  },
  empty: {
    marginTop: 80,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: "900",
    color: Colors.light.text,
  },
  emptyText: {
    marginTop: 6,
    textAlign: "center",
    color: Colors.light.textSecondary,
    lineHeight: 20,
    fontWeight: "600",
  },
});