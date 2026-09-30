import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
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

import { useCart } from "../../context/CartContext";
import useTheme from "../../hooks/useTheme";
import {
  getProductById,
  type Product,
} from "../../services/products";

type DetailParams = {
  id?: string;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function isMongoObjectId(value?: string) {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value.trim());
}

export default function ProductDetail() {
  const router = useRouter();
  const { colors, isDarkMode } = useTheme();
  const { addItem } = useCart();
  const params = useLocalSearchParams<DetailParams>();

  const [product, setProduct] = useState<Product | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [adding, setAdding] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(true);
  const [error, setError] = useState("");

  const productId = useMemo(() => {
    return String(params.id || "").trim();
  }, [params.id]);

  useEffect(() => {
    let mounted = true;

    async function loadProduct() {
      try {
        setError("");
        setLoadingProduct(true);

        if (!productId || !isMongoObjectId(productId)) {
          throw new Error("ID de producto inválido.");
        }

        const data = await getProductById(productId);

        if (!mounted) return;

        if (!data) {
          throw new Error("Producto no encontrado.");
        }

        setProduct(data);
      } catch (err: any) {
        console.log("LOAD PRODUCT ERROR:", err);

        if (!mounted) return;

        setProduct(null);
        setError(
          err?.message ||
            "No pudimos cargar este producto."
        );
      } finally {
        if (mounted) {
          setLoadingProduct(false);
        }
      }
    }

    loadProduct();

    return () => {
      mounted = false;
    };
  }, [productId]);

  const stock = Number(product?.stock || 0);

  const hasStock = stock > 0;

  const productImage =
    product?.image ||
    (Array.isArray(product?.images) && product.images.length > 0
      ? product.images[0]
      : null);

  const handleAddToCart = async (goToCart = false) => {
    if (adding || !product) return;

    const finalProductId =
      product.mongoId || product.id;

    if (!isMongoObjectId(finalProductId)) {
      Alert.alert(
        "Producto no sincronizado",
        "Este producto no tiene un ID válido de MongoDB."
      );
      return;
    }

    if (product.price <= 0) {
      Alert.alert(
        "Producto inválido",
        "Este producto no tiene un precio válido."
      );
      return;
    }

    if (!hasStock) {
      Alert.alert(
        "Producto agotado",
        "Este producto no tiene existencias disponibles."
      );
      return;
    }

    try {
      setAdding(true);

      await addItem(
        {
          id: finalProductId,
          name: product.name,
          price: product.price,
          quantity: 1,
          image: productImage,
          category: product.category,
          stock,
          maxQty: stock,
        },
        1
      );

      if (goToCart) {
        router.push("/(tabs)/cart" as any);
        return;
      }

      Alert.alert(
        "Agregado al carrito",
        `"${product.name}" fue agregado.`,
        [
          {
            text: "Seguir comprando",
            style: "cancel",
          },
          {
            text: "Ver carrito",
            onPress: () =>
              router.push("/(tabs)/cart" as any),
          },
        ]
      );
    } catch (err) {
      console.log("ADD TO CART ERROR:", err);

      Alert.alert(
        "Error",
        "No se pudo agregar el producto al carrito."
      );
    } finally {
      setAdding(false);
    }
  };

  if (loadingProduct) {
    return (
      <View
        style={[
          styles.centerState,
          { backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator
          size="large"
          color={colors.primary}
        />

        <Text
          style={[
            styles.stateText,
            { color: colors.textSecondary },
          ]}
        >
          Cargando producto...
        </Text>
      </View>
    );
  }

  if (error || !product) {
    return (
      <View
        style={[
          styles.centerState,
          { backgroundColor: colors.background },
        ]}
      >
        <Ionicons
          name="alert-circle-outline"
          size={48}
          color="#DC2626"
        />

        <Text
          style={[
            styles.errorTitle,
            { color: colors.text },
          ]}
        >
          No pudimos cargar el producto
        </Text>

        <Text
          style={[
            styles.errorText,
            { color: colors.textSecondary },
          ]}
        >
          {error || "Producto no encontrado."}
        </Text>

        <Pressable
          style={[
            styles.retryButton,
            { backgroundColor: colors.primary },
          ]}
          onPress={() => router.back()}
        >
          <Text style={styles.retryButtonText}>
            Volver
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background },
      ]}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.imageWrap}>
          {productImage ? (
            <Image
              source={{ uri: productImage }}
              style={styles.image}
              resizeMode="cover"
            />
          ) : (
            <View
              style={[
                styles.imagePlaceholder,
                {
                  backgroundColor: isDarkMode
                    ? "#020617"
                    : "#E5E7EB",
                },
              ]}
            >
              <Ionicons
                name="cube-outline"
                size={52}
                color={colors.primary}
              />

              <Text
                style={[
                  styles.placeholderText,
                  { color: colors.primary },
                ]}
              >
                ALAIA
              </Text>
            </View>
          )}

          <View
            style={[
              styles.badge,
              {
                backgroundColor: `${colors.primary}22`,
              },
            ]}
          >
            <Ionicons
              name="pricetag-outline"
              size={14}
              color={colors.primary}
            />

            <Text
              style={[
                styles.badgeText,
                { color: colors.primary },
              ]}
            >
              {product.category}
            </Text>
          </View>
        </View>

        <View style={styles.content}>
          <Text
            style={[
              styles.name,
              { color: colors.text },
            ]}
          >
            {product.name}
          </Text>

          <View style={styles.rowBetween}>
            <Text
              style={[
                styles.price,
                { color: colors.primary },
              ]}
            >
              {formatMoney(product.price)}
            </Text>

            <View style={styles.ratingRow}>
              <Ionicons
                name="star"
                size={16}
                color="#FACC15"
              />

              <Text
                style={[
                  styles.ratingText,
                  {
                    color:
                      colors.textSecondary ?? "#64748B",
                  },
                ]}
              >
                {Number(product.rating || 4.7).toFixed(1)}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.stockBox,
              !hasStock && styles.outOfStockBox,
            ]}
          >
            <Ionicons
              name={
                hasStock
                  ? "checkmark-circle-outline"
                  : "close-circle-outline"
              }
              size={18}
              color={hasStock ? "#22C55E" : "#DC2626"}
            />

            <Text
              style={[
                styles.stockText,
                !hasStock && styles.outOfStockText,
              ]}
            >
              {hasStock
                ? `${stock} disponibles`
                : "Producto agotado"}
            </Text>
          </View>

          <Text
            style={[
              styles.description,
              {
                color:
                  colors.textSecondary ?? "#6B7280",
              },
            ]}
          >
            {product.description ||
              "Producto disponible en ALAIA."}
          </Text>

          <View style={styles.actionsRow}>
            <Pressable
              style={[
                styles.iconBtn,
                {
                  borderColor: isDarkMode
                    ? "#1F2937"
                    : "#E5E7EB",
                  backgroundColor: isDarkMode
                    ? "#020617"
                    : "#FFFFFF",
                },
              ]}
              onPress={() =>
                setFavorite((prev) => !prev)
              }
              disabled={adding}
            >
              <Ionicons
                name={
                  favorite
                    ? "heart"
                    : "heart-outline"
                }
                size={21}
                color={
                  favorite
                    ? "#EF4444"
                    : colors.primary
                }
              />
            </Pressable>

            <Pressable
              style={[
                styles.ctaBtn,
                {
                  backgroundColor: colors.primary,
                },
                (adding || !hasStock) &&
                  styles.disabledBtn,
              ]}
              onPress={() =>
                handleAddToCart(false)
              }
              disabled={adding || !hasStock}
            >
              {adding ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons
                    name="cart-outline"
                    size={20}
                    color="#FFFFFF"
                  />

                  <Text style={styles.ctaText}>
                    Agregar al carrito
                  </Text>
                </>
              )}
            </Pressable>
          </View>

          <Pressable
            style={[
              styles.buyNowBtn,
              {
                borderColor: colors.primary,
              },
              (adding || !hasStock) &&
                styles.disabledBtn,
            ]}
            onPress={() =>
              handleAddToCart(true)
            }
            disabled={adding || !hasStock}
          >
            <Text
              style={[
                styles.buyNowText,
                { color: colors.primary },
              ]}
            >
              Comprar ahora
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  scrollContent: {
    paddingBottom: 32,
  },

  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },

  stateText: {
    marginTop: 12,
    fontSize: 15,
  },

  errorTitle: {
    marginTop: 14,
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },

  errorText: {
    marginTop: 8,
    fontSize: 14,
    textAlign: "center",
  },

  retryButton: {
    marginTop: 20,
    paddingHorizontal: 26,
    paddingVertical: 12,
    borderRadius: 14,
  },

  retryButtonText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },

  imageWrap: {
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#E5E7EB",
  },

  image: {
    width: "100%",
    height: 290,
  },

  imagePlaceholder: {
    width: "100%",
    height: 290,
    alignItems: "center",
    justifyContent: "center",
  },

  placeholderText: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1.4,
  },

  badge: {
    position: "absolute",
    left: 12,
    top: 12,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  badgeText: {
    fontSize: 12,
    fontWeight: "900",
  },

  content: {
    paddingHorizontal: 16,
    paddingTop: 18,
  },

  name: {
    fontSize: 23,
    fontWeight: "900",
    lineHeight: 29,
  },

  rowBetween: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  price: {
    fontSize: 24,
    fontWeight: "900",
  },

  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  ratingText: {
    fontSize: 13,
    fontWeight: "800",
  },

  stockBox: {
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  outOfStockBox: {
    backgroundColor: "#FEF2F2",
  },

  stockText: {
    color: "#16A34A",
    fontWeight: "900",
    fontSize: 13,
  },

  outOfStockText: {
    color: "#DC2626",
  },

  description: {
    marginTop: 14,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },

  actionsRow: {
    marginTop: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },

  ctaBtn: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },

  disabledBtn: {
    opacity: 0.55,
  },

  ctaText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },

  buyNowBtn: {
    marginTop: 12,
    height: 48,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },

  buyNowText: {
    fontSize: 15,
    fontWeight: "900",
  },
});