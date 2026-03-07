import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import Colors from "../../constants/Colors";
import { HOME_FEATURED_PRODUCTS } from "../../services/cards";

export default function CategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();

  const products = HOME_FEATURED_PRODUCTS.filter(
    (p) => p.categorySlug === slug
  );

  return (
    <ScrollView style={styles.container}>
      {/* Encabezado */}
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={router.back}>
          <Ionicons name="chevron-back" size={24} color={Colors.light.text} />
        </Pressable>

        <Text style={styles.title}>
          {slug?.charAt(0).toUpperCase() + slug?.slice(1)}
        </Text>

        <View style={{ width: 30 }} />
      </View>

      {/* Productos */}
      <View style={styles.grid}>
        {products.map((p) => (
          <Pressable
            key={p.id}
            style={styles.card}
            onPress={() =>
              router.push({
                pathname: "/product/[id]",
                params: {
                  id: p.id,
                  name: p.title,
                  price: p.price.toString(),
                  image: p.image,
                  category: p.categorySlug,
                },
              })
            }
          >
            <Image source={{ uri: p.image }} style={styles.cardImg} />
            <Text style={styles.cardTitle}>{p.title}</Text>
            <Text style={styles.cardPrice}>${p.price}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: Colors.light.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  back: {
    width: 34,
    height: 34,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.light.text,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    justifyContent: "space-between",
  },
  card: {
    width: "47%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 10,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
  },
  cardImg: {
    width: "100%",
    height: 120,
    borderRadius: 12,
  },
  cardTitle: {
    marginTop: 8,
    fontWeight: "700",
    color: Colors.light.text,
  },
  cardPrice: {
    fontWeight: "700",
    color: Colors.light.primary,
    marginTop: 4,
  },
});