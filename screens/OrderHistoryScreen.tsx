// screens/OrderHistoryScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import useTheme from "../hooks/useTheme";

/* ──────────────────────────────────────────────
 * Tipos
 * ────────────────────────────────────────────── */
type OrderStatus = "Entregado" | "Enviado" | "Cancelado" | "Procesando";

type Order = {
  id: string;
  date: string;
  items: number;
  total: number;
  status: OrderStatus;
  deliveryDate: string;
};

/* ──────────────────────────────────────────────
 * Datos Mock
 * ────────────────────────────────────────────── */
const mockOrders: Order[] = [
  {
    id: "ORD-98374",
    date: "2025-10-02",
    items: 3,
    total: 149.99,
    status: "Entregado",
    deliveryDate: "2025-10-05",
  },
  {
    id: "ORD-98291",
    date: "2025-09-27",
    items: 2,
    total: 79.49,
    status: "Enviado",
    deliveryDate: "2025-10-10",
  },
  {
    id: "ORD-98212",
    date: "2025-09-10",
    items: 1,
    total: 59.0,
    status: "Cancelado",
    deliveryDate: "-",
  },
  {
    id: "ORD-98077",
    date: "2025-08-15",
    items: 5,
    total: 229.99,
    status: "Entregado",
    deliveryDate: "2025-08-19",
  },
];

/* ──────────────────────────────────────────────
 * Componente principal
 * ────────────────────────────────────────────── */
export default function OrderHistoryScreen(): React.JSX.Element {
  const { theme, isDarkMode } = useTheme();

  const [orders] = useState<Order[]>(mockOrders);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  // Animación de entrada suave
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 550,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 650,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // Colores por estado
  const getStatusColor = useCallback(
    (status: OrderStatus) => {
      switch (status) {
        case "Entregado":
          return "#16A34A";
        case "Enviado":
          return "#2563EB";
        case "Cancelado":
          return "#DC2626";
        default:
          return theme.colors.primary;
      }
    },
    [theme.colors.primary]
  );

  // Al tocar un pedido
  const handleOrderPress = useCallback((order: Order) => {
    Alert.alert(
      `Detalles del pedido ${order.id}`,
      `🧾 Estado: ${order.status}\n💰 Total: $${order.total.toFixed(
        2
      )}\n📅 Comprado: ${order.date}\n🚚 Entrega: ${order.deliveryDate}`
    );
  }, []);

  // Render de cada card
  const renderOrder = useCallback(
    ({ item }: { item: Order }) => {
      const color = getStatusColor(item.status);

      return (
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={() => handleOrderPress(item)}
          style={[
            styles.card,
            {
              backgroundColor: isDarkMode ? "#1E293B" : "#FFFFFF",
              borderColor: isDarkMode ? "#334155" : "#E5E7EB",
              shadowColor: isDarkMode ? "#000" : "#A5B4FC",
            },
          ]}
        >
          {/* Cabecera: ID + estado */}
          <View style={styles.rowBetween}>
            <Text style={[styles.orderId, { color: theme.colors.text }]}>
              #{item.id}
            </Text>

            <View
              style={[
                styles.statusBadge,
                { backgroundColor: `${color}22` },
              ]}
            >
              <Ionicons
                name={
                  item.status === "Entregado"
                    ? "checkmark-circle-outline"
                    : item.status === "Cancelado"
                    ? "close-circle-outline"
                    : "time-outline"
                }
                size={18}
                color={color}
              />
              <Text style={[styles.statusText, { color }]}>{item.status}</Text>
            </View>
          </View>

          {/* Detalles */}
          <View style={styles.details}>
            <DetailRow
              icon="calendar-outline"
              label="Fecha"
              value={item.date}
              color={theme.colors.text}
              isDark={isDarkMode}
            />

            <DetailRow
              icon="cube-outline"
              label="Artículos"
              value={`${item.items}`}
              color={theme.colors.text}
              isDark={isDarkMode}
            />

            <DetailRow
              icon="cash-outline"
              label="Total"
              value={`$${item.total.toFixed(2)}`}
              color={theme.colors.text}
              isDark={isDarkMode}
            />

            {item.deliveryDate !== "-" && (
              <DetailRow
                icon="car-outline"
                label="Entrega estimada"
                value={item.deliveryDate}
                color={theme.colors.text}
                isDark={isDarkMode}
              />
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [getStatusColor, handleOrderPress, isDarkMode, theme.colors.text]
  );

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.background,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <Text style={[styles.header, { color: theme.colors.text }]}>
        Historial de pedidos 📦
      </Text>

      <FlatList
        data={orders}
        renderItem={renderOrder}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 50 }}
        showsVerticalScrollIndicator={false}
      />
    </Animated.View>
  );
}

/* ──────────────────────────────────────────────
 * Subcomponente fila detalle
 * ────────────────────────────────────────────── */
const DetailRow = ({
  icon,
  label,
  value,
  color,
  isDark,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  color: string;
  isDark: boolean;
}) => (
  <View style={styles.detailRow}>
    <Ionicons
      name={icon}
      size={18}
      color={isDark ? "#94A3B8" : "#64748B"}
    />
    <Text style={[styles.detailText, { color }]}>
      {label}: {value}
    </Text>
  </View>
);

/* ──────────────────────────────────────────────
 * Estilos
 * ────────────────────────────────────────────── */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 18,
    paddingTop: Platform.OS === "ios" ? 60 : 40,
  },
  header: {
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 18,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  orderId: {
    fontSize: 16,
    fontWeight: "800",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  statusText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: "700",
  },
  details: {
    marginTop: 12,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 10,
  },
  detailText: {
    fontSize: 14,
    fontWeight: "600",
  },
});