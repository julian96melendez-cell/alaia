// app/product/index.tsx
import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import React, { useMemo, useState } from "react";
import {
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import useTheme from "../../hooks/useTheme";

export default function ProductCatalog(): React.JSX.Element {
  const { colors, isDarkMode } = useTheme();

  // 🔎 Buscador
  const [query, setQuery] = useState("");

  // 📦 Datos mock (luego se conecta a Firebase)
  const PRODUCTS = [
    {
      id: "1",
      name: "Smartwatch Pro Series 8",
      price: "129",
      category: "Tecnología",
      image: "https://i.imgur.com/UYiroysl.jpg",
    },
    {
      id: "2",
      name: "Audífonos Air Max X",
      price: "199",
      category: "Audio",
      image: "https://i.imgur.com/t6nQKFFl.jpg",
    },
    {
      id: "3",
      name: "Zapatillas Urban Runner",
      price: "89",
      category: "Calzado",
      image: "https://i.imgur.com/zJIxWET.jpeg",
    },
    {
      id: "4",
      name: "SkinCare Deluxe Kit",
      price: "59",
      category: "Belleza",
      image: "https://i.imgur.com/3fJ1P48.jpeg",
    },
  ];

  // 🔍 Filtrado inteligente
  const filtered = useMemo(() => {
    if (!query.trim()) return PRODUCTS;
    return PRODUCTS.filter((p) =>
      p.name.toLowerCase().includes(query.toLowerCase())
    );
  }, [query]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Productos</Text>

        <Pressable style={styles.avatarBtn}>
          <Ionicons
            name="person-circle-outline"
            size={38}
            color={colors.primary}
          />
        </Pressable>
      </View>

      {/* SEARCH */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color={colors.textSecondary} />
        <TextInput
          placeholder="Buscar productos..."
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { color: colors.text }]}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {/* LISTA */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 80 }}
      >
        {filtered.map((item, index) => (
          <Animated.View
            key={item.id}
            entering={FadeInUp.delay(150 * index)}
            style={styles.cardWrap}
          >
            <Link
              href={{
                pathname: "/product/[id]",
                params: {
                  id: item.id,
                  name: item.name,
                  price: item.price,
                  image: item.image,
                  category: item.category,
                },
              }}
              asChild
            >
              <Pressable style={[styles.card, { backgroundColor: colors.card }]}>
                {/* Imagen */}
                <Image
                  source={{ uri: item.image }}
                  style={styles.cardImage}
                />

                {/* Info */}
                <View style={styles.cardInfo}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>
                    {item.name}
                  </Text>

                  <Text style={[styles.cardCategory, { color: colors.textSecondary }]}>
                    {item.category}
                  </Text>

                  <Text style={[styles.cardPrice, { color: colors.primary }]}>
                    ${item.price}
                  </Text>
                </View>

                {/* Icono */}
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.textSecondary}
                  style={{ marginLeft: "auto" }}
                />
              </Pressable>
            </Link>
          </Animated.View>
        ))}

        {/* Sin resultados */}
        {filtered.length === 0 && (
          <Animated.Text
            entering={FadeInUp}
            style={[styles.noResults, { color: colors.textSecondary }]}
          >
            No se encontraron productos.
          </Animated.Text>
        )}
      </ScrollView>
    </View>
  );
}

/* ───────── ESTILOS ───────── */
const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 18 },

  header: {
    paddingTop: 16,
    paddingBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  title: { fontSize: 26, fontWeight: "800" },

  avatarBtn: {
    width: 42,
    height: 42,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
  },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E5E7EB44",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 14,
    marginBottom: 20,
  },

  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
  },

  /* CARDS */
  cardWrap: { marginBottom: 16 },

  card: {
    flexDirection: "row",
    padding: 12,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
  },

  cardImage: {
    width: 70,
    height: 70,
    borderRadius: 12,
    marginRight: 12,
  },

  cardInfo: {
    flexDirection: "column",
    gap: 4,
    maxWidth: "60%",
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
  },

  cardCategory: {
    fontSize: 13,
    fontWeight: "500",
  },

  cardPrice: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: "800",
  },

  noResults: {
    marginTop: 20,
    textAlign: "center",
    fontSize: 15,
  },
});