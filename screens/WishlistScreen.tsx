// screens/WishlistScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
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
import { useCart } from "../context/CartContext";
import { useThemeContext } from "../context/ThemeContext";
import { auth } from "../firebase/firebaseConfig";

// Firestore
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";

const db = getFirestore();

type WishItem = {
  id: string;          // doc id en la subcolección wishlist
  productId: string;   // id del producto real
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

  // Animación de fade-in
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }).start();
  }, [fade]);

  // Suscripción a Firestore
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const q = query(
      collection(db, "users", user.uid, "wishlist"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as WishItem[];
        setItems(data);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return unsub;
  }, []);

  // Filtro local por texto
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
      if (!user) return;
      await deleteDoc(doc(db, "users", user.uid, "wishlist", wishDocId));
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "No se pudo eliminar de favoritos.");
    }
  };

  const handleAddToCart = (item: WishItem) => {
    addItem({
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
    <View style={[styles.emptyWrap]}>
      <Ionicons name="heart-outline" size={64} color={colors.primary} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>Tu lista está vacía</Text>
      <Text
        style={[
          styles.emptySub,
          { color: colors.textSecondary || (isDarkMode ? "#94A3B8" : "#64748B") },
        ]}
      >
        Explora productos y guarda tus favoritos para verlos aquí.
      </Text>
      <TouchableOpacity
        activeOpacity={0.9}
        // 👉 Ir a la pantalla principal con Expo Router
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
          ${item.price.toFixed(2)}
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
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Wishlist
        </Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Search */}
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

      {/* Lista */}
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

/* ───────────────────────── estilos ───────────────────────── */
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