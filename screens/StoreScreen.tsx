// screens/StoreScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import useTheme from "../hooks/useTheme";

// Categorías
const CATEGORIES = ["Todos", "Ropa", "Zapatos", "Accesorios"];

// Productos mock (luego se pueden conectar con Firestore)
const PRODUCTS = [
  {
    id: "1",
    name: "Camiseta Premium",
    price: 39.99,
    category: "Ropa",
    image:
      "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&w=600&q=60",
  },
  {
    id: "2",
    name: "Sneakers Urban",
    price: 79.99,
    category: "Zapatos",
    image:
      "https://images.unsplash.com/photo-1606813902779-8b9e3d9ec75b?auto=format&w=600&q=60",
  },
  {
    id: "3",
    name: "Bolso Clásico",
    price: 49.99,
    category: "Accesorios",
    image:
      "https://images.unsplash.com/photo-1600180758890-6a4f1b9e4a6d?auto=format&w=600&q=60",
  },
  {
    id: "4",
    name: "Sudadera Casual",
    price: 59.99,
    category: "Ropa",
    image:
      "https://images.unsplash.com/photo-1581338834647-b9e3f9b8d9a4?auto=format&w=600&q=60",
  },
  {
    id: "5",
    name: "Gorra Estilo Retro",
    price: 24.99,
    category: "Accesorios",
    image:
      "https://images.unsplash.com/photo-1612214070474-1b1f0c8efb9d?auto=format&w=600&q=60",
  },
];

export default function StoreScreen(): React.JSX.Element {
  const { colors } = useTheme();

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todos");

  // Filtrado
  const filteredProducts = useMemo(() => {
    return PRODUCTS.filter(
      (p) =>
        (selectedCategory === "Todos" || p.category === selectedCategory) &&
        p.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [search, selectedCategory]);

  // Navegación hacia la nueva ruta `/product/[id]`
  const goToDetails = useCallback((item: any) => {
    router.push({
      pathname: "/product/[id]",
      params: {
        id: item.id,
        name: item.name,
        price: String(item.price),
        image: item.image,
        category: item.category,
      },
    });
  }, []);

  // Render de cada tarjeta
  const renderProduct = ({ item }: any) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card }]}
      onPress={() => goToDetails(item)}
      activeOpacity={0.9}
    >
      <Image source={{ uri: item.image }} style={styles.image} />

      <View style={styles.cardInfo}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={[styles.price, { color: colors.primary }]}>
          ${item.price.toFixed(2)}
        </Text>
      </View>

      {/* Favorito */}
      <TouchableOpacity style={styles.wishlistIcon} activeOpacity={0.8}>
        <Ionicons name="heart-outline" size={22} color={colors.textSecondary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Tienda 🛍️</Text>
      </View>

      {/* Buscador */}
      <View style={[styles.searchContainer, { backgroundColor: colors.card }]}>
        <Ionicons name="search-outline" size={20} color={colors.textSecondary} />
        <TextInput
          placeholder="Buscar productos..."
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
          style={[styles.searchInput, { color: colors.text }]}
        />
      </View>

      {/* Categorías */}
      <FlatList
        horizontal
        data={CATEGORIES}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(c) => c}
        contentContainerStyle={{ marginVertical: 10 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => setSelectedCategory(item)}
            style={[
              styles.categoryButton,
              {
                backgroundColor:
                  selectedCategory === item ? colors.primary : colors.card,
              },
            ]}
          >
            <Text
              style={{
                color:
                  selectedCategory === item ? colors.background : colors.text,
                fontWeight: "700",
              }}
            >
              {item}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Productos */}
      <FlatList
        data={filteredProducts}
        renderItem={renderProduct}
        numColumns={2}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        columnWrapperStyle={{ justifyContent: "space-between" }}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </View>
  );
}

/* ─────────────── estilos ─────────────── */

const styles = StyleSheet.create({
  container: { flex: 1, padding: 15 },

  header: { marginBottom: 10 },
  title: { fontSize: 26, fontWeight: "900" },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 16 },

  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10,
    elevation: 2,
  },

  card: {
    width: "48%",
    borderRadius: 16,
    marginBottom: 15,
    overflow: "hidden",
    elevation: 3,
    position: "relative",
  },

  image: { width: "100%", height: 150 },

  cardInfo: { padding: 10 },
  name: { fontSize: 15, fontWeight: "700" },
  price: { fontSize: 15, marginTop: 6, fontWeight: "900" },

  wishlistIcon: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(255,255,255,0.8)",
    borderRadius: 20,
    padding: 6,
  },
});