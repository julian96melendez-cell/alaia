import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

export default function Loading({ label = "Cargando…" }: { label?: string }) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  text: { opacity: 0.7 },
});