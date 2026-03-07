import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Colors from "../../constants/Colors";

export default function TwoScreen() {
  const insights = [
    {
      title: "Ventas del día",
      value: "$1,245",
      positive: true,
      hint: "+12% respecto a ayer",
    },
    {
      title: "Usuarios activos",
      value: "842",
      positive: true,
      hint: "+5% esta semana",
    },
    {
      title: "Reembolsos",
      value: "12",
      positive: false,
      hint: "-3 respecto a ayer",
    },
    {
      title: "Tiempo medio en app",
      value: "4m 21s",
      positive: true,
      hint: "+14% de incremento",
    },
  ];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>📊 Panel de Actividad</Text>
      <Text style={styles.subtitle}>
        Información rápida para tomar mejores decisiones
      </Text>

      <View style={styles.cardsContainer}>
        {insights.map((insight, index) => (
          <View key={index} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{insight.title}</Text>

              <Ionicons
                name={
                  insight.positive
                    ? "trending-up-outline"
                    : "trending-down-outline"
                }
                size={20}
                color={insight.positive ? "#22C55E" : "#F97316"}
              />
            </View>

            <Text style={styles.cardValue}>{insight.value}</Text>
            <Text
              style={[
                styles.cardHint,
                { color: insight.positive ? "#16A34A" : "#EA580C" },
              ]}
            >
              {insight.hint}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ height: 50 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 22,
    backgroundColor: Colors.light.background,
    alignItems: "center",
  },

  title: {
    fontSize: 26,
    fontWeight: "800",
    color: Colors.light.text,
    marginBottom: 4,
  },

  subtitle: {
    fontSize: 15,
    color: Colors.light.textSecondary,
    marginBottom: 28,
    textAlign: "center",
  },

  cardsContainer: {
    width: "100%",
    gap: 16,
  },

  card: {
    backgroundColor: "#fff",
    padding: 18,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.light.text,
  },

  cardValue: {
    fontSize: 26,
    fontWeight: "900",
    marginTop: 6,
    color: Colors.light.text,
  },

  cardHint: {
    fontSize: 13,
    marginTop: 4,
    fontWeight: "600",
  },
});