// screens/SearchScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { products as localProducts, Product } from "../constants/products"; // ← ajusta si tu carpeta es "Constants"
import { useCart } from "../context/CartContext";
import useTheme from "../hooks/useTheme";

const { width } = Dimensions.get("window");
const TILE_W = width / 2 - 24;

type SortKey = "relevance" | "price_asc" | "price_desc" | "rating_desc";
const CATEGORIES = ["Todo", "Ropa", "Tecnología", "Hogar", "Accesorios"] as const;
const RATINGS = [0, 3.5, 4.0, 4.5] as const;

function useDebouncedCallback<T extends (...args: any[]) => void>(fn: T, delay = 300) {
  const ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback((...args: Parameters<T>) => {
    if (ref.current) clearTimeout(ref.current);
    ref.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}

export default function SearchScreen() {
  const { theme, isDarkMode } = useTheme();
  const navigation = useNavigation<any>();
  const { addItem } = useCart();

  // UI / filtros
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Todo");
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [minRating, setMinRating] = useState<number>(0);
  const [sort, setSort] = useState<SortKey>("relevance");
  const [showFilters, setShowFilters] = useState<boolean>(false);

  // Data
  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<Product[]>(localProducts);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Anim pseudo-header (sin Animated.FlatList para evitar tipos)
  const scrollY = useRef(0);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
  };

  const toggleFilters = useCallback(() => setShowFilters(v => !v), []);

  // Motor de búsqueda (local; cámbialo por Firestore si quieres)
  const runSearch = useCallback(
    async (q: string) => {
      try {
        setLoading(true);
        setError(null);

        const qLower = q.trim().toLowerCase();
        let base = [...localProducts];

        if (category !== "Todo") base = base.filter(p => p.category === category);
        if (qLower) base = base.filter(p => p.name.toLowerCase().includes(qLower));

        const minP = parseFloat(minPrice);
        const maxP = parseFloat(maxPrice);
        if (!Number.isNaN(minP)) base = base.filter(p => p.price >= minP);
        if (!Number.isNaN(maxP)) base = base.filter(p => p.price <= maxP);
        if (minRating > 0) base = base.filter(p => (p.rating ?? 0) >= minRating);

        switch (sort) {
          case "price_asc":
            base.sort((a, b) => a.price - b.price);
            break;
          case "price_desc":
            base.sort((a, b) => b.price - a.price);
            break;
          case "rating_desc":
            base.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
            break;
          case "relevance":
          default:
            // orden original
            break;
        }

        const sug = qLower
          ? localProducts
              .map(p => p.name)
              .filter(name => name.toLowerCase().includes(qLower))
              .slice(0, 6)
          : [];

        // micro-latencia para UX
        setTimeout(() => {
          setSuggestions(sug);
          setData(base);
          setLoading(false);
        }, 120);
      } catch {
        setLoading(false);
        setError("No se pudieron cargar los resultados. Intenta nuevamente.");
      }
    },
    [category, minPrice, maxPrice, minRating, sort]
  );

  const runSearchDebounced = useDebouncedCallback(runSearch, 280);
  const onChangeQuery = useCallback((text: string) => {
    setQuery(text);
    runSearchDebounced(text);
  }, [runSearchDebounced]);

  useEffect(() => {
    runSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    runSearch(query);
  }, [category, minRating, sort]); // precios disparan al submit

  const handleClear = useCallback(() => {
    setQuery("");
    runSearch("");
    Keyboard.dismiss();
  }, [runSearch]);

  const onSubmitPrice = useCallback(() => {
    runSearch(query);
    Keyboard.dismiss();
  }, [runSearch, query]);

  // Render Tile
  const renderItem = useCallback(
    ({ item }: { item: Product }) => (
      <ProductTile
        item={item}
        primary={theme.colors.primary}
        card={theme.colors.card}
        text={theme.colors.text}
        textSecondary={theme.colors.textSecondary ?? "#94A3B8"}
        onPress={() => navigation.navigate("ProductDetail", { product: item })}
        onAdd={() =>
          addItem({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: 1,
            image: item.image,
            color: item.colors?.[0],
            size: item.sizes?.[0],
            category: item.category,
          })
        }
      />
    ),
    [addItem, navigation, theme.colors.card, theme.colors.primary, theme.colors.text, theme.colors.textSecondary]
  );

  const keyExtractor = useCallback((p: Product) => p.id, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.colors.text }]}>Buscar</Text>
        <TouchableOpacity onPress={toggleFilters}>
          <Ionicons name="options-outline" size={22} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      {/* Searchbox */}
      <View style={[styles.searchBox, { backgroundColor: theme.colors.card }]}>
        <Ionicons name="search-outline" size={18} color={theme.colors.textSecondary ?? "#94A3B8"} />
        <TextInput
          style={[styles.input, { color: theme.colors.text }]}
          placeholder="Busca productos, marcas…"
          placeholderTextColor={theme.colors.textSecondary ?? "#94A3B8"}
          value={query}
          onChangeText={onChangeQuery}
          returnKeyType="search"
          onSubmitEditing={() => runSearch(query)}
        />
        {!!query && (
          <TouchableOpacity onPress={handleClear}>
            <Ionicons name="close-circle" size={18} color={theme.colors.textSecondary ?? "#94A3B8"} />
          </TouchableOpacity>
        )}
      </View>

      {/* Chips categoría */}
      <FlatList
        horizontal
        data={CATEGORIES as unknown as string[]}
        keyExtractor={(c) => c}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8 }}
        renderItem={({ item }) => {
          const active = category === (item as (typeof CATEGORIES)[number]);
          return (
            <TouchableOpacity
              onPress={() => setCategory(item as (typeof CATEGORIES)[number])}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? theme.colors.primary : isDarkMode ? "#111827" : "#EEF2FF",
                  borderColor: active ? theme.colors.primary : "transparent",
                },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? "#fff" : isDarkMode ? "#E5E7EB" : "#1F2937" }]}>
                {item}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* Filtros colapsables */}
      {showFilters && (
        <View style={[styles.filtersBox, { backgroundColor: theme.colors.card }]}>
          {/* Precio */}
          <View style={styles.filtersRow}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.colors.textSecondary ?? "#64748B" }]}>Mín. $</Text>
              <TextInput
                placeholder="0"
                keyboardType="numeric"
                value={minPrice}
                onChangeText={setMinPrice}
                onSubmitEditing={onSubmitPrice}
                style={[
                  styles.filterInput,
                  { color: theme.colors.text, borderColor: isDarkMode ? "#334155" : "#E5E7EB" },
                ]}
                placeholderTextColor={theme.colors.textSecondary ?? "#94A3B8"}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.colors.textSecondary ?? "#64748B" }]}>Máx. $</Text>
              <TextInput
                placeholder="500"
                keyboardType="numeric"
                value={maxPrice}
                onChangeText={setMaxPrice}
                onSubmitEditing={onSubmitPrice}
                style={[
                  styles.filterInput,
                  { color: theme.colors.text, borderColor: isDarkMode ? "#334155" : "#E5E7EB" },
                ]}
                placeholderTextColor={theme.colors.textSecondary ?? "#94A3B8"}
              />
            </View>
          </View>

          {/* Rating */}
          <View style={styles.filtersRow}>
            <Text style={[styles.label, { color: theme.colors.textSecondary ?? "#64748B" }]}>Rating</Text>
            <FlatList
              horizontal
              data={RATINGS as unknown as number[]}
              keyExtractor={(r) => r.toString()}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingLeft: 6 }}
              renderItem={({ item }) => {
                const active = minRating === item;
                return (
                  <TouchableOpacity
                    onPress={() => setMinRating(item)}
                    style={[
                      styles.ratingPill,
                      {
                        backgroundColor: active ? theme.colors.primary : isDarkMode ? "#0B1220" : "#F1F5F9",
                      },
                    ]}
                  >
                    <Ionicons name="star" size={14} color={active ? "#fff" : "#F59E0B"} />
                    <Text
                      style={[
                        styles.ratingText,
                        { color: active ? "#fff" : isDarkMode ? "#E5E7EB" : "#334155" },
                      ]}
                    >
                      {item === 0 ? "Todos" : `${item}+`}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>

          {/* Orden */}
          <View style={styles.filtersRow}>
            <Text style={[styles.label, { color: theme.colors.textSecondary ?? "#64748B" }]}>Ordenar por</Text>
            <FlatList
              horizontal
              data={[
                { k: "relevance", label: "Relevancia" },
                { k: "price_asc", label: "Precio ↑" },
                { k: "price_desc", label: "Precio ↓" },
                { k: "rating_desc", label: "Rating" },
              ]}
              keyExtractor={(o) => o.k}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingLeft: 6 }}
              renderItem={({ item }) => {
                const active = sort === (item.k as SortKey);
                return (
                  <TouchableOpacity
                    onPress={() => setSort(item.k as SortKey)}
                    style={[
                      styles.sortPill,
                      {
                        backgroundColor: active ? theme.colors.primary : isDarkMode ? "#0B1220" : "#F1F5F9",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.sortText,
                        { color: active ? "#fff" : isDarkMode ? "#E5E7EB" : "#334155" },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      )}

      {/* Sugerencias */}
      {!!query && suggestions.length > 0 && (
        <View style={[styles.suggestBox, { backgroundColor: theme.colors.card }]}>
          {suggestions.map((s) => (
            <TouchableOpacity
              key={s}
              style={styles.suggestRow}
              onPress={() => {
                setQuery(s);
                runSearch(s);
                Keyboard.dismiss();
              }}
            >
              <Ionicons name="search-outline" size={16} color={theme.colors.textSecondary ?? "#94A3B8"} />
              <Text style={[styles.suggestText, { color: theme.colors.text }]} numberOfLines={1}>
                {s}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Header resultados */}
      <View style={styles.resultsHeader}>
        <Text style={[styles.resultsText, { color: theme.colors.text }]}>
          Resultados {category !== "Todo" ? `• ${category}` : ""}
        </Text>
        <TouchableOpacity onPress={toggleFilters}>
          <Ionicons name={showFilters ? "chevron-up" : "chevron-down"} size={18} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      {/* Grid resultados */}
      <FlatList<Product>
        data={data}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={2}
        columnWrapperStyle={{ justifyContent: "space-between", paddingHorizontal: 16 }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyWrap}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : (
            <EmptyState
              textColor={theme.colors.textSecondary ?? "#94A3B8"}
              onRetry={() => runSearch(query)}
              error={error}
            />
          )
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        windowSize={6}
        // getItemLayout opcional: quitar para evitar errores de tipo en grids complejos
      />
    </View>
  );
}

/* ---------- Subcomponentes ---------- */

const ProductTile = memo(function ProductTile({
  item,
  primary,
  card,
  text,
  textSecondary,
  onAdd,
  onPress,
}: {
  item: Product;
  primary: string;
  card: string;
  text: string;
  textSecondary: string;
  onAdd: () => void;
  onPress: () => void;
}) {
  return (
    <View style={[styles.tile, { backgroundColor: card, shadowColor: "#000" }]}>
      <TouchableOpacity activeOpacity={0.92} onPress={onPress}>
        <Image source={{ uri: item.image }} style={styles.image} />
      </TouchableOpacity>

      <Text style={[styles.name, { color: text }]} numberOfLines={2}>
        {item.name}
      </Text>

      <View style={styles.row}>
        <Text style={[styles.price, { color: primary }]}>${item.price.toFixed(2)}</Text>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: primary }]} onPress={onAdd}>
          <Ionicons name="add" size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.ratingRow}>
        <Ionicons name="star" size={14} color="#F59E0B" />
        <Text style={[styles.ratingText, { color: text }]}>{(item.rating ?? 4.6).toFixed(1)}</Text>
        <Text style={[styles.reviewsText, { color: textSecondary }]}>({item.reviews ?? 50})</Text>
      </View>
    </View>
  );
});

const EmptyState = memo(function EmptyState({
  textColor,
  onRetry,
  error,
}: {
  textColor: string;
  onRetry: () => void;
  error: string | null;
}) {
  return (
    <View style={styles.emptyWrap}>
      <Ionicons name="search" size={34} color={textColor} />
      <Text style={[styles.emptyText, { color: textColor }]}>
        {error ?? "No hay resultados. Ajusta filtros o búsqueda."}
      </Text>
      {!!error && (
        <TouchableOpacity onPress={onRetry} style={styles.retryBtn}>
          <Text style={styles.retryTxt}>Reintentar</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

/* ---------- Estilos ---------- */
const styles = StyleSheet.create({
  container: { flex: 1 },

  topBar: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 14 : 8,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 20, fontWeight: "800" },

  searchBox: {
    marginHorizontal: 16,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    elevation: 3,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    marginBottom: 8,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 2 },

  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    marginHorizontal: 4,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: "700" },

  filtersBox: {
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 12,
    elevation: 2,
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  filtersRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    justifyContent: "space-between",
  },
  inputGroup: { width: "48%" },
  label: { fontSize: 12, fontWeight: "700", opacity: 0.8, marginBottom: 4 },
  filterInput: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    fontSize: 14,
  },

  ratingPill: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    marginRight: 8,
  },
  ratingText: { fontSize: 13, fontWeight: "700" },
  sortPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, marginRight: 8 },
  sortText: { fontSize: 13, fontWeight: "700" },

  suggestBox: {
    marginHorizontal: 16,
    borderRadius: 12,
    paddingVertical: 6,
    marginBottom: 8,
    elevation: 2,
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  suggestRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  suggestText: { fontSize: 14 },

  resultsHeader: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  resultsText: { fontSize: 16, fontWeight: "800" },

  tile: {
    width: TILE_W,
    borderRadius: 16,
    padding: 10,
    marginBottom: 14,
    elevation: 3,
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  image: { width: "100%", height: 130, borderRadius: 12, marginBottom: 8 },
  name: { fontSize: 14, fontWeight: "700", minHeight: 36 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  price: { fontSize: 15, fontWeight: "800" },
  addBtn: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  reviewsText: { fontSize: 12 },

  emptyWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 40 },
  emptyText: { fontSize: 14, marginTop: 8 },
  retryBtn: { marginTop: 12, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: "#334155" },
  retryTxt: { color: "#fff", fontWeight: "700" },
});