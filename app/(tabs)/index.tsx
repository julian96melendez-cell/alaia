import { Ionicons } from "@expo/vector-icons";
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
import { router } from "expo-router";

/* ──────────────────────────────────────────── */
/*                HOME SCREEN                   */
/* ──────────────────────────────────────────── */

export default function HomeScreen() {
  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 80 }}
    >
      {/* 🟦 ENCABEZADO */}
      <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Hola 👋</Text>
          <Text style={styles.headerSubtitle}>
            ¿Qué te gustaría explorar hoy?
          </Text>
        </View>

        <Pressable
          style={styles.avatarWrap}
          onPress={() => router.push("/profile")}
        >
          <Ionicons
            name="person-circle-outline"
            size={42}
            color={Colors.light.primary}
          />
        </Pressable>
      </Animated.View>

      {/* 🔍 BUSCADOR */}
      <Animated.View entering={FadeInDown.delay(150)} style={styles.searchBox}>
        <Ionicons name="search" size={20} color="#94A3B8" />
        <Text style={styles.searchText}>Buscar productos...</Text>
      </Animated.View>

      {/* 🔥 CATEGORÍAS */}
      <Animated.View entering={FadeInDown.delay(250)}>
        <Text style={styles.sectionTitle}>Categorías</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {categories.map((c, i) => (
            <Animated.View
              entering={FadeInDown.delay(300 + i * 80)}
              key={i}
            >
              <Pressable
                style={styles.categoryCard}
                onPress={() =>
                  router.push({
                    pathname: "/category/[slug]",
                    params: { slug: c.title },
                  })
                }
              >
                <Ionicons
                  name={c.icon as any}
                  size={28}
                  color={Colors.light.primary}
                />
                <Text style={styles.categoryText}>{c.title}</Text>
              </Pressable>
            </Animated.View>
          ))}
        </ScrollView>
      </Animated.View>

      {/* ⭐ PRODUCTOS DESTACADOS */}
      <Animated.View entering={FadeInDown.delay(450)}>
        <Text style={styles.sectionTitle}>Destacados</Text>

        <View style={styles.grid}>
          {products.map((p, i) => (
            <Animated.View
              entering={FadeInDown.delay(500 + i * 120)}
              key={i}
            >
              <Pressable
                style={styles.card}
                onPress={() =>
                  router.push({
                    pathname: "/product/[id]",
                    params: {
                      id: p.id,
                      name: p.title,
                      price: p.price,
                      image: p.img,
                      category: p.category,
                    },
                  })
                }
              >
                <Image source={{ uri: p.img }} style={styles.cardImg} />

                <View style={{ marginTop: 10 }}>
                  <Text style={styles.cardTitle}>{p.title}</Text>
                  <Text style={styles.cardPrice}>${p.price}</Text>
                </View>
              </Pressable>
            </Animated.View>
          ))}
        </View>
      </Animated.View>

      {/* 🔵 CTA FINAL */}
      <Animated.View entering={FadeInDown.delay(900)} style={styles.ctaBox}>
        <Text style={styles.ctaTitle}>Explora miles de productos</Text>
        <Text style={styles.ctaSubtitle}>Nuevas ofertas todos los días</Text>

        <Pressable style={styles.ctaButton}>
          <Text style={styles.ctaButtonText}>Ver más</Text>
        </Pressable>
      </Animated.View>
    </ScrollView>
  );
}

/* ──────────────────────────────────────────── */
/*                    DATA                      */
/* ──────────────────────────────────────────── */

const categories = [
  { title: "Tecnología", icon: "laptop-outline" },
  { title: "Salud", icon: "fitness-outline" },
  { title: "Hogar", icon: "home-outline" },
  { title: "Belleza", icon: "sparkles-outline" },
  { title: "Ropa", icon: "shirt-outline" },
];

const products = [
  {
    id: "1",
    title: "Smartwatch Pro",
    price: "129",
    img: "https://i.imgur.com/UYiroysl.jpg",
    category: "Tecnología",
  },
  {
    id: "2",
    title: "Audífonos Air Max",
    price: "199",
    img: "https://i.imgur.com/t6nQKFFl.jpg",
    category: "Tecnología",
  },
];

/* ──────────────────────────────────────────── */
/*                    STYLES                   */
/* ──────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    paddingHorizontal: 20,
  },

  /* HEADER */
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: Colors.light.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginTop: 4,
  },
  avatarWrap: { borderRadius: 50, overflow: "hidden" },

  /* SEARCH */
  searchBox: {
    marginTop: 20,
    backgroundColor: "#F1F5F9",
    padding: 14,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  searchText: { marginLeft: 10, color: "#94A3B8", fontSize: 15 },

  /* SECTION TITLES */
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginTop: 30,
    marginBottom: 14,
    color: Colors.light.text,
  },

  /* CATEGORY CARDS */
  categoryCard: {
    backgroundColor: "#FFF",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 18,
    marginRight: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 7,
    elevation: 2,
  },
  categoryText: {
    marginTop: 8,
    fontWeight: "600",
    color: Colors.light.text,
  },

  /* PRODUCT GRID */
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
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  cardImg: {
    width: "100%",
    height: 110,
    borderRadius: 12,
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

  /* CTA */
  ctaBox: {
    backgroundColor: Colors.light.primary,
    borderRadius: 22,
    padding: 28,
    marginVertical: 40,
  },
  ctaTitle: { color: "#FFF", fontSize: 22, fontWeight: "800" },
  ctaSubtitle: { color: "#FFF", opacity: 0.9, marginTop: 4 },
  ctaButton: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    paddingVertical: 10,
    marginTop: 18,
    alignItems: "center",
  },
  ctaButtonText: {
    color: Colors.light.primary,
    fontSize: 16,
    fontWeight: "700",
  },
});