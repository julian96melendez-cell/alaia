// screens/OrdersScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { db } from "../../firebase/firebaseConfig";
import { useAuth } from "../context/AuthContext";
import useTheme from "../hooks/useTheme";

type OrderStatus =
  | "pendiente_pago"
  | "confirmada"
  | "en_preparacion"
  | "en_camino"
  | "entregada"
  | "cancelada";

type Order = {
  id: string;
  orderId: string;
  status: OrderStatus;
  paymentStatus: string;
  total: number;
  itemsCount: number;
  createdAt?: any;
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente_pago: "Pendiente de pago",
  confirmada: "Confirmada",
  en_preparacion: "En preparación",
  en_camino: "En camino",
  entregada: "Entregada",
  cancelada: "Cancelada",
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  pendiente_pago: "#F59E0B",
  confirmada: "#6366F1",
  en_preparacion: "#7C3AED",
  en_camino: "#2563EB",
  entregada: "#16A34A",
  cancelada: "#DC2626",
};

function normalizeStatus(value?: string): OrderStatus {
  const valid: OrderStatus[] = [
    "pendiente_pago",
    "confirmada",
    "en_preparacion",
    "en_camino",
    "entregada",
    "cancelada",
  ];

  return valid.includes(value as OrderStatus)
    ? (value as OrderStatus)
    : "pendiente_pago";
}

function normalizeOrder(id: string, data: any): Order {
  return {
    id,
    orderId: String(data.orderId || id),
    status: normalizeStatus(data.status),
    paymentStatus: String(data.paymentStatus || "pendiente"),
    total: Number(data.total || 0),
    itemsCount: Number(data.itemsCount || data.items?.length || 0),
    createdAt: data.createdAt || null,
  };
}

function formatDate(value?: any) {
  try {
    if (!value) return "Sin fecha";

    const date =
      typeof value?.toDate === "function"
        ? value.toDate()
        : typeof value === "string" || typeof value === "number"
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
  const { colors, isDarkMode } = useTheme();
  const navigation = useNavigation<any>();
  const { user, loading: authLoading } = useAuth();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    if (!user?.uid) {
      setOrders([]);
      setLoadingOrders(false);
      setRefreshing(false);
      return;
    }

    setLoadingOrders(true);

    let unsubscribe: (() => void) | undefined;

    try {
      const ordersRef = collection(db, "users", user.uid, "orders");
      const ordersQuery = query(ordersRef, orderBy("createdAt", "desc"));

      unsubscribe = onSnapshot(
        ordersQuery,
        (snapshot) => {
          const list = snapshot.docs.map((snap) =>
            normalizeOrder(snap.id, snap.data())
          );

          setOrders(list);
          setLoadingOrders(false);
          setRefreshing(false);
        },
        (error) => {
          console.log("ORDERS SNAPSHOT ERROR:", error);
          setLoadingOrders(false);
          setRefreshing(false);
          Alert.alert("Error", "No se pudieron cargar tus pedidos.");
        }
      );
    } catch (error) {
      console.log("ORDERS QUERY CREATE ERROR:", error);
      setLoadingOrders(false);
      setRefreshing(false);
      Alert.alert("Error", "No se pudo crear la consulta de pedidos.");
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [authLoading, user?.uid]);

  const stats = useMemo(() => {
    const activeStatuses: OrderStatus[] = [
      "pendiente_pago",
      "confirmada",
      "en_preparacion",
      "en_camino",
    ];

    return {
      total: orders.length,
      active: orders.filter((o) => activeStatuses.includes(o.status)).length,
      delivered: orders.filter((o) => o.status === "entregada").length,
      canceled: orders.filter((o) => o.status === "cancelada").length,
    };
  }, [orders]);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 700);
  };

  const cancelOrder = async (order: Order) => {
    if (!user?.uid) return;

    if (["en_camino", "entregada", "cancelada"].includes(order.status)) {
      Alert.alert(
        "No se puede cancelar",
        "Esta orden ya está en camino, entregada o cancelada."
      );
      return;
    }

    Alert.alert("Cancelar orden", "¿Seguro que deseas cancelar esta orden?", [
      { text: "No", style: "cancel" },
      {
        text: "Sí, cancelar",
        style: "destructive",
        onPress: async () => {
          try {
            const ref = doc(db, "users", user.uid, "orders", order.id);

            await updateDoc(ref, {
              status: "cancelada",
              updatedAt: Timestamp.now(),
              canceledAt: Timestamp.now(),
              "tracking.currentStep": "cancelada",
            });
          } catch (error) {
            console.log("CANCEL ORDER ERROR:", error);
            Alert.alert("Error", "No se pudo cancelar la orden.");
          }
        },
      },
    ]);
  };

  if (authLoading || loadingOrders) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.text }]}>
          Cargando pedidos…
        </Text>
      </View>
    );
  }

  if (!user?.uid) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="log-in-outline" size={56} color={colors.primary} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>
          Inicia sesión
        </Text>
        <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
          Necesitas iniciar sesión para ver tus pedidos.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Mis pedidos
        </Text>

        <View style={{ width: 22 }} />
      </View>

      {orders.length > 0 && (
        <View style={styles.statsWrap}>
          <View style={styles.statsChip}>
            <Text style={styles.statsLabel}>Pedidos</Text>
            <Text style={[styles.statsValue, { color: colors.text }]}>
              {stats.total}
            </Text>
          </View>

          <View style={styles.statsChip}>
            <Text style={styles.statsLabel}>En curso</Text>
            <Text style={[styles.statsValue, { color: colors.primary }]}>
              {stats.active}
            </Text>
          </View>

          <View style={styles.statsChip}>
            <Text style={styles.statsLabel}>Entregados</Text>
            <Text style={[styles.statsValue, { color: "#16A34A" }]}>
              {stats.delivered}
            </Text>
          </View>
        </View>
      )}

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 32,
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={56} color={colors.primary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              Aún no tienes pedidos
            </Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              Cuando confirmes una compra, aparecerá aquí automáticamente.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const statusColor = STATUS_COLORS[item.status];
          const statusLabel = STATUS_LABELS[item.status];

          return (
            <TouchableOpacity
              activeOpacity={0.9}
              style={[
                styles.card,
                {
                  backgroundColor: colors.card,
                  shadowColor: isDarkMode ? "#000" : "#CBD5E1",
                },
              ]}
              onPress={() =>
                navigation.navigate("OrderDetail", {
                  orderId: item.orderId || item.id,
                })
              }
            >
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.orderId, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    Orden #{item.orderId}
                  </Text>

                  <Text
                    style={[
                      styles.date,
                      { color: colors.textSecondary || "#94A3B8" },
                    ]}
                  >
                    {formatDate(item.createdAt)}
                  </Text>

                  <Text
                    style={[
                      styles.items,
                      { color: colors.textSecondary || "#94A3B8" },
                    ]}
                  >
                    {item.itemsCount} producto(s)
                  </Text>
                </View>

                <View
                  style={[
                    styles.badge,
                    { backgroundColor: `${statusColor}22` },
                  ]}
                >
                  <Text style={[styles.badgeText, { color: statusColor }]}>
                    {statusLabel}
                  </Text>
                </View>
              </View>

              <View style={styles.footerRow}>
                <Text style={[styles.total, { color: colors.text }]}>
                  Total:{" "}
                  <Text style={{ color: colors.primary }}>
                    {formatMoney(item.total)}
                  </Text>
                </Text>

                <View style={styles.actionsRow}>
                  {!["en_camino", "entregada", "cancelada"].includes(
                    item.status
                  ) && (
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={() => cancelOrder(item)}
                    >
                      <Ionicons
                        name="close-circle-outline"
                        size={16}
                        color="#EF4444"
                      />
                      <Text style={styles.cancelText}>Cancelar</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[
                      styles.viewBtn,
                      { backgroundColor: colors.primary },
                    ]}
                    onPress={() =>
                      navigation.navigate("OrderDetail", {
                        orderId: item.orderId || item.id,
                      })
                    }
                  >
                    <Ionicons name="eye-outline" size={16} color="#fff" />
                    <Text style={styles.viewText}>Ver</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: {
    marginTop: 8,
    fontWeight: "700",
  },
  header: {
    height: 56,
    paddingHorizontal: 16,
    marginTop: Platform.OS === "ios" ? 6 : 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "900",
  },
  statsWrap: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    flexDirection: "row",
    gap: 10,
  },
  statsChip: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "rgba(148, 163, 184, 0.14)",
  },
  statsLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748B",
    textTransform: "uppercase",
  },
  statsValue: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: "900",
  },
  card: {
    borderRadius: 18,
    padding: 15,
    marginBottom: 14,
    elevation: 3,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  orderId: {
    fontSize: 15,
    fontWeight: "900",
  },
  date: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  items: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "900",
  },
  footerRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  total: {
    fontSize: 14,
    fontWeight: "900",
    flex: 1,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  cancelBtn: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#EF4444",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  cancelText: {
    color: "#EF4444",
    fontWeight: "900",
    fontSize: 12,
  },
  viewBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  viewText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    marginTop: 14,
    fontSize: 19,
    fontWeight: "900",
    textAlign: "center",
  },
  emptySub: {
    marginTop: 6,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});