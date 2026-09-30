import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import TrackingClient from "../../../components/tracking/TrackingClient";

export default function TrackOrdenPage() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const ordenId =
    typeof params.ordenId === "string"
      ? params.ordenId
      : Array.isArray(params.ordenId)
      ? params.ordenId[0]
      : undefined;

  const goToOrders = () => {
    router.replace("/(tabs)/orders" as any);
  };

  if (!ordenId) {
    return (
      <View style={styles.screen}>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color="#DC2626" />

          <Text style={styles.error}>Orden no válida</Text>

          <Text style={styles.subtitle}>
            No pudimos encontrar esta orden. Intenta regresar y volver a abrirla.
          </Text>

          <Pressable style={styles.primaryBtn} onPress={goToOrders}>
            <Text style={styles.primaryText}>Volver a órdenes</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <TrackingClient ordenId={ordenId} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#fff",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  error: {
    fontSize: 18,
    color: "#DC2626",
    fontWeight: "900",
    marginTop: 12,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 18,
  },
  primaryBtn: {
    backgroundColor: "#6366F1",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
  primaryText: {
    color: "#fff",
    fontWeight: "900",
  },
});