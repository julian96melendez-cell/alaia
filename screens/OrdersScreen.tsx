 // screens/OrdersScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type JSX,
} from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  ListRenderItem,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { auth } from "../firebase/firebaseConfig";
import useTheme from "../hooks/useTheme";

/* ────────────────────────────────
 * Tipos
 * ───────────────────────────────*/
type OrderItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string | null;
  color?: string | null;
  size?: string | null;
  category?: string | null;
};

export type OrderStatus =
  | "placed"
  | "paid"
  | "shipped"
  | "delivered"
  | "canceled";

type Order = {
  id: string; // doc id
  userId: string;
  items: OrderItem[];
  pricing: {
    subtotal: number;
    discount: number;
    shipping: number;
    total: number;
  };
  shippingAddress: {
    fullName: string;
    phone: string;
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  payment: {
    method: "card" | "cash" | "paypal";
    last4?: string | null;
    provider?: string | null;
  };
  status: OrderStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  canceledAt?: Timestamp;
};

type OrdersStats = {
  total: number;
  delivered: number;
  canceled: number;
  active: number; // placed, paid, shipped
};

const db = getFirestore();

/* ────────────────────────────────
 * Utils
 * ───────────────────────────────*/
const STATUS_STEPS: Array<{ key: OrderStatus | "paid"; label: string }> = [
  { key: "placed", label: "Procesando" },
  { key: "paid", label: "Pagado" },
  { key: "shipped", label: "Enviado" },
  { key: "delivered", label: "Entregado" },
];

const statusLabel = (s: OrderStatus): string =>
  s === "placed"
    ? "Procesando"
    : s === "paid"
    ? "Pagado"
    : s === "shipped"
    ? "En camino"
    : s === "delivered"
    ? "Entregado"
    : "Cancelado";

const formatDate = (ts?: Timestamp): string =>
  ts ? ts.toDate().toLocaleDateString() : "—";

/* ────────────────────────────────
 * Componentes auxiliares
 * ───────────────────────────────*/

const StatsHeader = memo(
  ({
    stats,
    primary,
    text,
    muted,
  }: {
    stats: OrdersStats;
    primary: string;
    text: string;
    muted: string;
  }) => {
    if (stats.total === 0) return null;

    return (
      <View style={styles.statsWrap}>
        <View style={styles.statsRow}>
          <View style={styles.statsChip}>
            <Text style={[styles.statsLabel, { color: muted }]}>Pedidos</Text>
            <Text style={[styles.statsValue, { color: text }]}>
              {stats.total}
            </Text>
          </View>
          <View style={styles.statsChip}>
            <Text style={[styles.statsLabel, { color: muted }]}>
              Entregados
            </Text>
            <Text style={[styles.statsValue, { color: primary }]}>
              {stats.delivered}
            </Text>
          </View>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statsChip}>
            <Text style={[styles.statsLabel, { color: muted }]}>
              En curso
            </Text>
            <Text style={[styles.statsValue, { color: text }]}>
              {stats.active}
            </Text>
          </View>
          <View style={styles.statsChip}>
            <Text style={[styles.statsLabel, { color: muted }]}>
              Cancelados
            </Text>
            <Text style={[styles.statsValue, { color: "#EF4444" }]}>
              {stats.canceled}
            </Text>
          </View>
        </View>
      </View>
    );
  }
);

const OrderProgress = memo(function OrderProgress({
  status,
  themePrimary,
}: {
  status: OrderStatus;
  themePrimary: string;
}) {
  const currentIdx =
    status === "canceled"
      ? -1
      : status === "delivered"
      ? 3
      : status === "shipped"
      ? 2
      : status === "paid"
      ? 1
      : 0;

  const percentage =
    currentIdx <= 0
      ? 0
      : (currentIdx / (STATUS_STEPS.length - 1)) * 100;

  return (
    <View style={{ marginTop: 10, marginBottom: 12 }}>
      <View style={styles.progressRow}>
        {STATUS_STEPS.map((st, idx) => {
          const active = idx <= currentIdx;
          return (
            <View style={styles.progressStep} key={st.key}>
              <View
                style={[
                  styles.progressCircle,
                  { backgroundColor: active ? themePrimary : "#E5E7EB" },
                ]}
              >
                {active ? (
                  <Ionicons name="checkmark" size={14} color="#fff" />
                ) : null}
              </View>
              <Text style={styles.progressLabel}>{st.label}</Text>
            </View>
          );
        })}
      </View>

      {/* Línea base */}
      <View style={styles.progressBaseLine} />
      {/* Línea activa */}
      <View
        style={[
          styles.progressActiveLine,
          {
            backgroundColor: themePrimary,
            width: `${Math.max(0, Math.min(100, percentage))}%`,
          },
        ]}
      />
    </View>
  );
});

const FilterTabs = memo(
  ({
    value,
    onChange,
    primary,
    bg,
    border,
    text,
  }: {
    value: "all" | "active" | "delivered" | "canceled";
    onChange: (v: "all" | "active" | "delivered" | "canceled") => void;
    primary: string;
    bg: string;
    border: string;
    text: string;
  }) => {
    const tabs: Array<{
      key: "all" | "active" | "delivered" | "canceled";
      label: string;
    }> = [
      { key: "all", label: "Todos" },
      { key: "active", label: "En curso" },
      { key: "delivered", label: "Entregados" },
      { key: "canceled", label: "Cancelados" },
    ];

    return (
      <View style={[styles.tabsWrap, { backgroundColor: bg, borderColor: border }]}>
        {tabs.map((t) => {
          const active = t.key === value;
          return (
            <TouchableOpacity
              key={t.key}
              style={[
                styles.tab,
                active && { backgroundColor: primary + "22" },
              ]}
              onPress={() => onChange(t.key)}
              activeOpacity={0.9}
            >
              <Text
                style={[
                  styles.tabLabel,
                  { color: active ? primary : text },
                ]}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }
);

/* ────────────────────────────────
 * Pantalla principal
 * ───────────────────────────────*/
export default function OrdersScreen(): JSX.Element {
  const { colors, isDarkMode } = useTheme();
  const navigation = useNavigation<any>();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "delivered" | "canceled">(
    "all"
  );

  const user = auth.currentUser;

  /* Suscripción en tiempo real a los pedidos del usuario */
  useEffect(() => {
    if (!user) {
      setOrders([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, "users", user.uid, "orders"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Order[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Order, "id">),
        }));
        setOrders(list);
        setLoading(false);
      },
      (err) => {
        console.error("orders onSnapshot error:", err);
        setLoading(false);
        Alert.alert(
          "Error",
          "No se pudieron cargar tus pedidos. Intenta nuevamente."
        );
      }
    );

    return unsub;
  }, [user]);

  const onRefresh = useCallback(() => {
    // onSnapshot mantiene la data, esto es solo feedback visual
    setRefreshing(true);
    const t = setTimeout(() => setRefreshing(false), 600);
    return () => clearTimeout(t);
  }, []);

  const canCancel = useCallback(
    (o: Order) => !["shipped", "delivered", "canceled"].includes(o.status),
    []
  );

  const cancelOrder = useCallback(
    async (o: Order) => {
      if (!user) return;
      if (!canCancel(o)) {
        Alert.alert(
          "No se puede cancelar",
          "El pedido ya fue enviado, entregado o cancelado."
        );
        return;
      }
      Alert.alert(
        "Cancelar pedido",
        "¿Seguro que deseas cancelar este pedido?",
        [
          { text: "No", style: "cancel" },
          {
            text: "Sí, cancelar",
            style: "destructive",
            onPress: async () => {
              try {
                const ref = doc(db, "users", user.uid, "orders", o.id);
                await updateDoc(ref, {
                  status: "canceled",
                  canceledAt: Timestamp.now(),
                  updatedAt: Timestamp.now(),
                });
              } catch (e) {
                console.error(e);
                Alert.alert(
                  "Error",
                  "No se pudo cancelar el pedido. Intenta de nuevo."
                );
              }
            },
          },
        ]
      );
    },
    [user, canCancel]
  );

  /* Estadísticas rápidas */
  const stats: OrdersStats = useMemo(() => {
    if (!orders.length)
      return { total: 0, delivered: 0, canceled: 0, active: 0 };

    const total = orders.length;
    const delivered = orders.filter((o) => o.status === "delivered").length;
    const canceled = orders.filter((o) => o.status === "canceled").length;
    const active = total - delivered - canceled;

    return { total, delivered, canceled, active };
  }, [orders]);

  /* Filtrado avanzado */
  const filteredOrders = useMemo(() => {
    if (filter === "all") return orders;
    if (filter === "active") {
      return orders.filter(
        (o) => !["delivered", "canceled"].includes(o.status)
      );
    }
    return orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  /* Vista vacía */
  const Empty = useMemo(
    () =>
      function EmptyComp() {
        return (
          <View style={[styles.center, { paddingTop: 64 }]}>
            <Ionicons
              name="receipt-outline"
              size={56}
              color={colors.primary}
            />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              Aún no tienes pedidos
            </Text>
            <Text
              style={[
                styles.emptySub,
                { color: colors.textSecondary || "#6B7280" },
              ]}
            >
              Cuando compres algo, lo verás aquí con su estado y detalle.
            </Text>
            <TouchableOpacity
              style={[
                styles.cta,
                { backgroundColor: colors.primary },
              ]}
              onPress={() => navigation.navigate("Home")}
              activeOpacity={0.9}
            >
              <Text style={styles.ctaText}>Ir a comprar</Text>
            </TouchableOpacity>
          </View>
        );
      },
    [navigation, colors.primary, colors.text, colors.textSecondary]
  );

  const keyExtractor = useCallback((o: Order) => o.id, []);

  const renderItem: ListRenderItem<Order> = useCallback(
    ({ item }) => {
      const statusColorBg =
        item.status === "canceled"
          ? isDarkMode
            ? "#7F1D1D"
            : "#FEE2E2"
          : item.status === "delivered"
          ? isDarkMode
            ? "#052E1B"
            : "#DCFCE7"
          : item.status === "shipped"
          ? isDarkMode
            ? "#102A43"
            : "#DBEAFE"
          : item.status === "paid"
          ? isDarkMode
            ? "#0B2E1D"
            : "#D1FAE5"
          : isDarkMode
          ? "#1F2937"
          : "#E5E7EB";

      const statusColorText =
        item.status === "canceled"
          ? "#B91C1C"
          : item.status === "delivered"
          ? "#16A34A"
          : item.status === "shipped"
          ? "#2563EB"
          : item.status === "paid"
          ? "#10B981"
          : isDarkMode
          ? "#E5E7EB"
          : "#111827";

      const firstItem = item.items[0];

      return (
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              shadowColor: isDarkMode ? "#000" : "#CBD5E1",
            },
          ]}
        >
          {/* Encabezado */}
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.orderId, { color: colors.text }]}
                numberOfLines={1}
              >
                Orden #{item.id.slice(0, 8).toUpperCase()}
              </Text>
              <Text
                style={[
                  styles.date,
                  { color: colors.textSecondary || "#94A3B8" },
                ]}
              >
                {formatDate(item.createdAt)}
              </Text>
              {firstItem && (
                <Text
                  style={[
                    styles.firstItem,
                    { color: colors.textSecondary || "#9CA3AF" },
                  ]}
                  numberOfLines={1}
                >
                  {firstItem.name}
                  {item.items.length > 1
                    ? ` + ${item.items.length - 1} art.`
                    : ""}
                </Text>
              )}
            </View>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: statusColorBg,
                },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  {
                    color: statusColorText,
                  },
                ]}
              >
                {statusLabel(item.status)}
              </Text>
            </View>
          </View>

          {/* Productos miniatura */}
          <View style={styles.itemsRow}>
            {item.items.slice(0, 3).map((it) => (
              <Image
                key={it.id}
                source={{
                  uri: it.image || "https://via.placeholder.com/80",
                }}
                style={styles.thumb}
              />
            ))}
            {item.items.length > 3 && (
              <View
                style={[
                  styles.moreThumb,
                  {
                    borderColor: isDarkMode ? "#334155" : "#E5E7EB",
                  },
                ]}
              >
                <Text style={styles.moreText}>
                  +{item.items.length - 3}
                </Text>
              </View>
            )}
          </View>

          {/* Progreso */}
          <OrderProgress
            status={item.status}
            themePrimary={colors.primary}
          />

          {/* Total + acciones */}
          <View style={styles.rowBetween}>
            <Text
              style={[styles.total, { color: colors.text }]}
              numberOfLines={1}
            >
              Total:{" "}
              <Text style={{ color: colors.primary }}>
                ${item.pricing.total.toFixed(2)}
              </Text>
            </Text>

            <View style={styles.actionsRow}>
              {canCancel(item) && (
                <TouchableOpacity
                  style={[
                    styles.secondaryBtn,
                    { borderColor: "#EF4444" },
                  ]}
                  onPress={() => cancelOrder(item)}
                  activeOpacity={0.9}
                >
                  <Ionicons
                    name="close-circle-outline"
                    size={16}
                    color="#EF4444"
                  />
                  <Text
                    style={[
                      styles.secondaryText,
                      { color: "#EF4444" },
                    ]}
                  >
                    Cancelar
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  { backgroundColor: colors.primary },
                ]}
                onPress={() =>
                  navigation.navigate("OrderDetail", {
                    orderId: item.id,
                  })
                }
                activeOpacity={0.9}
              >
                <Ionicons name="eye-outline" size={16} color="#fff" />
                <Text style={styles.primaryText}>Ver</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    },
    [cancelOrder, canCancel, isDarkMode, navigation, colors]
  );

  /* ───────────────────── Estados globales ───────────────────── */

  if (loading) {
    return (
      <View
        style={[
          styles.center,
          { backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator color={colors.primary} />
        <Text
          style={{
            color: colors.text,
            marginTop: 8,
            fontWeight: "600",
          }}
        >
          Cargando pedidos…
        </Text>
      </View>
    );
  }

  const hasOrders = orders.length > 0;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background },
      ]}
    >
      {/* Header superior */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons
            name="arrow-back"
            size={22}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text
          style={[styles.headerTitle, { color: colors.text }]}
        >
          Mis pedidos
        </Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Tabs de filtro */}
      {hasOrders && (
        <FilterTabs
          value={filter}
          onChange={setFilter}
          primary={colors.primary}
          bg={isDarkMode ? "#020617" : "#F8FAFC"}
          border={isDarkMode ? "#1F2937" : "#E5E7EB"}
          text={colors.text}
        />
      )}

      {/* Lista / vacío */}
      {!hasOrders ? (
        <Empty />
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 24,
          }}
          ListHeaderComponent={
            <StatsHeader
              stats={stats}
              primary={colors.primary}
              text={colors.text}
              muted={colors.textSecondary || "#94A3B8"}
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </View>
  );
}

/* ────────────────────────────────
 * Estilos
 * ───────────────────────────────*/
const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: {
    height: 56,
    paddingHorizontal: 16,
    marginTop: Platform.OS === "ios" ? 6 : 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 20, fontWeight: "800" },

  /* Tarjeta de pedido */
  card: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    elevation: 3,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
  },

  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  orderId: { fontSize: 14, fontWeight: "800" },
  date: { fontSize: 12, fontWeight: "700", marginTop: 2 },
  firstItem: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },

  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: "800" },

  itemsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 6,
    gap: 8,
  },
  thumb: { width: 56, height: 56, borderRadius: 10 },
  moreThumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  moreText: { fontWeight: "800", color: "#374151" },

  total: { fontSize: 14, fontWeight: "800" },

  primaryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  primaryText: { color: "#fff", fontSize: 13, fontWeight: "800" },

  secondaryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  secondaryText: { fontSize: 13, fontWeight: "800" },

  emptyTitle: { marginTop: 12, fontSize: 18, fontWeight: "800" },
  emptySub: {
    marginTop: 4,
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  cta: {
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  ctaText: { color: "#fff", fontWeight: "800" },

  // Stats
  statsWrap: {
    marginBottom: 12,
    borderRadius: 14,
    padding: 10,
    backgroundColor: "rgba(148, 163, 184, 0.07)",
  },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
  statsChip: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "rgba(148, 163, 184, 0.14)",
  },
  statsLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statsValue: { fontSize: 15, fontWeight: "800", marginTop: 2 },

  // Progreso
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressStep: { alignItems: "center", flex: 1 },
  progressCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  progressLabel: {
    fontSize: 11,
    marginTop: 6,
    color: "#6B7280",
    fontWeight: "700",
  },
  progressBaseLine: {
    position: "absolute",
    top: 11,
    left: 28,
    right: 28,
    height: 2,
    backgroundColor: "#E5E7EB",
    zIndex: -1,
  },
  progressActiveLine: {
    position: "absolute",
    top: 11,
    left: 28,
    height: 2,
    zIndex: -1,
  },

  // Tabs de filtro
  tabsWrap: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 4,
    flexDirection: "row",
  },
  tab: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: { fontSize: 12, fontWeight: "800" },

  actionsRow: { flexDirection: "row", gap: 8 },
});

export { };
