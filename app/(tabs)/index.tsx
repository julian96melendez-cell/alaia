import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import Colors from "../../constants/Colors";
import {
  getAllProducts,
  type Product,
} from "../../services/products";

/* ──────────────────────────────────────────── */
/*                HOME SCREEN                   */
/* ──────────────────────────────────────────── */

export default function HomeScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  /* ──────────────────────────────────────────── */
  /*            CARGAR PRODUCTOS MONGO             */
  /* ──────────────────────────────────────────── */

  const loadProducts = useCallback(async () => {
    try {
      setError("");
      setLoading(true);

      const data = await getAllProducts(true);

      console.log("✅ PRODUCTOS MONGO:", data);

      setProducts(data);
    } catch (err: any) {
      console.log("❌ ERROR PRODUCTOS:", err);

      setError(
        err?.message ||
          "No pudimos cargar los productos en este momento."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProducts();
    }, [loadProducts])
  );

  /* ──────────────────────────────────────────── */
  /*                 CATEGORÍAS                   */
  /* ──────────────────────────────────────────── */

  const categories = useMemo(() => {
    const values = products
      .map((product) => product.category?.trim())
      .filter((value): value is string => Boolean(value));

    return Array.from(new Set(values));
  }, [products]);

  /* ──────────────────────────────────────────── */
  /*             FILTRAR PRODUCTOS                */
  /* ──────────────────────────────────────────── */

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesSearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query) ||
        product.description?.toLowerCase().includes(query);

      const matchesCategory =
        !selectedCategory ||
        product.category.toLowerCase() === selectedCategory.toLowerCase();

      return matchesSearch && matchesCategory;
    });
  }, [products, search, selectedCategory]);

  /* ──────────────────────────────────────────── */
  /*              ABRIR PRODUCTO                  */
  /* ──────────────────────────────────────────── */

  const openProduct = (product: Product) => {
    router.push({
      pathname: "/product/[id]",
      params: {
        id: product.mongoId || product.id,
      },
    });
  };

  const clearFilters = () => {
    setSearch("");
    setSelectedCategory(null);
  };

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 100 }}
    >
      {/* ENCABEZADO */}

      <Animated.View
        entering={FadeInDown.duration(400)}
        style={styles.header}
      >
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>Explorar 🔎</Text>

          <Text style={styles.headerSubtitle}>
            Encuentra lo que necesitas
          </Text>
        </View>

        <Pressable
          style={styles.avatarWrap}
          onPress={() => router.push("/profile" as any)}
        >
          <Ionicons
            name="person-circle-outline"
            size={46}
            color={Colors.light.primary}
          />
        </Pressable>
      </Animated.View>

      {/* BUSCADOR REAL */}

      <Animated.View
        entering={FadeInDown.delay(150)}
        style={styles.searchBox}
      >
        <Ionicons
          name="search-outline"
          size={24}
          color="#94A3B8"
        />

        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar productos..."
          placeholderTextColor="#94A3B8"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />

        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")}>
            <Ionicons
              name="close-circle"
              size={22}
              color="#94A3B8"
            />
          </Pressable>
        )}
      </Animated.View>

      {/* CATEGORÍAS */}

      <Animated.View entering={FadeInDown.delay(250)}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Categorías</Text>

          {selectedCategory && (
            <Pressable onPress={() => setSelectedCategory(null)}>
              <Text style={styles.clearText}>Ver todas</Text>
            </Pressable>
          )}
        </View>

        {loading ? (
          <View style={styles.categoriesLoading}>
            <ActivityIndicator
              size="small"
              color={Colors.light.primary}
            />
          </View>
        ) : categories.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoriesContent}
          >
            {categories.map((category, index) => {
              const selected =
                selectedCategory?.toLowerCase() ===
                category.toLowerCase();

              return (
                <Animated.View
                  entering={FadeInDown.delay(300 + index * 60)}
                  key={category}
                >
                  <Pressable
                    style={[
                      styles.categoryCard,
                      selected && styles.categoryCardSelected,
                    ]}
                    onPress={() =>
                      setSelectedCategory(
                        selected ? null : category
                      )
                    }
                  >
                    <Ionicons
                      name={getCategoryIcon(category)}
                      size={28}
                      color={
                        selected
                          ? "#FFFFFF"
                          : Colors.light.primary
                      }
                    />

                    <Text
                      style={[
                        styles.categoryText,
                        selected &&
                          styles.categoryTextSelected,
                      ]}
                    >
                      {category}
                    </Text>
                  </Pressable>
                </Animated.View>
              );
            })}
          </ScrollView>
        ) : (
          <Text style={styles.emptyCategoryText}>
            Todavía no hay categorías disponibles.
          </Text>
        )}
      </Animated.View>

      {/* PRODUCTOS */}

      <Animated.View entering={FadeInDown.delay(450)}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {selectedCategory
              ? selectedCategory
              : search
                ? "Resultados"
                : "Productos"}
          </Text>

          {!loading && (
            <Text style={styles.resultCount}>
              {filteredProducts.length}
            </Text>
          )}
        </View>

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator
              size="large"
              color={Colors.light.primary}
            />

            <Text style={styles.stateText}>
              Cargando productos...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <Ionicons
              name="cloud-offline-outline"
              size={42}
              color="#DC2626"
            />

            <Text style={styles.errorTitle}>
              No pudimos cargar los productos
            </Text>

            <Text style={styles.errorText}>{error}</Text>

            <Pressable
              style={styles.retryButton}
              onPress={loadProducts}
            >
              <Text style={styles.retryButtonText}>
                Reintentar
              </Text>
            </Pressable>
          </View>
        ) : filteredProducts.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons
              name="search-outline"
              size={46}
              color="#94A3B8"
            />

            <Text style={styles.emptyTitle}>
              No encontramos productos
            </Text>

            <Text style={styles.emptyText}>
              Prueba otra búsqueda o elimina los filtros.
            </Text>

            <Pressable
              style={styles.clearButton}
              onPress={clearFilters}
            >
              <Text style={styles.clearButtonText}>
                Mostrar todos
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.grid}>
            {filteredProducts.map((product, index) => (
              <Animated.View
                entering={FadeInDown.delay(
                  Math.min(500 + index * 80, 1000)
                )}
                key={product.id}
                style={styles.gridItem}
              >
                <Pressable
                  style={styles.card}
                  onPress={() => openProduct(product)}
                >
                  {product.image ? (
                    <Image
                      source={{ uri: product.image }}
                      style={styles.cardImg}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <Ionicons
                        name="cube-outline"
                        size={42}
                        color={Colors.light.primary}
                      />

                      <Text style={styles.placeholderText}>
                        ALAIA
                      </Text>
                    </View>
                  )}

                  <View style={styles.cardContent}>
                    <Text
                      style={styles.cardTitle}
                      numberOfLines={2}
                    >
                      {product.name}
                    </Text>

                    <Text style={styles.cardCategory}>
                      {product.category}
                    </Text>

                    <View style={styles.priceRow}>
                      <Text style={styles.cardPrice}>
                        ${product.price.toFixed(2)}
                      </Text>

                      {typeof product.stock === "number" && (
                        <Text
                          style={[
                            styles.stockText,
                            product.stock <= 0 &&
                              styles.outOfStockText,
                          ]}
                        >
                          {product.stock > 0
                            ? `${product.stock} disponibles`
                            : "Agotado"}
                        </Text>
                      )}
                    </View>
                  </View>
                </Pressable>
              </Animated.View>
            ))}
          </View>
        )}
      </Animated.View>

      {/* CTA */}

      {!loading && products.length > 0 && (
        <Animated.View
          entering={FadeInDown.delay(800)}
          style={styles.ctaBox}
        >
          <Text style={styles.ctaTitle}>
            Explora todos nuestros productos
          </Text>

          <Text style={styles.ctaSubtitle}>
            Productos reales disponibles en ALAIA
          </Text>

          <Pressable
            style={styles.ctaButton}
            onPress={clearFilters}
          >
            <Text style={styles.ctaButtonText}>
              Ver todos
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </ScrollView>
  );
}

/* ──────────────────────────────────────────── */
/*              CATEGORY ICONS                  */
/* ──────────────────────────────────────────── */

function getCategoryIcon(category: string): any {
  const value = category.toLowerCase();

  if (
    value.includes("tecn") ||
    value.includes("electr")
  ) {
    return "phone-portrait-outline";
  }

  if (
    value.includes("moda") ||
    value.includes("ropa")
  ) {
    return "shirt-outline";
  }

  if (
    value.includes("belleza") ||
    value.includes("cosm")
  ) {
    return "sparkles-outline";
  }

  if (
    value.includes("hogar") ||
    value.includes("casa")
  ) {
    return "home-outline";
  }

  if (
    value.includes("salud") ||
    value.includes("fitness")
  ) {
    return "fitness-outline";
  }

  if (value.includes("prueba")) {
    return "flask-outline";
  }

  return "cube-outline";
}

/* ──────────────────────────────────────────── */
/*                    STYLES                    */
/* ──────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    paddingHorizontal: 20,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
  },

  headerTextWrap: {
    flex: 1,
  },

  headerTitle: {
    fontSize: 30,
    fontWeight: "800",
    color: Colors.light.text,
  },

  headerSubtitle: {
    fontSize: 16,
    color: Colors.light.textSecondary,
    marginTop: 4,
  },

  avatarWrap: {
    borderRadius: 50,
    overflow: "hidden",
  },

  searchBox: {
    marginTop: 24,
    backgroundColor: "#F1F5F9",
    minHeight: 58,
    paddingHorizontal: 16,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
  },

  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    color: Colors.light.text,
    paddingVertical: 14,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    marginTop: 30,
    marginBottom: 14,
    color: Colors.light.text,
  },

  clearText: {
    marginTop: 18,
    color: Colors.light.primary,
    fontWeight: "700",
  },

  resultCount: {
    marginTop: 18,
    color: Colors.light.textSecondary,
    fontWeight: "700",
  },

  categoriesContent: {
    paddingRight: 20,
    paddingBottom: 4,
  },

  categoriesLoading: {
    height: 100,
    justifyContent: "center",
  },

  categoryCard: {
    minWidth: 125,
    minHeight: 105,
    backgroundColor: "#FFFFFF",
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 20,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 7,
    elevation: 2,
  },

  categoryCardSelected: {
    backgroundColor: Colors.light.primary,
  },

  categoryText: {
    marginTop: 9,
    fontWeight: "700",
    color: Colors.light.text,
    textAlign: "center",
  },

  categoryTextSelected: {
    color: "#FFFFFF",
  },

  emptyCategoryText: {
    color: Colors.light.textSecondary,
    marginBottom: 10,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },

  gridItem: {
    width: "48%",
  },

  card: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 12,
    marginBottom: 18,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },

  cardImg: {
    width: "100%",
    height: 145,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
  },

  imagePlaceholder: {
    width: "100%",
    height: 145,
    borderRadius: 14,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },

  placeholderText: {
    marginTop: 7,
    color: Colors.light.primary,
    fontWeight: "800",
    letterSpacing: 1,
  },

  cardContent: {
    paddingTop: 10,
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.light.text,
    minHeight: 40,
  },

  cardCategory: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 4,
  },

  priceRow: {
    marginTop: 8,
  },

  cardPrice: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.light.primary,
  },

  stockText: {
    fontSize: 11,
    color: "#16A34A",
    fontWeight: "600",
    marginTop: 3,
  },

  outOfStockText: {
    color: "#DC2626",
  },

  centerState: {
    paddingVertical: 50,
    alignItems: "center",
  },

  stateText: {
    marginTop: 12,
    color: Colors.light.textSecondary,
  },

  errorBox: {
    paddingVertical: 40,
    alignItems: "center",
    paddingHorizontal: 20,
  },

  errorTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.light.text,
    marginTop: 12,
    textAlign: "center",
  },

  errorText: {
    marginTop: 8,
    color: Colors.light.textSecondary,
    textAlign: "center",
  },

  retryButton: {
    marginTop: 18,
    backgroundColor: Colors.light.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
  },

  retryButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },

  emptyBox: {
    paddingVertical: 40,
    alignItems: "center",
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.light.text,
    marginTop: 12,
  },

  emptyText: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: "center",
    marginTop: 6,
  },

  clearButton: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: Colors.light.primary,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 14,
  },

  clearButtonText: {
    color: Colors.light.primary,
    fontWeight: "700",
  },

  ctaBox: {
    backgroundColor: Colors.light.primary,
    borderRadius: 24,
    padding: 28,
    marginVertical: 32,
  },

  ctaTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
  },

  ctaSubtitle: {
    color: "#FFFFFF",
    opacity: 0.9,
    marginTop: 6,
    fontSize: 15,
  },

  ctaButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 12,
    marginTop: 20,
    alignItems: "center",
  },

  ctaButtonText: {
    color: Colors.light.primary,
    fontSize: 16,
    fontWeight: "800",
  },
});