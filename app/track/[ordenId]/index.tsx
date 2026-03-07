// app/track/[ordenId]/index.tsx

import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import TrackingClient from "./TrackingClient";

export default function TrackOrdenPage() {
  const params = useLocalSearchParams();
  const ordenId =
    typeof params.ordenId === "string"
      ? params.ordenId
      : Array.isArray(params.ordenId)
      ? params.ordenId[0]
      : undefined;

  if (!ordenId) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Orden no válida</Text>
      </View>
    );
  }

  return <TrackingClient ordenId={ordenId} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    fontSize: 16,
    color: "red",
  },
});