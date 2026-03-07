// app/(tabs)/cart.tsx
// Carrito avanzado conectado a Firebase (Firestore)
// - Escucha en tiempo real los cambios del carrito del usuario
// - Permite sumar/restar unidades
// - Elimina productos
// - Calcula subtotal, impuestos y total
// - Muestra estados (cargando, vacío, sin sesión)

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Colors from "../../constants/Colors";

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../../firebase/firebaseConfig";

type CartItem = {
  id: string;
  name: string;
  price: number;
  imageUrl?: string;
  quantity: number;
};

// Puedes ajustar el % de impuestos aquí si quieres
const TAX_PERCENT = 0.07;

export default function CartScreen() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // 🔐 Escuchamos cambios de autenticación (usuario logueado / no logueado)
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      if (user?.uid) {
        setUserId(user.uid);
      } else {
        setUserId(null);
        setItems([]);
      }
    });

    return () => unsub();
  }, []);

  // 🔥 Escucha en tiempo real del carrito en Firestore
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const cartRef = collection(db, "users", userId, "cart");
    const q = query(cartRef);

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const data: CartItem[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data() as any;

          return {
            id: docSnap.id,
            name: d.name ?? "Producto sin nombre",
            price: typeof d.price === "number" ? d.price : 0,
            imageUrl: d.imageUrl,
            quantity: typeof d.quantity === "number" ? d.quantity : 1,
          };
        });

        setItems(data);
        setLoading(false);
      },
      (error) => {
        console.error("Error escuchando carrito:", error);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [userId]);

  // 🧮 Cálculos derivados
  const subtotal = useMemo(
    () =>
      items.reduce(
        (acc, item) => acc + item.price * item.quantity,
        0
      ),
    [items]
  );

  const tax = useMemo(
    () => subtotal * TAX_PERCENT,
    [subtotal]
  );

  const total = useMemo(
    () => subtotal + tax,
    [subtotal, tax]
  );

  // 🔁 Actualizar cantidad (+ / -)
  const changeQuantity = useCallback(
    async (item: CartItem, delta: number) => {
      if (!userId) return;

      const newQty = item.quantity + delta;
      const ref = doc(db, "users", userId, "cart", item.id);

      try {
        setUpdatingId(item.id);

        if (newQty <= 0) {
          // Eliminar si llega a 0 o menos
          await deleteDoc(ref);
        } else {
          await updateDoc(ref, { quantity: newQty });
        }
      } catch (e) {
        console.error("Error cambiando cantidad:", e);
      } finally {
        setUpdatingId(null);
      }
    },
    [userId]
  );

  // 🗑 Eliminar producto
  const removeItem = useCallback(
    async (item: CartItem) => {
      if (!userId) return;
      const ref = doc(db, "users", userId, "cart", item.id);

      try {
        setUpdatingId(item.id);
        await deleteDoc(ref);
      } catch (e) {
        console.error("Error eliminando producto:", e);
      } finally {
        setUpdatingId(null);
      }
    },
    [userId]
  );

  // 🧪 (Opcional) Añadir producto de ejemplo para probar
  const addMockProduct = useCallback(async () => {
    if (!userId) return;

    const mockRef = doc(
      collection(db, "users", userId, "cart")
    );

    const mockItem = {
      name: "Alaïa Wireless Headphones",
      price: 129.99,
      imageUrl:
        "https://via.placeholder.com/200x200.png?text=Alaia",
      quantity: 1,
    };

    try {
      await setDoc(mockRef, mockItem);
    } catch (e) {
      console.error("Error añadiendo producto de prueba:", e);
    }
  }, [userId]);

  // 🧾 Format helper
  const formatMoney = (value: number) =>
    new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
    }).format(value);

  // ⛔ Si el usuario NO está logueado
  if (!userId) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons
          name="log-in-outline"
          size={42}
          color={Colors.light.primary ?? "#6366F1"}
        />
        <Text style={styles.centerTitle}>
          Inicia sesión para ver tu carrito
        </Text>
        <Text style={styles.centerSubtitle}>
          Guarda productos, sincroniza entre dispositivos y termina tus compras
          cuando quieras.
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          activeOpacity={0.9}
          onPress={() => router.push("/(auth)/login")}
        >
          <Ionicons
            name="person-outline"
            size={18}
            color="#FFF"
            style={{ marginRight: 6 }}
          />
          <Text style={styles.primaryButtonText}>
            Ir al login
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ⏳ Estado cargando
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator
          size="large"
          color={Colors.light.primary ?? "#6366F1"}
        />
        <Text style={styles.centerSubtitle}>
          Cargando tu carrito…
        </Text>
      </View>
    );
  }

  // 🧺 Carrito vacío
  if (!items.length) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons
          name="cart-outline"
          size={42}
          color={Colors.light.textSecondary}
        />
        <Text style={styles.centerTitle}>
          Tu carrito está vacío
        </Text>
        <Text style={styles.centerSubtitle}>
          Explora productos y añádelos al carrito para verlos aquí.
        </Text>

        <TouchableOpacity
          style={styles.secondaryButton}
          activeOpacity={0.9}
          onPress={() => router.push("/(tabs)/one")}
        >
          <Ionicons
            name="compass-outline"
            size={18}
            color={Colors.light.primary ?? "#6366F1"}
            style={{ marginRight: 6 }}
          />
          <Text style={styles.secondaryButtonText}>
            Explorar productos
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryButton, { marginTop: 10 }]}
          activeOpacity={0.9}
          onPress={addMockProduct}
        >
          <Ionicons
            name="add-outline"
            size={18}
            color={Colors.light.primary ?? "#6366F1"}
            style={{ marginRight: 6 }}
          />
          <Text style={styles.secondaryButtonText}>
            Añadir producto de prueba
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 🧩 Render de cada producto
  const renderItem = ({ item }: { item: CartItem }) => {
    const isUpdating = updatingId === item.id;

    return (
      <View style={styles.itemCard}>
        {item.imageUrl ? (
          <Image
            source={{ uri: item.imageUrl }}
            style={styles.itemImage}
          />
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
          <Text
            style={styles.itemName}
            numberOfLines={2}
          >
            {item.name}
          </Text>
          <Text style={styles.itemPrice}>
            {formatMoney(item.price)}
          </Text>

          <View style={styles.itemBottomRow}>
            {/* Controles cantidad */}
            <View style={styles.qtyControl}>
              <TouchableOpacity
                style={styles.qtyBtn}
                activeOpacity={0.8}
                onPress={() => changeQuantity(item, -1)}
                disabled={isUpdating}
              >
                <Ionicons
                  name="remove-outline"
                  size={18}
                  color="#111827"
                />
              </TouchableOpacity>

              <Text style={styles.qtyValue}>
                {item.quantity}
              </Text>

              <TouchableOpacity
                style={styles.qtyBtn}
                activeOpacity={0.8}
                onPress={() => changeQuantity(item, 1)}
                disabled={isUpdating}
              >
                <Ionicons
                  name="add-outline"
                  size={18}
                  color="#111827"
                />
              </TouchableOpacity>
            </View>

            {/* Botón eliminar */}
            <TouchableOpacity
              style={styles.removeBtn}
              activeOpacity={0.8}
              onPress={() => removeItem(item)}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <>
                  <Ionicons
                    name="trash-outline"
                    size={16}
                    color="#EF4444"
                  />
                  <Text style={styles.removeText}>
                    Eliminar
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      {/* Header simple */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tu carrito</Text>
        <Text style={styles.headerSubtitle}>
          Revisa tus productos antes de finalizar la compra
        </Text>
      </View>

      {/* Lista de productos */}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        showsVerticalScrollIndicator={false}
      />

      {/* Resumen y CTA */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>
            Subtotal
          </Text>
          <Text style={styles.summaryValue}>
            {formatMoney(subtotal)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>
            Impuestos aprox.
          </Text>
          <Text style={styles.summaryValue}>
            {formatMoney(tax)}
          </Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryTotalLabel}>
            Total
          </Text>
          <Text style={styles.summaryTotalValue}>
            {formatMoney(total)}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.checkoutBtn}
          activeOpacity={0.9}
          onPress={() => {
            // Aquí luego conectamos con tu flujo de pago real
            console.log("Ir a checkout…");
          }}
        >
          <Ionicons
            name="card-outline"
            size={18}
            color="#FFF"
            style={{ marginRight: 6 }}
          />
          <Text style={styles.checkoutText}>
            Ir a pagar
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ───────────────────────────────── STYLES ───────────────────────────────── */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: Colors.light.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 140,
  },

  itemCard: {
    flexDirection: "row",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    padding: 10,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  itemImage: {
    width: 82,
    height: 82,
    borderRadius: 12,
    backgroundColor: "#E5E7EB",
  },
  itemPlaceholder: {
    width: 82,
    height: 82,
    borderRadius: 12,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  itemInfo: {
    flex: 1,
    marginLeft: 10,
    justifyContent: "space-between",
  },
  itemName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  itemPrice: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "600",
    color: "#4B5563",
  },
  itemBottomRow: {
    marginTop: 6,
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
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E5E7EB",
  },
  qtyValue: {
    minWidth: 24,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
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
    fontWeight: "600",
    color: "#EF4444",
  },

  summaryCard: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 18,
    backgroundColor: "#F9FAFB",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 2,
  },
  summaryLabel: {
    fontSize: 13,
    color: "#6B7280",
  },
  summaryValue: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "600",
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 6,
  },
  summaryTotalLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  summaryTotalValue: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
  },
  checkoutBtn: {
    marginTop: 10,
    backgroundColor: Colors.light.primary ?? "#6366F1",
    borderRadius: 999,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  checkoutText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },

  centerContainer: {
    flex: 1,
    backgroundColor: Colors.light.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  centerTitle: {
    marginTop: 14,
    fontSize: 20,
    fontWeight: "800",
    color: Colors.light.text,
    textAlign: "center",
  },
  centerSubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: "center",
  },
  primaryButton: {
    marginTop: 20,
    backgroundColor: Colors.light.primary ?? "#6366F1",
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFF",
  },
  secondaryButton: {
    marginTop: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.light.primary ?? "#6366F1",
    paddingVertical: 9,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.light.primary ?? "#6366F1",
  },
});