// screens/CartScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  ListRenderItem,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";

import { CartItem, useCart } from "../context/CartContext";
import useTheme from "../hooks/useTheme";

// ——————————————————————————————
// Productos recomendados ― dummy
// ——————————————————————————————
type RecommendedItem = {
  id: string;
  name: string;
  price: number;
  image: string;
};

const RECOMMENDED: RecommendedItem[] = [
  {
    id: "p1",
    name: "Camiseta Premium",
    price: 29.99,
    image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800",
  },
  {
    id: "p2",
    name: "Auriculares Pro X",
    price: 89.99,
    image: "https://images.unsplash.com/photo-1580894908361-967195033215?w=800",
  },
  {
    id: "p3",
    name: "Lámpara Minimalista",
    price: 49.99,
    image: "https://images.unsplash.com/photo-1606813902911-8a9fdd9af099?w=800",
  },
];

// ——————————————————————————————
// Pantalla principal
// ——————————————————————————————
export default function CartScreen() {
  const navigation = useNavigation<any>();
  const { colors, isDarkMode } = useTheme();

  const {
    items,
    loading,
    subtotal,
    discount,
    shipping,
    total,
    coupon,
    updateQuantity,
    removeItem,
    clearCart,
    addItem,
    applyCoupon,
    removeCoupon,
  } = useCart();

  const [code, setCode] = useState<string>("");

  const hasItems = items.length > 0;

  // ——— Animación resumen inferior ———
  const summaryTranslate = useRef(new Animated.Value(40)).current;
  const summaryOpacity = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (hasItems) {
      Animated.parallel([
        Animated.spring(summaryTranslate, {
          toValue: 0,
          useNativeDriver: true,
          friction: 7,
        }),
        Animated.timing(summaryOpacity, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      summaryTranslate.setValue(40);
      summaryOpacity.setValue(0);
    }
  }, [hasItems]);

  // ——— Swipe para eliminar ———
  const renderRightActions = useCallback(
    (progress: Animated.AnimatedInterpolation<number>, id: string) => {
      const scale = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0.8, 1],
        extrapolate: "clamp",
      });

      return (
        <Animated.View style={[styles.swipeDelete, { transform: [{ scale }] }]}>
          <TouchableOpacity
            onPress={() => removeItem(id)}
            style={styles.swipeDeleteBtn}
            activeOpacity={0.9}
          >
            <Ionicons name="trash-outline" size={22} color="#fff" />
            <Text style={styles.swipeDeleteText}>Eliminar</Text>
          </TouchableOpacity>
        </Animated.View>
      );
    },
    [removeItem]
  );

  // ——— Filas del resumen ———
  const summaryRows = useMemo(
    () => [
      { label: "Subtotal", value: `$${subtotal.toFixed(2)}`, accent: false },
      {
        label: "Descuento",
        value: discount <= 0 ? "-$0.00" : `-$${discount.toFixed(2)}`,
        accent: discount > 0,
        color: "#10B981",
      },
      {
        label: "Envío",
        value: shipping === 0 ? "Gratis" : `$${shipping.toFixed(2)}`,
        accent: false,
      },
    ],
    [subtotal, discount, shipping]
  );

  // ——— Aplicar cupón ———
  const onApplyCoupon = useCallback(async () => {
    const normalized = code.trim();
    if (!normalized) return;

    const res = await applyCoupon(normalized);
    Alert.alert(res.ok ? "Cupón aplicado" : "Error", res.message);

    if (res.ok) setCode("");
  }, [code, applyCoupon]);

  // ——— Vaciar carrito ———
  const handleClearCart = () => {
    Alert.alert(
      "Vaciar carrito",
      "¿Quieres eliminar todos los productos?",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Vaciar", style: "destructive", onPress: clearCart },
      ]
    );
  };

  // ——— Ir al checkout ———
  const goToCheckout = () => navigation.navigate("Checkout");

  const itemCount = useMemo(
    () =>
      items.reduce((acc, it) => acc + (it.quantity ?? 0), 0),
    [items]
  );

  // ——————————————————————————————
  // Estados: Cargando / Vacío
  // ——————————————————————————————
  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={{ color: colors.text, marginTop: 10 }}>
          Cargando tu carrito…
        </Text>
      </View>
    );
  }

  if (!hasItems) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="bag-outline" size={64} color={colors.primary} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>
          Tu carrito está vacío
        </Text>
        <Text
          style={[
            styles.emptySub,
            { color: colors.textSecondary },
          ]}
        >
          Descubre productos y añade tus favoritos.
        </Text>

        <TouchableOpacity
          activeOpacity={0.9}
          style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
          onPress={() => navigation.navigate("Home")}
        >
          <Ionicons name="compass-outline" size={18} color="#fff" />
          <Text style={styles.emptyBtnText}>Explorar productos</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ——————————————————————————————
  // Render item
  // ——————————————————————————————
  const renderItem: ListRenderItem<CartItem> = ({ item }) => {
    const scale = useRef(new Animated.Value(1)).current;

    return (
      <Swipeable
        overshootRight={false}
        renderRightActions={(progress) =>
          renderRightActions(progress as any, item.id)
        }
      >
        <Animated.View style={{ transform: [{ scale }] }}>
          <TouchableOpacity
            activeOpacity={0.93}
            onPressIn={() =>
              Animated.spring(scale, {
                toValue: 0.97,
                useNativeDriver: true,
              }).start()
            }
            onPressOut={() =>
              Animated.spring(scale, {
                toValue: 1,
                useNativeDriver: true,
                friction: 4,
              }).start()
            }
            style={[
              styles.row,
              { backgroundColor: colors.card, shadowColor: "#000" },
            ]}
          >
            <Image source={{ uri: item.image }} style={styles.thumbnail} />

            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
                {item.name}
              </Text>

              <Text style={[styles.price, { color: colors.primary }]}>
                ${item.price.toFixed(2)}
              </Text>

              <View style={styles.qtyRow}>
                <TouchableOpacity
                  onPress={() =>
                    updateQuantity(item.id, Math.max(1, (item.quantity ?? 0) - 1))
                  }
                  disabled={(item.quantity ?? 0) <= 1}
                >
                  <Ionicons
                    name="remove-circle-outline"
                    size={26}
                    color={(item.quantity ?? 0) <= 1 ? "#9CA3AF" : colors.primary}
                  />
                </TouchableOpacity>

                <Text style={[styles.qtyText, { color: colors.text }]}>
                  {item.quantity}
                </Text>

                <TouchableOpacity
                  onPress={() => updateQuantity(item.id, (item.quantity ?? 0) + 1)}
                >
                  <Ionicons name="add-circle-outline" size={26} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity onPress={() => removeItem(item.id)} style={styles.removeBtn}>
              <Ionicons name="trash-outline" size={22} color="#EF4444" />
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      </Swipeable>
    );
  };

  // ——————————————————————————————
  // Render principal
  // ——————————————————————————————
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList<CartItem>
        data={items}
        keyExtractor={(it) => it.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 220 }}
        ListHeaderComponent={
          <>
            {/* Header */}
            <View style={styles.headerRow}>
              <View>
                <Text style={[styles.title, { color: colors.text }]}>Tu carrito</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  {itemCount} producto{itemCount === 1 ? "" : "s"}
                </Text>
              </View>

              <TouchableOpacity onPress={handleClearCart}>
                <Ionicons name="trash-outline" size={22} color="#EF4444" />
              </TouchableOpacity>
            </View>

            {/* Cupón */}
            <View style={[styles.couponRow, { backgroundColor: colors.card }]}>
              <Ionicons name="pricetag-outline" size={18} color={colors.primary} />

              <TextInput
                style={[styles.couponInput, { color: colors.text }]}
                placeholder="Código de cupón"
                placeholderTextColor={colors.textSecondary}
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
                returnKeyType="done"
                onSubmitEditing={onApplyCoupon}
              />

              <TouchableOpacity
                onPress={coupon ? removeCoupon : onApplyCoupon}
                style={[styles.couponBtn, { backgroundColor: colors.text }]}
              >
                <Text style={styles.couponBtnText}>
                  {coupon ? "Quitar" : "Aplicar"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Recomendados */}
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Recomendados para ti
            </Text>

            <FlatList<RecommendedItem>
              horizontal
              data={RECOMMENDED}
              keyExtractor={(it) => it.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 6 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.recCard, { backgroundColor: colors.card }]}
                  activeOpacity={0.9}
                  onPress={() =>
                    addItem({
                      id: item.id,
                      name: item.name,
                      price: item.price,
                      quantity: 1,
                      image: item.image,
                    })
                  }
                >
                  <Image source={{ uri: item.image }} style={styles.recImage} />

                  <Text style={[styles.recName, { color: colors.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>

                  <Text style={[styles.recPrice, { color: colors.primary }]}>
                    ${item.price.toFixed(2)}
                  </Text>

                  <View style={[styles.recAdd, { backgroundColor: colors.primary }]}>
                    <Ionicons name="cart-outline" size={16} color="#fff" />
                    <Text style={styles.recAddText}>Agregar</Text>
                  </View>
                </TouchableOpacity>
              )}
            />

            <Text style={[styles.sectionTitle, { color: colors.text }]}>Tus productos</Text>
          </>
        }
      />

      {/* Resumen fijo animado */}
      <Animated.View
        style={[
          styles.summary,
          {
            backgroundColor: colors.card,
            transform: [{ translateY: summaryTranslate }],
            opacity: summaryOpacity,
          },
        ]}
      >
        {summaryRows.map((row, idx) => (
          <View style={styles.rowBetween} key={idx}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              {row.label}
            </Text>

            <Text
              style={[
                styles.value,
                {
                  color: row.accent ? row.color || colors.primary : colors.text,
                },
              ]}
            >
              {row.value}
            </Text>
          </View>
        ))}

        <View
          style={[
            styles.divider,
            { backgroundColor: isDarkMode ? "#334155" : "#E5E7EB" },
          ]}
        />

        <View style={styles.rowBetween}>
          <Text style={[styles.totalLabel, { color: colors.text }]}>Total</Text>
          <Text style={[styles.totalValue, { color: colors.text }]}>
            ${total.toFixed(2)}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          activeOpacity={0.9}
          onPress={goToCheckout}
        >
          <Ionicons name="card-outline" size={18} color="#fff" />
          <Text style={styles.primaryText}>Ir al checkout</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

/* ——————————————————————
   Estilos
——————————————————————— */
const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  title: { fontSize: 24, fontWeight: "800" },
  subtitle: { fontSize: 13, fontWeight: "600" },

  // Fila producto
  row: {
    flexDirection: "row",
    borderRadius: 16,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    alignItems: "center",
    elevation: 2,
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  thumbnail: { width: 76, height: 76, borderRadius: 12, marginRight: 12 },
  name: { fontSize: 15, fontWeight: "600" },
  price: { fontSize: 15, fontWeight: "700", marginTop: 2 },

  qtyRow: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 12 },
  qtyText: { fontSize: 16, fontWeight: "700" },
  removeBtn: { paddingLeft: 8, paddingVertical: 8 },

  // Swipe
  swipeDelete: {
    width: 88,
    marginRight: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  swipeDeleteBtn: {
    width: "100%",
    backgroundColor: "#EF4444",
    borderRadius: 14,
    paddingVertical: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  swipeDeleteText: {
    color: "#fff",
    fontWeight: "700",
    marginTop: 4,
    fontSize: 12,
  },

  // Cupón
  couponRow: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 14,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    elevation: 2,
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  couponInput: { flex: 1, fontSize: 14 },
  couponBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  couponBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  // Recomendados
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 10,
  },
  recCard: {
    width: 150,
    borderRadius: 16,
    padding: 10,
    marginLeft: 16,
    elevation: 2,
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  recImage: { width: "100%", height: 96, borderRadius: 10, marginBottom: 8 },
  recName: { fontSize: 13, fontWeight: "600" },
  recPrice: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
    marginBottom: 8,
  },
  recAdd: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingVertical: 8,
  },
  recAddText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  // Resumen
  summary: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    elevation: 12,
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 4,
  },
  divider: { height: 1, marginVertical: 8, opacity: 0.6 },

  label: { fontSize: 14 },
  value: { fontSize: 14, fontWeight: "700" },
  totalLabel: { fontSize: 16, fontWeight: "800" },
  totalValue: { fontSize: 18, fontWeight: "800" },

  primaryBtn: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 14,
  },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "800" },

  // Vacío
  emptyTitle: { marginTop: 10, fontSize: 20, fontWeight: "800" },
  emptySub: {
    marginTop: 4,
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  emptyBtn: {
    marginTop: 16,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 18,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});