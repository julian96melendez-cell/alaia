// screens/WishlistScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { auth, db } from "../../firebase/firebaseConfig";
import { useCart } from "../context/CartContext";
import { useThemeContext } from "../context/ThemeContext";

type WishItem = {
  id: string;
  productId: string;
  name: string;
  price: number;
  image?: string;
  color?: string;
  size?: string;
  category?: string;
  createdAt?: Timestamp;
};

export default function WishlistScreen() {
  const { colors, isDarkMode } = useThemeContext();
  const { addItem } = useCart();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<WishItem[]>([]);
  const [queryText, setQueryText] = useState("");

  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 450,
      useNativeDriver: true,
    }).start();
  }, [fade]);

  useEffect(() => {
    const user = auth.currentUser;

    if (!user?.uid) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    let unsubscribe: (() => void) | undefined;

    try {
      const wishlistRef = collection(db, "users", user.uid, "wishlist");

      const wishlistQuery = query(
        wishlistRef,
        orderBy("createdAt", "desc")
      );

      unsubscribe = onSnapshot(
        wishlistQuery,
        (snap) => {
          const data = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<WishItem, "id">),
          }));

          setItems(data);
          setLoading(false);
        },
        (error) => {
          console.log("WISHLIST SNAPSHOT ERROR:", error);
          setLoading(false);
          Alert.alert("Error", "No se pudieron cargar tus favoritos.");
        }
      );
    } catch (error) {
      console.log("WISHLIST QUERY CREATE ERROR:", error);
      setLoading(false);
      Alert.alert("Error", "No se pudo crear la consulta de favoritos.");
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const filtered = useMemo(() => {
    const t = queryText.trim().toLowerCase();

    if (!t) return items;

    return items.filter(
      (x) =>
        x.name?.toLowerCase().includes(t) ||
        (x.category ?? "").toLowerCase().includes(t) ||
        (x.color ?? "").toLowerCase().includes(t)
    );
  }, [items, queryText]);

  const removeFromWishlist = async (wishDocId: string) => {
    const user = auth.currentUser;

    try {
      if (!user?.uid) return;

      await deleteDoc(doc(db, "users", user.uid, "wishlist", wishDocId));
    } catch (error) {
      console.error("REMOVE WISHLIST ERROR:", error);
      Alert.alert("Error", "No se pudo eliminar de favoritos.");
    }
  };

  const handleAddToCart = async (item: WishItem) => {
    await addItem({
      id: item.productId || item.id,
      name: item.name,
      price: item.price,
      quantity: 1,
      image: item.image,
      color: item.color,
      size: item.size,
      category: item.category,
    });

    Alert.alert("Agregado", `${item.name} se añadió al carrito.`);
  };

  const Empty = () => (
    <View style={styles.emptyWrap}>
      <Ionicons name="heart-outline" size={64} color={colors.primary} />

      <Text style={[styles.emptyTitle, { color: colors.text }]}>
        Tu lista está vacía
      </Text>

      <Text
        style={[
          styles.emptySub,
          {
            color:
              colors.textSecondary || (isDarkMode ? "#94A3B8" : "#64748B"),
          },
        ]}
      >
        Explora productos y guarda tus favoritos para verlos aquí.
      </Text>

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => router.push("/")}
        style={[styles.cta, { backgroundColor: colors.primary }]}
      >
        <Ionicons name="compass-outline" size={18} color="#fff" />
        <Text style={styles.ctaTxt}>Descubrir productos</Text>
      </TouchableOpacity>
    </View>
  );

  const renderItem = ({ item }: { item: WishItem }) => (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: isDarkMode ? "#233046" : "#E5E7EB",
        },
      ]}
    >
      <Image
        source={{ uri: item.image || "https://via.placeholder.com/140" }}
        style={styles.thumb}
      />

      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
          {item.name}
        </Text>

        <Text
          style={[styles.meta, { color: colors.textSecondary || "#7C8795" }]}
          numberOfLines={1}
        >
          {item.category ? `${item.category} • ` : ""}
          {item.color ? `Color: ${item.color}` : ""}
          {item.size ? ` • Talla: ${item.size}` : ""}
        </Text>

        <Text style={[styles.price, { color: colors.primary }]}>
          ${Number(item.price || 0).toFixed(2)}
        </Text>

        <View style={styles.row}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => handleAddToCart(item)}
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="cart-outline" size={16} color="#fff" />
            <Text style={styles.primaryTxt}>Agregar al carrito</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() =>
              Alert.alert("Eliminar", "¿Eliminar de tu wishlist?", [
                { text: "Cancelar", style: "cancel" },
                {
                  text: "Eliminar",
                  style: "destructive",
                  onPress: () => removeFromWishlist(item.id),
                },
              ])
            }
            style={[
              styles.secondaryBtn,
              { borderColor: isDarkMode ? "#334155" : "#E5E7EB" },
            ]}
          >
            <Ionicons
              name="trash-outline"
              size={16}
              color={isDarkMode ? "#CBD5E1" : "#475569"}
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />

        <Text style={{ color: colors.text, marginTop: 8 }}>
          Cargando favoritos…
        </Text>
      </View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: colors.background, opacity: fade },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Wishlist
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <View
        style={[
          styles.searchWrap,
          {
            backgroundColor: colors.card,
            borderColor: isDarkMode ? "#233046" : "#E5E7EB",
          },
        ]}
      >
        <Ionicons
          name="search-outline"
          size={18}
          color={colors.textSecondary || "#94A3B8"}
        />

        <TextInput
          value={queryText}
          onChangeText={setQueryText}
          placeholder="Buscar en favoritos…"
          placeholderTextColor={colors.textSecondary || "#94A3B8"}
          style={[styles.searchInput, { color: colors.text }]}
          returnKeyType="search"
        />

        {queryText.length > 0 && (
          <TouchableOpacity onPress={() => setQueryText("")}>
            <Ionicons
              name="close-circle"
              size={18}
              color={colors.textSecondary || "#94A3B8"}
            />
          </TouchableOpacity>
        )}
      </View>

      {filtered.length === 0 ? (
        <Empty />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(x) => x.id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: {
    height: 56,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 6 : 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 20, fontWeight: "800" },

  searchWrap: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15 },

  card: {
    flexDirection: "row",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 12,
    marginBottom: 12,
    elevation: 2,
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  thumb: { width: 84, height: 84, borderRadius: 12 },

  name: { fontSize: 14, fontWeight: "800" },
  meta: { fontSize: 12, marginTop: 2 },
  price: { fontSize: 15, fontWeight: "800", marginTop: 6 },

  row: { flexDirection: "row", gap: 10, marginTop: 10 },
  primaryBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  primaryTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  secondaryBtn: {
    width: 46,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyWrap: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 48,
  },
  emptyTitle: { marginTop: 10, fontSize: 18, fontWeight: "800" },
  emptySub: { marginTop: 6, fontSize: 13, textAlign: "center" },
  cta: {
    marginTop: 14,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaTxt: { color: "#fff", fontWeight: "800" },
});