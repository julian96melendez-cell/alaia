// app/(tabs)/home.tsx  (o la ruta donde tengas tu Home)
// Home "premium" para ALAIA

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import Colors from "../../constants/Colors";

const MOCK_STATS = [
  { label: "Órdenes", value: "12" },
  { label: "Favoritos", value: "34" },
  { label: "En oferta", value: "8" },
];

const CATEGORIES = [
  {
    id: "fashion",
    label: "Moda",
    iconLib: "ionicons" as const,
    iconName: "shirt-outline" as const,
  },
  {
    id: "shoes",
    label: "Calzado",
    iconLib: "mci" as const,
    iconName: "shoe-sneaker" as const,
  },
  {
    id: "accessories",
    label: "Accesorios",
    iconLib: "ionicons" as const,
    iconName: "watch-outline" as const,
  },
  {
    id: "beauty",
    label: "Belleza",
    iconLib: "ionicons" as const,
    iconName: "sparkles-outline" as const,
  },
];

const FEATURED_PRODUCTS = [
  {
    id: "p1",
    name: "Sneakers NeoWave",
    badge: "Nuevo",
    price: "$129",
    oldPrice: "$179",
    discount: "-28%",
    tag: "Edición limitada",
  },
  {
    id: "p2",
    name: "Chaqueta FutureGlow",
    badge: "Top Ventas",
    price: "$89",
    oldPrice: "$119",
    discount: "-25%",
    tag: "Colección urbana",
  },
];

export default function HomeScreen() {
  const primary = Colors.light.primary ?? "#6366F1";
  const bg = Colors.light.background ?? "#F9FAFB";
  const text = Colors.light.text ?? "#0F172A";
  const textSecondary = Colors.light.textSecondary ?? "#6B7280";

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { backgroundColor: bg }]}
      showsVerticalScrollIndicator={false}
    >
      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: textSecondary }]}>
            Hola, bienvenido a
          </Text>
          <Text style={[styles.appName, { color: text }]}>ALAIA</Text>
        </View>

        <View style={styles.headerRight}>
          <View style={[styles.badgePill, { backgroundColor: primary + "15" }]}>
            <Ionicons name="sparkles-outline" size={16} color={primary} />
            <Text style={[styles.badgeText, { color: primary }]}>Premium</Text>
          </View>
        </View>
      </View>

      {/* BANNER PRINCIPAL */}
      <View style={[styles.heroCard, { backgroundColor: primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>Nueva temporada</Text>
          <Text style={styles.heroSubtitle}>
            Explora colecciones futuristas con descuentos exclusivos solo en
            ALAIA.
          </Text>

          <View style={styles.heroTagsRow}>
            <View style={styles.heroTag}>
              <Ionicons name="flash-outline" size={14} color="#FBBF24" />
              <Text style={styles.heroTagText}>Hasta -50%</Text>
            </View>
            <View style={styles.heroTag}>
              <Ionicons name="shield-checkmark-outline" size={14} color="#22C55E" />
              <Text style={styles.heroTagText}>Pagos seguros</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.heroButton} activeOpacity={0.85}>
            <Text style={styles.heroButtonText}>Descubrir ahora</Text>
            <Ionicons name="arrow-forward" size={18} color="#0F172A" />
          </TouchableOpacity>
        </View>

        {/* Placeholder gráfico / logo */}
        <View style={styles.heroImageWrap}>
          <View style={styles.heroCircleOuter}>
            <View style={styles.heroCircleInner}>
              <Text style={styles.heroLogoText}>A</Text>
            </View>
          </View>
        </View>
      </View>

      {/* STATS */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: text }]}>
          Tu actividad rápida
        </Text>
        <View style={styles.statsRow}>
          {MOCK_STATS.map((s) => (
            <View key={s.label} style={styles.statCard}>
              <Text style={[styles.statValue, { color: text }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: textSecondary }]}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* CATEGORÍAS */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: text }]}>Categorías</Text>
          <TouchableOpacity activeOpacity={0.7}>
            <Text style={[styles.linkText, { color: primary }]}>Ver todas</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesRow}
        >
          {CATEGORIES.map((cat) => {
            const IconComp =
              cat.iconLib === "ionicons" ? Ionicons : MaterialCommunityIcons;

            return (
              <TouchableOpacity
                key={cat.id}
                style={styles.categoryCard}
                activeOpacity={0.85}
              >
                <View
                  style={[
                    styles.categoryIconWrap,
                    { backgroundColor: primary + "12" },
                  ]}
                >
                  <IconComp name={cat.iconName as any} size={26} color={primary} />
                </View>
                <Text style={[styles.categoryLabel, { color: text }]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* PRODUCTOS DESTACADOS */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: text }]}>
            Destacados para ti
          </Text>
          <TouchableOpacity activeOpacity={0.7}>
            <Text style={[styles.linkText, { color: primary }]}>Ver más</Text>
          </TouchableOpacity>
        </View>

        {FEATURED_PRODUCTS.map((p) => (
          <View key={p.id} style={styles.productCard}>
            <View style={styles.productLeft}>
              <View style={styles.productImagePlaceholder}>
                <Ionicons name="image-outline" size={26} color={primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.productTitleRow}>
                  <Text
                    style={[styles.productName, { color: text }]}
                    numberOfLines={1}
                  >
                    {p.name}
                  </Text>
                  <View style={styles.productBadge}>
                    <Text style={styles.productBadgeText}>{p.badge}</Text>
                  </View>
                </View>
                <Text
                  style={[styles.productTag, { color: textSecondary }]}
                  numberOfLines={1}
                >
                  {p.tag}
                </Text>

                <View style={styles.priceRow}>
                  <Text style={styles.price}>{p.price}</Text>
                  <Text style={styles.oldPrice}>{p.oldPrice}</Text>
                  <Text style={styles.discount}>{p.discount}</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity style={styles.addButton} activeOpacity={0.85}>
              <Ionicons name="add" size={18} color="#0F172A" />
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {/* SECCIÓN INFERIOR */}
      <View style={styles.section}>
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={22} color={primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoTitle, { color: text }]}>
              Experiencia en evolución
            </Text>
            <Text style={[styles.infoText, { color: textSecondary }]}>
              ALAIA está diseñada para convertirse en una de las apps más
              completas del mercado: carrito inteligente, recomendaciones,
              notificaciones avanzadas y mucho más.
            </Text>
          </View>
        </View>
      </View>

      <View style={{ height: 28 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
  },

  /* HEADER */
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  greeting: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  appName: {
    fontSize: 26,
    fontWeight: "900",
  },
  headerRight: {
    alignItems: "flex-end",
  },
  badgePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },

  /* HERO */
  heroCard: {
    borderRadius: 22,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 22,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 13,
    color: "#111827",
    opacity: 0.85,
    marginBottom: 10,
  },
  heroTagsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  heroTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.12)",
  },
  heroTagText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#F9FAFB",
  },
  heroButton: {
    alignSelf: "flex-start",
    marginTop: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#FBBF24",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  heroButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  heroImageWrap: {
    width: 96,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCircleOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: "rgba(15,23,42,0.18)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.12)",
  },
  heroCircleInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
  },
  heroLogoText: {
    fontSize: 24,
    fontWeight: "900",
    color: "#FBBF24",
  },

  /* SECCIONES */
  section: {
    marginBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  linkText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  /* STATS */
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
  },

  /* CATEGORÍAS */
  categoriesRow: {
    paddingVertical: 4,
    paddingRight: 6,
    gap: 10,
  },
  categoryCard: {
    width: 96,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  categoryIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  categoryLabel: {
    fontSize: 13,
    fontWeight: "600",
  },

  /* PRODUCTOS */
  productCard: {
    borderRadius: 18,
    padding: 12,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  productLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  productImagePlaceholder: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: "rgba(148,163,184,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  productTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  productName: {
    fontSize: 15,
    fontWeight: "800",
    maxWidth: 140,
  },
  productBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#EEF2FF",
  },
  productBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#4F46E5",
    textTransform: "uppercase",
  },
  productTag: {
    fontSize: 12,
    marginTop: 1,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    marginTop: 4,
  },
  price: {
    fontSize: 16,
    fontWeight: "900",
    color: "#16A34A",
  },
  oldPrice: {
    fontSize: 12,
    textDecorationLine: "line-through",
    color: "#9CA3AF",
  },
  discount: {
    fontSize: 12,
    fontWeight: "700",
    color: "#DC2626",
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: "#FBBF24",
    alignItems: "center",
    justifyContent: "center",
  },

  /* INFO FINAL */
  infoCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "#EFF6FF",
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 2,
  },
  infoText: {
    fontSize: 13,
    lineHeight: 18,
  },
});