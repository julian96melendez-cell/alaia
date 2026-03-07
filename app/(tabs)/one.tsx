 import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import Colors from "../../constants/Colors";

export default function ExploreScreen() {
  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* 🟦 Encabezado */}
      <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Explorar 🔍</Text>
          <Text style={styles.headerSubtitle}>Encuentra lo que necesitas</Text>
        </View>

        <Pressable style={styles.avatarWrap}>
          <Ionicons
            name="person-circle-outline"
            size={42}
            color={Colors.light.primary}
          />
        </Pressable>
      </Animated.View>

      {/* 🔍 Buscador */}
      <Animated.View entering={FadeInDown.delay(200)} style={styles.searchBox}>
        <Ionicons name="search" size={20} color="#94A3B8" />
        <Text style={styles.searchText}>Buscar productos...</Text>
      </Animated.View>

      {/* 🏷️ Categorías */}
      <Animated.View entering={FadeInDown.delay(300)}>
        <Text style={styles.sectionTitle}>Categorías</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {[
            { title: "Tecnología", icon: "phone-portrait-outline" },
            { title: "Moda", icon: "shirt-outline" },
            { title: "Belleza", icon: "sparkles-outline" },
            { title: "Hogar", icon: "home-outline" },
            { title: "Salud", icon: "fitness-outline" },
          ].map((c, index) => (
            <Animated.View
              key={index}
              entering={FadeInDown.delay(350 + index * 80)}
            >
              <Pressable style={styles.categoryCard}>
                <Ionicons name={c.icon as any} size={26} color={Colors.light.primary} />
                <Text style={styles.categoryText}>{c.title}</Text>
              </Pressable>
            </Animated.View>
          ))}
        </ScrollView>
      </Animated.View>

      {/* ⭐ Productos Destacados */}
      <Animated.View entering={FadeInDown.delay(500)}>
        <Text style={styles.sectionTitle}>Destacados ⭐</Text>

        <View style={styles.grid}>
          {[
            {
              title: "Auriculares Pro",
              price: "$199",
              img: "https://i.imgur.com/t6nQKFFl.jpg",
            },
            {
              title: "Smartwatch Prime",
              price: "$129",
              img: "https://i.imgur.com/UYiroysl.jpg",
            },
          ].map((p, index) => (
            <Animated.View
              key={index}
              entering={FadeInDown.delay(550 + index * 150)}
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

      {/* CTA Final */}
      <Animated.View entering={FadeInDown.delay(800)} style={styles.ctaBox}>
        <Text style={styles.ctaTitle}>Explora miles de productos</Text>
        <Text style={styles.ctaSubtitle}>Ofertas nuevas todos los días</Text>

        <Pressable style={styles.ctaButton}>
          <Text style={styles.ctaButtonText}>Ver más</Text>
        </Pressable>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    paddingHorizontal: 20,
  },

  // HEADER
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 25,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.light.text,
  },
  headerSubtitle: {
    color: Colors.light.textSecondary,
    marginTop: 3,
  },
  avatarWrap: {
    borderRadius: 50,
    overflow: "hidden",
  },

  // SEARCH
  searchBox: {
    marginTop: 20,
    backgroundColor: "#F1F5F9",
    padding: 14,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  searchText: {
    marginLeft: 10,
    color: "#94A3B8",
  },

  // SECTION TITLE
  sectionTitle: {
    marginTop: 30,
    marginBottom: 15,
    fontSize: 20,
    fontWeight: "700",
    color: Colors.light.text,
  },

  // CATEGORIES
  categoryCard: {
    backgroundColor: "#FFF",
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 16,
    marginRight: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  categoryText: {
    marginTop: 8,
    fontWeight: "600",
    color: Colors.light.text,
  },

  // PRODUCT CARDS
  grid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  card: {
    width: 160,
    backgroundColor: "#FFF",
    borderRadius: 18,
    padding: 12,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.08,
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

  // CTA FINAL
  ctaBox: {
    backgroundColor: Colors.light.primary,
    borderRadius: 22,
    padding: 26,
    marginVertical: 35,
  },
  ctaTitle: {
    color: "#FFF",
    fontSize: 22,
    fontWeight: "800",
  },
  ctaSubtitle: {
    color: "#FFF",
    opacity: 0.9,
    marginTop: 4,
  },
  ctaButton: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    paddingVertical: 10,
    marginTop: 16,
    alignItems: "center",
  },
  ctaButtonText: {
    color: Colors.light.primary,
    fontSize: 16,
    fontWeight: "700",
  },
});