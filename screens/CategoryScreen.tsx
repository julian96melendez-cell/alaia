// screens/CategoryScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import {
    FlatList,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import { useNavigation, useRoute } from "@react-navigation/native";
import { products } from "../constants/products";
import { useThemeContext } from "../context/ThemeContext";

export default function CategoryScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { colors } = useThemeContext();

  const slug = route.params?.slug ?? "";
  const name = slug.charAt(0).toUpperCase() + slug.slice(1);

  const filtered = useMemo(
    () =>
      products.filter((p) =>
        String(p.category ?? "")
          .toLowerCase()
          .includes(slug.toLowerCase())
      ),
    [slug]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>
          {name}
        </Text>
        <View style={{ width: 26 }} />
      </View>

      {/* Productos */}
      <FlatList
        data={filtered}
        keyExtractor={(i) => String(i.id)}
        numColumns={2}
        contentContainerStyle={{ padding: 14 }}
        columnWrapperStyle={{ justifyContent: "space-between" }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, { backgroundColor: colors.card }]}
            onPress={() =>
              navigation.navigate("ProductDetail", {
                productId: String(item.id),
              })
            }
          >
            <Image source={{ uri: (item as any).image }} style={styles.image} />
            <Text
              style={[styles.name, { color: colors.text }]}
              numberOfLines={2}
            >
              {item.name}
            </Text>
            <Text
              style={[styles.price, { color: colors.primary }]}
            >
              ${Number(item.price || 0).toFixed(2)}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    justifyContent: "space-between",
  },
  title: { fontSize: 20, fontWeight: "800" },
  card: {
    width: "48%",
    borderRadius: 14,
    padding: 10,
    marginBottom: 12,
  },
  image: { width: "100%", height: 130, borderRadius: 10 },
  name: { marginTop: 8, fontSize: 14, fontWeight: "700" },
  price: { marginTop: 4, fontSize: 15, fontWeight: "800" },
});