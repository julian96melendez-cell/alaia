// app/(tabs)/cart.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import Colors from "../../constants/Colors";
import { useCart } from "../../context/CartContext";
import { useAppNavigation } from "../../navigation/useAppNavigation";

const TAX_PERCENT = 0.07;

export default function CartScreen() {
  const nav = useAppNavigation();
  const router = useRouter();

  const {
    user,
    items,
    loading,
    syncing,
    subtotal,
    shipping,
    discount,
    total,
    updateQuantity,
    removeItem,
    clearCart,
  } = useCart();

  const tax = useMemo(() => subtotal * TAX_PERCENT, [subtotal]);
  const finalTotal = useMemo(() => total + tax, [total, tax]);

  const formatMoney = (value: number) =>
    new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "USD",
    }).format(Number(value || 0));

  const confirmRemove = (id: string, name: string) => {
    Alert.alert("Eliminar producto", `¿Quitar "${name}" del carrito?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: () => removeItem(id),
      },
    ]);
  };

  const confirmClearCart = () => {
    if (!items.length) return;

    Alert.alert("Vaciar carrito", "¿Deseas eliminar todos los productos?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Vaciar",
        style: "destructive",
        onPress: clearCart,
      },
    ]);
  };

  const goCheckout = () => {
    if (!items.length) {
      Alert.alert("Carrito vacío", "Añade productos antes de pagar.");
      return;
    }

    router.push("/checkout" as any);
  };

  if (!user) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="log-in-outline" size={46} color={Colors.light.primary} />

        <Text style={styles.centerTitle}>Inicia sesión para ver tu carrito</Text>

        <Text style={styles.centerSubtitle}>
          Guarda productos, sincroniza entre dispositivos y termina tus compras
          cuando quieras.
        </Text>

        <Pressable
          style={styles.primaryButton}
          onPress={() => nav.replace("/(auth)/login")}
        >
          <Ionicons name="person-outline" size={18} color="#fff" />
          <Text style={styles.primaryButtonText}>Ir al login</Text>
        </Pressable>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
        <Text style={styles.centerSubtitle}>Cargando tu carrito…</Text>
      </View>
    );
  }

  if (!items.length) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.emptyIcon}>
          <Ionicons
            name="cart-outline"
            size={46}
            color={Colors.light.textSecondary}
          />
        </View>

        <Text style={styles.centerTitle}>Tu carrito está vacío</Text>

        <Text style={styles.centerSubtitle}>
          Explora productos y añádelos al carrito para verlos aquí.
        </Text>

        <Pressable
          style={styles.secondaryButton}
          onPress={() => nav.replace(nav.routes.home)}
        >
          <Ionicons name="compass-outline" size={18} color={Colors.light.primary} />
          <Text style={styles.secondaryButtonText}>Explorar productos</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Tu carrito</Text>
          <Text style={styles.headerSubtitle}>
            {items.length} producto(s) listo(s) para comprar
          </Text>
        </View>

        <Pressable style={styles.clearBtn} onPress={confirmClearCart}>
          <Ionicons name="trash-outline" size={20} color="#EF4444" />
        </Pressable>
      </View>

      {syncing ? (
        <View style={styles.syncBanner}>
          <ActivityIndicator size="small" color={Colors.light.primary} />
          <Text style={styles.syncText}>Sincronizando carrito…</Text>
        </View>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) => {
          const image = item.image;

          return (
            <View style={styles.itemCard}>
              {image ? (
                <Image source={{ uri: image }} style={styles.itemImage} />
              ) : (
                <View style={styles.itemPlaceholder}>
                  <Ionicons
                    name="image-outline"
                    size={26}
                    color={Colors.light.textSecondary}
                  />
                </View>
              )}

              <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={2}>
                  {item.name}
                </Text>

                {!!item.category && (
                  <Text style={styles.itemCategory}>{item.category}</Text>
                )}

                <Text style={styles.itemPrice}>{formatMoney(item.price)}</Text>

                <View style={styles.itemBottomRow}>
                  <View style={styles.qtyControl}>
                    <Pressable
                      style={styles.qtyBtn}
                      onPress={() =>
                        updateQuantity(item.id, Math.max(0, item.quantity - 1))
                      }
                    >
                      <Ionicons name="remove-outline" size={18} color="#111827" />
                    </Pressable>

                    <Text style={styles.qtyValue}>{item.quantity}</Text>

                    <Pressable
                      style={styles.qtyBtn}
                      onPress={() => updateQuantity(item.id, item.quantity + 1)}
                    >
                      <Ionicons name="add-outline" size={18} color="#111827" />
                    </Pressable>
                  </View>

                  <Pressable
                    style={styles.removeBtn}
                    onPress={() => confirmRemove(item.id, item.name)}
                  >
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    <Text style={styles.removeText}>Eliminar</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        }}
      />

      <View style={styles.summaryCard}>
        <SummaryRow label="Subtotal" value={formatMoney(subtotal)} />
        <SummaryRow label="Impuestos aprox." value={formatMoney(tax)} />
        <SummaryRow label="Descuento" value={`-${formatMoney(discount)}`} />
        <SummaryRow
          label="Envío"
          value={shipping === 0 ? "Gratis" : formatMoney(shipping)}
        />

        <View style={styles.summaryDivider} />

        <View style={styles.summaryRow}>
          <Text style={styles.summaryTotalLabel}>Total</Text>
          <Text style={styles.summaryTotalValue}>{formatMoney(finalTotal)}</Text>
        </View>

        <Pressable style={styles.checkoutBtn} onPress={goCheckout}>
          <Ionicons name="card-outline" size={18} color="#fff" />
          <Text style={styles.checkoutText}>Ir a pagar</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: Colors.light.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 4,
    fontWeight: "600",
  },
  clearBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
  },
  syncBanner: {
    marginHorizontal: 18,
    marginBottom: 10,
    padding: 10,
    borderRadius: 14,
    backgroundColor: "#EEF2FF",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  syncText: {
    color: Colors.light.primary,
    fontWeight: "800",
    fontSize: 13,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 280,
  },
  itemCard: {
    flexDirection: "row",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  itemImage: {
    width: 88,
    height: 88,
    borderRadius: 14,
    backgroundColor: "#E5E7EB",
  },
  itemPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 14,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  itemInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: "space-between",
  },
  itemName: {
    fontSize: 15,
    fontWeight: "900",
    color: "#111827",
    lineHeight: 20,
  },
  itemCategory: {
    marginTop: 2,
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "700",
  },
  itemPrice: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: "900",
    color: Colors.light.primary,
  },
  itemBottomRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  qtyControl: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E5E7EB",
  },
  qtyValue: {
    minWidth: 28,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "900",
    color: "#111827",
  },
  removeBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  removeText: {
    marginLeft: 4,
    fontSize: 12,
    fontWeight: "800",
    color: "#EF4444",
  },
  summaryCard: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 112,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 18,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 30,
    zIndex: 50,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 3,
  },
  summaryLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "700",
  },
  summaryValue: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "800",
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 8,
  },
  summaryTotalLabel: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
  },
  summaryTotalValue: {
    fontSize: 18,
    fontWeight: "900",
    color: Colors.light.primary,
  },
  checkoutBtn: {
    marginTop: 12,
    backgroundColor: Colors.light.primary,
    borderRadius: 999,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  checkoutText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  centerContainer: {
    flex: 1,
    backgroundColor: Colors.light.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 82,
    height: 82,
    borderRadius: 30,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  centerTitle: {
    marginTop: 14,
    fontSize: 20,
    fontWeight: "900",
    color: Colors.light.text,
    textAlign: "center",
  },
  centerSubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  primaryButton: {
    marginTop: 20,
    backgroundColor: Colors.light.primary,
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#fff",
  },
  secondaryButton: {
    marginTop: 18,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: Colors.light.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "900",
    color: Colors.light.primary,
  },
});