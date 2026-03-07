// app/product/[id].tsx
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import useTheme from "../../hooks/useTheme";
import { addToCart } from "../../services/cart"; // 👈 NUEVO

type DetailParams = {
  id: string;
  name?: string;
  price?: string;
  image?: string;
  category?: string;
};

export default function ProductDetail(): React.JSX.Element {
  const router = useRouter();
  const { colors, isDarkMode } = useTheme();
  const params = useLocalSearchParams<DetailParams>();

  const priceNumber = useMemo(
    () => Number(params.price ?? 0),
    [params.price]
  );

  async function handleAddToCart() {
    try {
      await addToCart("TEST_USER", {
        id: params.id,
        name: params.name,
        price: priceNumber,
        image: params.image,
        category: params.category,
      });

      Alert.alert("Éxito", "Producto añadido al carrito 🛒");
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "No se pudo agregar al carrito.");
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={router.back}
          style={styles.headerIconBtn}
          activeOpacity={0.8}
        >
          <Ionicons
            name="chevron-back"
            size={22}
            color={colors.text}
          />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Detalle
        </Text>

        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* Imagen */}
        <View style={styles.imageWrap}>
          {params.image ? (
            <Image
              source={{ uri: String(params.image) }}
              style={styles.image}
            />
          ) : (
            <View
              style={[
                styles.imagePlaceholder,
                { backgroundColor: isDarkMode ? "#020617" : "#E5E7EB" },
              ]}
            >
              <Ionicons
                name="image-outline"
                size={34}
                color={colors.textSecondary ?? "#64748B"}
              />
            </View>
          )}

          {/* Categoría */}
          {!!params.category && (
            <View
              style={[
                styles.badge,
                { backgroundColor: `${colors.primary}22` },
              ]}
            >
              <Ionicons name="pricetag-outline" size={14} color={colors.primary} />
              <Text style={[styles.badgeText, { color: colors.primary }]}>
                {params.category}
              </Text>
            </View>
          )}
        </View>

        {/* Contenido */}
        <View style={styles.content}>
          <Text style={[styles.name, { color: colors.text }]}>
            {params.name ?? "Producto"}
          </Text>

          <View style={styles.rowBetween}>
            <Text
              style={[
                styles.price,
                { color: colors.primary },
              ]}
            >
              ${priceNumber.toFixed(2)}
            </Text>

            <View style={styles.ratingRow}>
              <Ionicons name="star" size={16} color="#FACC15" />
              <Text
                style={[
                  styles.ratingText,
                  { color: colors.textSecondary ?? "#64748B" },
                ]}
              >
                4.7 · 128 reseñas
              </Text>
            </View>
          </View>

          {/* Descripción temporal */}
          <Text
            style={[
              styles.description,
              { color: colors.textSecondary ?? "#6B7280" },
            ]}
          >
            Este es un producto destacado de ALAIA. Aquí podrás incluir su
            descripción real desde tu backend o Firestore: materiales, beneficios,
            características y por qué es tan especial.
          </Text>

          {/* Botones */}
          <View style={styles.actionsRow}>
            {/* Favorito (placeholder) */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.iconBtn,
                {
                  borderColor: isDarkMode ? "#1F2933" : "#E5E7EB",
                  backgroundColor: isDarkMode ? "#020617" : "#FFFFFF",
                },
              ]}
            >
              <Ionicons
                name="heart-outline"
                size={20}
                color={colors.primary}
              />
            </TouchableOpacity>

            {/* BOTÓN AGREGA AL CARRITO */}
            <TouchableOpacity
              activeOpacity={0.9}
              style={[
                styles.ctaBtn,
                { backgroundColor: colors.primary },
              ]}
              onPress={handleAddToCart}
            >
              <Ionicons
                name="cart-outline"
                size={20}
                color="#fff"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.ctaText}>Agregar al carrito</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/* ───────── estilos ───────── */

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    height: 56,
    paddingHorizontal: 16,
    paddingTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  headerTitle: { fontSize: 18, fontWeight: "800" },

  headerIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },

  imageWrap: {
    marginHorizontal: 16,
    marginTop: 4,
    borderRadius: 18,
    overflow: "hidden",
  },

  image: { width: "100%", height: 260 },

  imagePlaceholder: {
    width: "100%",
    height: 260,
    alignItems: "center",
    justifyContent: "center",
  },

  badge: {
    position: "absolute",
    left: 12,
    top: 12,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  badgeText: { fontSize: 12, fontWeight: "800" },

  content: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },

  name: { fontSize: 20, fontWeight: "900" },

  rowBetween: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  price: { fontSize: 22, fontWeight: "900" },

  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4 },

  ratingText: { fontSize: 13, fontWeight: "700" },

  description: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },

  actionsRow: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },

  ctaBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },

  ctaText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
});