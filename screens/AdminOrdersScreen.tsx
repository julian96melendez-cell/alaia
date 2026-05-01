import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { AdminOrdersAPI } from "../services/api";

type Orden = {
  _id: string;
  orderNumber?: number;
  total?: number;
  moneda?: string;
  estadoPago?: string;
  estadoFulfillment?: string;
  clienteEmail?: string;
  createdAt?: string;
  usuario?: {
    nombre?: string;
    email?: string;
    rol?: string;
  };
  items?: Array<{
    nombre?: string;
    cantidad?: number;
    precioUnitario?: number;
  }>;
};

const PAYMENT_FILTERS = ["all", "pendiente", "pagado", "fallido"];
const FULFILLMENT_STATES = [
  "pendiente",
  "procesando",
  "enviado",
  "entregado",
  "cancelado",
];

export default function AdminOrdersScreen() {
  const [token, setToken] = useState("");
  const [orders, setOrders] = useState<Orden[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [estadoPago, setEstadoPago] = useState("all");
  const [q, setQ] = useState("");

  const canLoad = useMemo(() => token.trim().length > 20, [token]);

  async function loadOrders() {
    if (!canLoad) {
      Alert.alert("Token requerido", "Pega el token admin para cargar órdenes.");
      return;
    }

    try {
      setLoading(true);

      const resp = await AdminOrdersAPI.list(token.trim(), {
        estadoPago,
        q,
        limit: 50,
        page: 1,
      });

      setOrders(resp?.data || []);
    } catch (error: any) {
      Alert.alert("Error", error?.message || "No se pudieron cargar órdenes");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function updateFulfillment(orderId: string, estado: string) {
    try {
      await AdminOrdersAPI.updateFulfillment(token.trim(), orderId, estado);
      await loadOrders();
    } catch (error: any) {
      Alert.alert("Error", error?.message || "No se pudo actualizar");
    }
  }

  useEffect(() => {
    if (canLoad) loadOrders();
  }, [estadoPago]);

  const renderOrder = ({ item }: { item: Orden }) => {
    const email =
      item.usuario?.email || item.clienteEmail || "Cliente invitado";

    return (
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.orderId}>#{item.orderNumber || item._id.slice(-6)}</Text>
          <Text style={styles.total}>
            {(item.total || 0).toFixed(2)} {(item.moneda || "USD").toUpperCase()}
          </Text>
        </View>

        <Text style={styles.email}>{email}</Text>

        <View style={styles.badges}>
          <Text style={[styles.badge, styles.paymentBadge]}>
            Pago: {item.estadoPago || "pendiente"}
          </Text>
          <Text style={[styles.badge, styles.fulfillmentBadge]}>
            Envío: {item.estadoFulfillment || "pendiente"}
          </Text>
        </View>

        <Text style={styles.items}>
          {(item.items || [])
            .map((p) => `${p.nombre || "Producto"} x${p.cantidad || 1}`)
            .join(", ")}
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.actions}>
            {FULFILLMENT_STATES.map((estado) => (
              <TouchableOpacity
                key={estado}
                style={styles.actionButton}
                onPress={() => updateFulfillment(item._id, estado)}
              >
                <Text style={styles.actionText}>{estado}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <Text style={styles.date}>
          {item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Órdenes Admin</Text>

      <TextInput
        style={styles.input}
        placeholder="Pega aquí tu token admin"
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        secureTextEntry
      />

      <TextInput
        style={styles.input}
        placeholder="Buscar por ID, email o producto"
        value={q}
        onChangeText={setQ}
        autoCapitalize="none"
        onSubmitEditing={loadOrders}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.filters}>
          {PAYMENT_FILTERS.map((f) => (
            <TouchableOpacity
              key={f}
              style={[
                styles.filterButton,
                estadoPago === f && styles.filterButtonActive,
              ]}
              onPress={() => setEstadoPago(f)}
            >
              <Text
                style={[
                  styles.filterText,
                  estadoPago === f && styles.filterTextActive,
                ]}
              >
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <TouchableOpacity style={styles.loadButton} onPress={loadOrders}>
        <Text style={styles.loadText}>Cargar órdenes</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item._id}
          renderItem={renderOrder}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadOrders();
              }}
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>No hay órdenes para mostrar.</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#f6f6f6",
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 16,
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  filters: {
    flexDirection: "row",
    gap: 8,
    marginVertical: 8,
  },
  filterButton: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  filterButtonActive: {
    backgroundColor: "#111827",
  },
  filterText: {
    color: "#111827",
    fontWeight: "600",
  },
  filterTextActive: {
    color: "#fff",
  },
  loadButton: {
    backgroundColor: "#111827",
    padding: 14,
    borderRadius: 12,
    marginVertical: 10,
    alignItems: "center",
  },
  loadText: {
    color: "#fff",
    fontWeight: "700",
  },
  card: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  orderId: {
    fontWeight: "800",
    fontSize: 16,
  },
  total: {
    fontWeight: "800",
    fontSize: 16,
  },
  email: {
    marginTop: 6,
    color: "#4b5563",
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  badge: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    overflow: "hidden",
    fontWeight: "700",
  },
  paymentBadge: {
    backgroundColor: "#dcfce7",
    color: "#166534",
  },
  fulfillmentBadge: {
    backgroundColor: "#e0f2fe",
    color: "#075985",
  },
  items: {
    marginTop: 12,
    color: "#374151",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },
  actionButton: {
    backgroundColor: "#f3f4f6",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  actionText: {
    fontWeight: "700",
    color: "#111827",
  },
  date: {
    marginTop: 10,
    color: "#6b7280",
    fontSize: 12,
  },
  empty: {
    textAlign: "center",
    marginTop: 40,
    color: "#6b7280",
  },
});