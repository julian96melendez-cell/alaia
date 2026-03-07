import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import Colors from "../../constants/Colors";

// -------------------------------
// 🔵 Tipos para TypeScript
// -------------------------------
type OrderStatus = "En camino" | "Entregado" | "Cancelado";

interface Order {
  id: string;
  date: string;
  total: string;
  status: OrderStatus;
  items: number;
  image: string;
}

// -------------------------------
// 🎨 Colores según estado
// -------------------------------
const statusColor: Record<OrderStatus, string> = {
  "En camino": "#2563EB", // Azul
  Entregado: "#16A34A", // Verde
  Cancelado: "#DC2626", // Rojo
};

// -------------------------------
// 📦 Ejemplo de pedidos (luego se conecta con Firebase)
// -------------------------------
const orders: Order[] = [
  {
    id: "ORD-29182",
    date: "28 Ene 2025",
    total: "$129.00",
    status: "En camino",
    items: 2,
    image: "https://i.imgur.com/UYiroysl.jpg",
  },
  {
    id: "ORD-29135",
    date: "20 Ene 2025",
    total: "$59.00",
    status: "Entregado",
    items: 1,
    image: "https://i.imgur.com/t6nQKFFl.jpg",
  },
  {
    id: "ORD-29092",
    date: "12 Ene 2025",
    total: "$89.00",
    status: "Cancelado",
    items: 1,
    image: "https://i.imgur.com/MABUbpDl.jpg",
  },
];

export default function OrdersScreen() {
  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.header}>📦 Mis Pedidos</Text>

      {orders.map((order, index) => (
        <Animated.View
          key={order.id}
          entering={FadeInUp.delay(index * 120)}
          style={styles.orderCard}
        >
          {/* 🖼 Imagen */}
          <Image source={{ uri: order.image }} style={styles.image} />

          {/* 📄 Información */}
          <View style={styles.info}>
            <Text style={styles.orderId}>{order.id}</Text>
            <Text style={styles.date}>{order.date}</Text>

            <Text style={styles.items}>{order.items} producto(s)</Text>

            <Text style={styles.total}>{order.total}</Text>
          </View>

          {/* 🟢 Estado */}
          <View
            style={[
              styles.status,
              { backgroundColor: statusColor[order.status] + "22" },
            ]}
          >
            <Ionicons
              name="ellipse"
              size={10}
              color={statusColor[order.status]}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.statusText,
                { color: statusColor[order.status] },
              ]}
            >
              {order.status}
            </Text>
          </View>
        </Animated.View>
      ))}
    </ScrollView>
  );
}

// -------------------------------
// 🎨 Estilos
// -------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    paddingHorizontal: 20,
    paddingTop: 20,
  },

  header: {
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 25,
    color: Colors.light.text,
  },

  orderCard: {
    backgroundColor: "#fff",
    flexDirection: "row",
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
  },

  image: {
    width: 70,
    height: 70,
    borderRadius: 12,
    marginRight: 14,
  },

  info: {
    flex: 1,
    justifyContent: "center",
  },

  orderId: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.light.text,
  },

  date: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },

  items: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 4,
  },

  total: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.light.primary,
    marginTop: 8,
  },

  status: {
    alignSelf: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
  },

  statusText: {
    fontSize: 12,
    fontWeight: "700",
  },
});