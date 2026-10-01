import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";

import Colors from "../../constants/Colors";
import { useAuth } from "../../context/AuthContext";
import { apiUrl } from "../../config/api";
import { useAppNavigation } from "../../navigation/useAppNavigation";

type OrderStatus =
  | "pendiente_pago"
  | "confirmada"
  | "en_preparacion"
  | "en_camino"
  | "entregada"
  | "cancelada";

type PaymentStatus =
  | "pendiente"
  | "autorizado"
  | "pagado"
  | "fallido"
  | "reembolsado";

type Order = {
  id: string;
  orderId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  total: number;
  itemsCount: number;
  createdAt?: any;
  updatedAt?: any;
};

type UiFilter =
  | "Todos"
  | "Pendientes"
  | "En proceso"
  | "Entregadas"
  | "Canceladas";

const FILTERS: UiFilter[] = [
  "Todos",
  "Pendientes",
  "En proceso",
  "Entregadas",
  "Canceladas",
];

const STATUS_META: Record<
  OrderStatus,
  { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  pendiente_pago: {
    label: "Pendiente de pago",
    color: "#F59E0B",
    icon: "time-outline",
  },
  confirmada: {
    label: "Confirmada",
    color: Colors.light.primary,
    icon: "checkmark-circle-outline",
  },
  en_preparacion: {
    label: "En preparación",
    color: "#7C3AED",
    icon: "cube-outline",
  },
  en_camino: {
    label: "En camino",
    color: "#2563EB",
    icon: "bicycle-outline",
  },
  entregada: {
    label: "Entregada",
    color: "#16A34A",
    icon: "home-outline",
  },
  cancelada: {
    label: "Cancelada",
    color: "#DC2626",
    icon: "close-circle-outline",
  },
};

const PAYMENT_META: Record<PaymentStatus, { label: string; color: string }> = {
  pendiente: { label: "Pago pendiente", color: "#F59E0B" },
  autorizado: { label: "Autorizado", color: "#2563EB" },
  pagado: { label: "Pagado", color: "#16A34A" },
  fallido: { label: "Pago fallido", color: "#DC2626" },
  reembolsado: { label: "Reembolsado", color: "#64748B" },
};

function normalizeStatus(status?: string): OrderStatus {
  const valid: OrderStatus[] = [
    "pendiente_pago",
    "confirmada",
    "en_preparacion",
    "en_camino",
    "entregada",
    "cancelada",
  ];

  return valid.includes(status as OrderStatus)
    ? (status as OrderStatus)
    : "pendiente_pago";
}

function normalizePaymentStatus(status?: string): PaymentStatus {
  const valid: PaymentStatus[] = [
    "pendiente",
    "autorizado",
    "pagado",
    "fallido",
    "reembolsado",
  ];

  return valid.includes(status as PaymentStatus)
    ? (status as PaymentStatus)
    : "pendiente";
}

function normalizeOrder(id: string, data: any): Order {
  const total =
    typeof data.total === "number"
      ? data.total
      : typeof data.pricing?.total === "number"
        ? data.pricing.total
        : 0;

  const itemsCount =
    typeof data.itemsCount === "number"
      ? data.itemsCount
      : Array.isArray(data.items)
        ? data.items.reduce(
            (acc: number, item: any) => acc + Number(item.quantity || 1),
            0
          )
        : 0;

  return {
    id,
    orderId: String(data.orderId || id),
    status: normalizeStatus(data.status),
    paymentStatus: normalizePaymentStatus(data.paymentStatus),
    total: Number(total || 0),
    itemsCount: Number(itemsCount || 0),
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

function formatDate(value?: any) {
  try {
    if (!value) return "Sin fecha";

    const date =
      typeof value?.toDate === "function"
        ? value.toDate()
        : typeof value === "number" || typeof value === "string"
          ? new Date(value)
          : null;

    if (!date || Number.isNaN(date.getTime())) return "Sin fecha";

    return date.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "Sin fecha";
  }
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

export default function OrdersScreen() {
  const nav = useAppNavigation();
  const { user, loading: authLoading } = useAuth();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const reloadOrders = useRef<() => void>(() => {});
  const [error, setError] = useState<string | null>(null);

  const [activeFilter, setActiveFilter] = useState<UiFilter>("Todos");
  const [search, setSearch] = useState("");

  useFocusEffect(useCallback(() => {
    if (authLoading) return;
    if (!user) {
      setOrders([]);
      setLoadingOrders(false);
      setRefreshing(false);
      setError(null);
      return;
    }
    let active = true;
    let busy = false;
    let controller: AbortController | null = null;
    setOrders([]);
    setLoadingOrders(true);
    setError(null);
    const loadOrders = async () => {
      if (busy) return;
      busy = true;
      const requestController = new AbortController();
      controller = requestController;
      const timeout = setTimeout(() => requestController.abort(), 15000);
      try {
        const token = await user.getIdToken();
        if (!active) return;
        const response = await fetch(apiUrl("/api/ordenes/mobile/mias"), {
          headers: { Authorization: `Bearer ${token}` }, signal: requestController.signal,
        });
        const json = await response.json();
        if (!response.ok || !json.ok || !Array.isArray(json.data)) throw new Error("No se pudieron cargar tus órdenes.");
        if (!active) return;
        setOrders(json.data.map((order: any) => normalizeOrder(String(order._id), order)));
        setError(null);
      } catch {
        if (active) setError("No se pudieron cargar tus órdenes. Intenta actualizar.");
      } finally {
        clearTimeout(timeout);
        busy = false;
        if (active) { setLoadingOrders(false); setRefreshing(false); }
      }
    };
    reloadOrders.current = () => { void loadOrders(); };
    void loadOrders();
    const timer = setInterval(() => { void loadOrders(); }, 15000);
    return () => { active = false; controller?.abort(); clearInterval(timer); reloadOrders.current = () => {}; };
  }, [authLoading, user]));

  const stats = useMemo(() => {
    const active = orders.filter((order) =>
      ["pendiente_pago", "confirmada", "en_preparacion", "en_camino"].includes(
        order.status
      )
    ).length;

    const delivered = orders.filter((order) => order.status === "entregada")
      .length;

    const paid = orders.filter((order) => order.paymentStatus === "pagado")
      .length;

    const amount = orders.reduce(
      (acc, order) => acc + Number(order.total || 0),
      0
    );

    return {
      total: orders.length,
      active,
      delivered,
      paid,
      amount,
    };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();

    return orders.filter((order) => {
      const meta = STATUS_META[order.status];
      const payment = PAYMENT_META[order.paymentStatus];

      const matchesSearch =
        !q ||
        order.orderId.toLowerCase().includes(q) ||
        meta.label.toLowerCase().includes(q) ||
        payment.label.toLowerCase().includes(q);

      const matchesFilter =
        activeFilter === "Todos" ||
        (activeFilter === "Pendientes" && order.status === "pendiente_pago") ||
        (activeFilter === "En proceso" &&
          ["confirmada", "en_preparacion", "en_camino"].includes(
            order.status
          )) ||
        (activeFilter === "Entregadas" && order.status === "entregada") ||
        (activeFilter === "Canceladas" && order.status === "cancelada");

      return matchesSearch && matchesFilter;
    });
  }, [orders, search, activeFilter]);

  const onRefresh = () => {
    setRefreshing(true);
    reloadOrders.current();
  };

  const openTracking = (orderId: string) => {
    try {
      nav.push(nav.routes.track(orderId));
    } catch {
      console.log("TRACK ROUTE ERROR:", orderId);
    }
  };

  if (authLoading || loadingOrders) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
        <Text style={styles.centerTitle}>Cargando tus pedidos…</Text>
        <Text style={styles.centerText}>
          Estamos sincronizando tus órdenes reales.
        </Text>
      </View>
    );
  }

  if (!user?.uid) {
    return (
      <View style={styles.center}>
        <Ionicons name="log-in-outline" size={54} color={Colors.light.primary} />
        <Text style={styles.centerTitle}>Inicia sesión</Text>
        <Text style={styles.centerText}>
          Necesitas iniciar sesión para ver tus pedidos.
        </Text>
      </View>
    );
  }

  if (error && orders.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="cloud-offline-outline" size={54} color="#DC2626" />
        <Text style={styles.centerTitle}>No pudimos cargar órdenes</Text>
        <Text style={styles.centerText}>{error}</Text>

        <Pressable style={styles.primaryBtn} onPress={onRefresh}>
          <Text style={styles.primaryBtnText}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={Colors.light.primary}
        />
      }
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.header}>Mis pedidos</Text>
          <Text style={styles.subtitle}>
            Historial real de compras, pagos y seguimiento.
          </Text>
        </View>

        <View style={styles.headerIcon}>
          <Ionicons name="receipt-outline" size={24} color="#fff" />
        </View>
      </View>

      <View style={styles.summaryCard}>
        <View>
          <Text style={styles.summaryLabel}>Órdenes reales</Text>
          <Text style={styles.summaryValue}>{stats.total} pedidos</Text>
          <Text style={styles.summaryHint}>
            Activas: {stats.active} · Pagadas: {stats.paid}
          </Text>
        </View>

        <View style={styles.summaryRight}>
          <Text style={styles.summaryAmountLabel}>Total histórico</Text>
          <Text style={styles.summaryAmountValue}>
            {formatMoney(stats.amount)}
          </Text>
        </View>
      </View>

      <View style={styles.quickStats}>
        <StatCard
          label="Activas"
          value={String(stats.active)}
          icon="flash-outline"
        />
        <StatCard
          label="Entregadas"
          value={String(stats.delivered)}
          icon="checkmark-done-outline"
        />
        <StatCard
          label="Pagadas"
          value={String(stats.paid)}
          icon="card-outline"
        />
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={20} color="#94A3B8" />

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar por orden, estado o pago"
          placeholderTextColor="#94A3B8"
          style={styles.searchInput}
          returnKeyType="search"
        />

        {search.trim().length > 0 ? (
          <Pressable onPress={() => setSearch("")} hitSlop={10}>
            <Ionicons name="close-circle" size={20} color="#94A3B8" />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {FILTERS.map((filter) => {
          const active = activeFilter === filter;

          return (
            <Pressable
              key={filter}
              onPress={() => setActiveFilter(filter)}
              style={({ pressed }) => [
                styles.filterChip,
                active && styles.filterChipActive,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[styles.filterText, active && styles.filterTextActive]}
              >
                {filter}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {filteredOrders.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="file-tray-outline" size={44} color="#94A3B8" />
          </View>

          <Text style={styles.emptyTitle}>
            {orders.length ? "No hay resultados" : "Aún no tienes pedidos"}
          </Text>

          <Text style={styles.emptyText}>
            {orders.length
              ? "Prueba con otro filtro, número de orden o estado de pago."
              : "Cuando confirmes una compra real, aparecerá aquí automáticamente."}
          </Text>

          {orders.length ? (
            <Pressable
              style={styles.emptyBtn}
              onPress={() => {
                setSearch("");
                setActiveFilter("Todos");
              }}
            >
              <Text style={styles.emptyBtnText}>Limpiar filtros</Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.emptyBtn}
              onPress={() => nav.replace(nav.routes.home)}
            >
              <Text style={styles.emptyBtnText}>Explorar productos</Text>
            </Pressable>
          )}
        </View>
      ) : (
        filteredOrders.map((order, index) => {
          const meta = STATUS_META[order.status];
          const payment = PAYMENT_META[order.paymentStatus];

          return (
            <Animated.View key={order.id} entering={FadeInUp.delay(index * 65)}>
              <Pressable
                style={({ pressed }) => [
                  styles.orderCard,
                  pressed && styles.orderCardPressed,
                ]}
                onPress={() => openTracking(order.orderId)}
              >
                <View
                  style={[
                    styles.orderIcon,
                    { backgroundColor: `${meta.color}18` },
                  ]}
                >
                  <Ionicons name={meta.icon} size={26} color={meta.color} />
                </View>

                <View style={styles.orderInfo}>
                  <View style={styles.orderTop}>
                    <Text style={styles.orderId} numberOfLines={1}>
                      Orden #{order.orderId}
                    </Text>

                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color="#94A3B8"
                    />
                  </View>

                  <Text style={styles.date}>{formatDate(order.createdAt)}</Text>
                  <Text style={styles.items}>
                    {order.itemsCount} producto(s)
                  </Text>

                  <View style={styles.bottomRow}>
                    <Text style={styles.total}>{formatMoney(order.total)}</Text>

                    <View
                      style={[
                        styles.statusPill,
                        { backgroundColor: `${meta.color}22` },
                      ]}
                    >
                      <Ionicons
                        name="ellipse"
                        size={8}
                        color={meta.color}
                        style={{ marginRight: 5 }}
                      />
                      <Text style={[styles.statusText, { color: meta.color }]}>
                        {meta.label}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.paymentPill,
                      { backgroundColor: `${payment.color}18` },
                    ]}
                  >
                    <Ionicons
                      name="card-outline"
                      size={13}
                      color={payment.color}
                    />
                    <Text style={[styles.paymentText, { color: payment.color }]}>
                      {payment.label}
                    </Text>
                  </View>
                </View>
              </Pressable>
            </Animated.View>
          );
        })
      )}
    </ScrollView>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={18} color={Colors.light.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 44 },
  pressed: { opacity: 0.65 },
  center: {
    flex: 1,
    backgroundColor: Colors.light.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  centerTitle: {
    marginTop: 14,
    fontSize: 21,
    fontWeight: "900",
    color: Colors.light.text,
    textAlign: "center",
  },
  centerText: {
    marginTop: 6,
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    fontWeight: "600",
  },
  primaryBtn: {
    marginTop: 18,
    backgroundColor: Colors.light.primary,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  primaryBtnText: { color: "#fff", fontWeight: "900" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
    gap: 14,
  },
  header: { fontSize: 29, fontWeight: "900", color: Colors.light.text },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: Colors.light.textSecondary,
    fontWeight: "600",
    lineHeight: 18,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    backgroundColor: Colors.light.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryCard: {
    backgroundColor: "#0F172A",
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryLabel: {
    color: "#CBD5E1",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  summaryValue: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 3,
  },
  summaryHint: {
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  summaryRight: { alignItems: "flex-end" },
  summaryAmountLabel: { color: "#CBD5E1", fontSize: 11, fontWeight: "800" },
  summaryAmountValue: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 4,
  },
  quickStats: { flexDirection: "row", gap: 10, marginBottom: 14 },
  statCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  statValue: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: "900",
    color: Colors.light.text,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    fontWeight: "800",
    marginTop: 1,
  },
  searchBox: {
    height: 50,
    backgroundColor: "#fff",
    borderRadius: 17,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: Colors.light.text,
    fontWeight: "600",
  },
  filters: { gap: 8, paddingBottom: 14 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  filterChipActive: {
    backgroundColor: Colors.light.primary,
    borderColor: Colors.light.primary,
  },
  filterText: { color: Colors.light.text, fontWeight: "800", fontSize: 13 },
  filterTextActive: { color: "#fff" },
  orderCard: {
    backgroundColor: "#fff",
    flexDirection: "row",
    padding: 14,
    borderRadius: 20,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  orderCardPressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  orderIcon: {
    width: 76,
    height: 76,
    borderRadius: 20,
    marginRight: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  orderInfo: { flex: 1, justifyContent: "center" },
  orderTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  orderId: {
    flex: 1,
    fontSize: 15,
    fontWeight: "900",
    color: Colors.light.text,
    marginRight: 6,
  },
  date: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 3,
    fontWeight: "600",
  },
  items: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 4,
    fontWeight: "600",
  },
  bottomRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  total: { fontSize: 16, fontWeight: "900", color: Colors.light.primary },
  statusPill: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
  },
  statusText: { fontSize: 11, fontWeight: "900" },
  paymentPill: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  paymentText: { fontSize: 11, fontWeight: "900" },
  emptyState: {
    marginTop: 64,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: 28,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    marginTop: 14,
    fontSize: 19,
    fontWeight: "900",
    color: Colors.light.text,
  },
  emptyText: {
    marginTop: 6,
    fontSize: 14,
    textAlign: "center",
    color: Colors.light.textSecondary,
    lineHeight: 20,
    fontWeight: "600",
  },
  emptyBtn: {
    marginTop: 16,
    backgroundColor: Colors.light.primary,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  emptyBtnText: { color: "#fff", fontWeight: "900" },
});