// screens/ProductScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback } from "react";
import {
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useCart } from "../context/CartContext";
import { useWishlist } from "../context/WishlistContext";
import useTheme from "../hooks/useTheme";
import { Product } from "../types/Product";

/* ───────────────────────── Dummy products (ejemplo) ───────────────────────── */
const products: Product[] = [
  {
    id: "1",
    name: "Auriculares Inalámbricos Pro",
    price: 199.99,
    image: "https://cdn-icons-png.flaticon.com/512/744/744465.png",
  },
  {
    id: "2",
    name: "Reloj Inteligente Fit 3",
    price: 149.99,
    image: "https://cdn-icons-png.flaticon.com/512/1005/1005739.png",
  },
  {
    id: "3",
    name: "Zapatillas Urban X",
    price: 89.99,
    image: "https://cdn-icons-png.flaticon.com/512/2331/2331970.png",
  },
];

/* ───────────────────────── Item de la lista ───────────────────────── */
type ProductItemProps = {
  item: Product;
  theme: any;
  onAdd: (p: Product) => void;
  onWishlist: (p: Product) => void;
  isFavorite: boolean;
};

const ProductItem = React.memo(
  ({ item, theme, onAdd, onWishlist, isFavorite }: ProductItemProps) => {
    return (
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        {/* Imagen */}
        <Image source={{ uri: item.image }} style={styles.itemImage} />

        {/* Info */}
        <View style={styles.info}>
          <Text style={[styles.name, { color: theme.text }]} numberOfLines={2}>
            {item.name}
          </Text>

          <Text style={[styles.price, { color: theme.textSecondary }]}>
            ${item.price.toFixed(2)}
          </Text>

          {/* Acciones */}
          <View style={styles.actions}>
            {/* Botón carrito */}
            <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.tint }]}
              onPress={() => onAdd(item)}
              activeOpacity={0.9}
            >
              <Ionicons name="cart-outline" size={18} color="#fff" />
              <Text style={styles.buttonText}>Agregar</Text>
            </TouchableOpacity>

            {/* Wishlist */}
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => onWishlist(item)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={isFavorite ? "heart" : "heart-outline"}
                size={24}
                color={isFavorite ? "#ff4d4d" : theme.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }
);

/* ───────────────────────── Pantalla principal ───────────────────────── */
// ✅ OJO: sin “: JSX.Element” para evitar el error "Cannot find namespace 'JSX'"
export default function ProductScreen() {
  const { theme } = useTheme();
  const { addItem } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();

  // ✅ Aquí construimos el CartItem completo (con quantity) para evitar el TS2345
  const handleAddToCart = useCallback(
    (item: Product) => {
      addItem({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: 1,
        image: item.image,
        // Campos extra para que encaje con tu CartContext
        color: (item as any).color ?? undefined,
        size: (item as any).size ?? undefined,
        category: (item as any).category ?? undefined,
      });

      Alert.alert("Carrito", `${item.name} fue añadido 🛒`);
    },
    [addItem]
  );

  const handleToggleWishlist = useCallback(
    (item: Product) => {
      const added = !isInWishlist(item.id);
      toggleWishlist(item);

      Alert.alert(
        "Lista de deseos",
        `${item.name} fue ${added ? "añadido" : "eliminado"} ❤️`
      );
    },
    [toggleWishlist, isInWishlist]
  );

  const renderItem = useCallback(
    ({ item }: { item: Product }) => (
      <ProductItem
        item={item}
        theme={theme}
        onAdd={handleAddToCart}
        onWishlist={handleToggleWishlist}
        isFavorite={isInWishlist(item.id)}
      />
    ),
    [theme, handleAddToCart, handleToggleWishlist, isInWishlist]
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Productos
        </Text>
        <Ionicons name="storefront-outline" size={26} color={theme.tint} />
      </View>

      {/* Lista */}
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

/* ───────────────────────── Estilos ───────────────────────── */
const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 18,
  },

  headerTitle: { fontSize: 22, fontWeight: "800" },

  list: { paddingHorizontal: 16, paddingBottom: 40 },

  card: {
    flexDirection: "row",
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
    elevation: 3,
  },

  itemImage: { width: 80, height: 80, borderRadius: 14 },

  info: { flex: 1, marginLeft: 14 },

  name: { fontSize: 16, fontWeight: "700" },

  price: { fontSize: 15, marginTop: 2 },

  actions: { flexDirection: "row", alignItems: "center", marginTop: 10 },

  button: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },

  buttonText: { color: "#fff", fontSize: 14, marginLeft: 6 },

  iconButton: { marginLeft: 12 },
});