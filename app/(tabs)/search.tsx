import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
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

export default function SearchScreen() {
  const [query, setQuery] = useState("");

  const suggestions = [
    "Smartwatch",
    "Audífonos",
    "Zapatos",
    "Laptop",
    "Perfume",
    "Joyería",
  ];

  const products = [
    {
      title: "Smartwatch Ultra X",
      price: "$149",
      img: "https://i.imgur.com/UYiroysl.jpg",
    },
    {
      title: "Auriculares AirSound",
      price: "$89",
      img: "https://i.imgur.com/t6nQKFFl.jpg",
    },
    {
      title: "Sneakers Runner Pro",
      price: "$119",
      img: "https://i.imgur.com/Ig9oHCM.jpg",
    },
  ];

  const filtered = products.filter((p) =>
    p.title.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: 20 }}
    >
      {/* 🔍 BUSCADOR */}
      <Animated.View entering={FadeInDown} style={styles.searchBox}>
        <Ionicons name="search-outline" size={22} color="#94A3B8" />
        <TextInput
          placeholder="Buscar productos…"
          value={query}
          onChangeText={setQuery}
          style={styles.input}
          placeholderTextColor="#94A3B8"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery("")}>
            <Ionicons name="close-circle" size={22} color="#94A3B8" />
          </Pressable>
        )}
      </Animated.View>

      {/* 📌 SIN TEXTO */}
      {query.length === 0 && (
        <Animated.View entering={FadeInDown.delay(150)}>
          <Text style={styles.subtitle}>Búsquedas populares</Text>

          <View style={styles.tagsWrap}>
            {suggestions.map((s, i) => (
              <Pressable
                key={i}
                style={styles.tag}
                onPress={() => setQuery(s)}
              >
                <Text style={styles.tagText}>{s}</Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      )}

      {/* 📦 RESULTADOS */}
      {query.length > 0 && (
        <Animated.View entering={FadeInDown.delay(250)}>
          <Text style={styles.subtitle}>
            Resultados para: <Text style={{ fontWeight: "700" }}>{query}</Text>
          </Text>

          {filtered.length === 0 && (
            <Text style={styles.emptyText}>No se encontraron resultados.</Text>
          )}

          <View style={styles.grid}>
            {filtered.map((p, i) => (
              <Animated.View
                key={i}
                entering={FadeInDown.delay(300 + i * 120)}
              >
                <Pressable style={styles.card}>
                  <Image source={{ uri: p.img }} style={styles.cardImg} />
                  <Text style={styles.cardTitle}>{p.title}</Text>
                  <Text style={styles.cardPrice}>{p.price}</Text>
                </Pressable>
              </Animated.View>
            ))}
          </View>
        </Animated.View>
      )}
    </ScrollView>
  );
}

// 🎨 ESTILOS PROFESIONALES
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },

  // Search bar
  searchBox: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 20,
  },
  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    color: Colors.light.text,
  },

  subtitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.light.text,
    marginBottom: 12,
  },

  // TAGS
  tagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tag: {
    backgroundColor: "#F1F5F9",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  tagText: {
    color: "#475569",
    fontSize: 14,
    fontWeight: "600",
  },

  // Productos
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  card: {
    width: "48%",
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 12,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardImg: {
    width: "100%",
    height: 110,
    borderRadius: 12,
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.light.text,
  },
  cardPrice: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.light.primary,
    marginTop: 4,
  },

  emptyText: {
    fontSize: 15,
    color: "#94A3B8",
    marginTop: 10,
  },
});