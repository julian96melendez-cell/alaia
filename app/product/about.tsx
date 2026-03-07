import { Ionicons } from "@expo/vector-icons";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import Colors from "../../constants/Colors";

export default function AboutScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      
      {/* LOGO */}
      <Animated.View entering={FadeInUp.duration(600)}>
        <Image
          source={require("../../assets/logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>

      {/* TÍTULO */}
      <Animated.Text entering={FadeInUp.delay(150).duration(600)} style={styles.title}>
        Sobre ALAIA
      </Animated.Text>

      {/* TEXTO PRINCIPAL */}
      <Animated.Text entering={FadeInUp.delay(250).duration(600)} style={styles.description}>
        ALAIA es una plataforma moderna diseñada para ofrecer una experiencia de compra superior. 
        Combinamos tecnología, diseño y velocidad para brindarte una app segura, intuitiva y 
        visualmente impecable.
      </Animated.Text>

      {/* MISIÓN */}
      <Animated.View entering={FadeInUp.delay(300).duration(600)} style={styles.missionBox}>
        <Ionicons name="star-outline" size={32} color={Colors.light.primary} />
        <Text style={styles.missionTitle}>Nuestra misión</Text>
        <Text style={styles.missionText}>
          Crear una experiencia digital sólida, elegante y futurista que permita 
          a los usuarios encontrar productos increíbles, ahorrar tiempo y 
          disfrutar de una navegación fluida y confiable.
        </Text>
      </Animated.View>

      {/* CARACTERÍSTICAS */}
      <Text style={styles.sectionTitle}>Características Principales</Text>

      {[
        {
          icon: "shield-checkmark",
          color: "#6366F1",
          title: "Seguridad avanzada",
          text: "Protección total con encriptación moderna.",
        },
        {
          icon: "flash",
          color: "#F59E0B",
          title: "Rendimiento superior",
          text: "Experiencia rápida, fluida y estable.",
        },
        {
          icon: "color-palette",
          color: "#10B981",
          title: "Diseño premium",
          text: "Interfaz limpia, moderna y elegante.",
        },
        {
          icon: "apps-outline",
          color: "#3B82F6",
          title: "Organización inteligente",
          text: "Contenido estructurado para encontrar todo fácil.",
        },
      ].map((item, i) => (
        <Animated.View
          key={i}
          entering={FadeInUp.delay(400 + i * 100).duration(600)}
          style={styles.featureCard}
        >
          <Ionicons name={item.icon as any} size={32} color={item.color} />
          <Text style={styles.featureTitle}>{item.title}</Text>
          <Text style={styles.featureText}>{item.text}</Text>
        </Animated.View>
      ))}

      {/* VALORES */}
      <Text style={styles.sectionTitle}>Nuestros Valores</Text>

      <Animated.View entering={FadeInUp.delay(900).duration(600)} style={styles.valuesRow}>
        {[
          { label: "Innovación", icon: "bulb-outline" },
          { label: "Confianza", icon: "shield-outline" },
          { label: "Calidad", icon: "ribbon-outline" },
        ].map((v, i) => (
          <View key={i} style={styles.valueItem}>
            <Ionicons name={v.icon as any} size={26} color={Colors.light.primary} />
            <Text style={styles.valueLabel}>{v.label}</Text>
          </View>
        ))}
      </Animated.View>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    alignItems: "center",
  },

  // Logo
  logo: {
    width: 160,
    height: 160,
    marginBottom: 10,
  },

  // Textos
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    marginBottom: 14,
  },
  description: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
    paddingHorizontal: 12,
  },

  // Misión
  missionBox: {
    width: "100%",
    backgroundColor: "#EEF2FF",
    padding: 20,
    borderRadius: 20,
    alignItems: "center",
    marginBottom: 28,
  },
  missionTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginTop: 10,
    marginBottom: 6,
    color: Colors.light.primary,
  },
  missionText: {
    textAlign: "center",
    color: "#4B5563",
    fontSize: 15,
    lineHeight: 22,
  },

  // Secciones
  sectionTitle: {
    width: "100%",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 16,
    marginTop: 10,
    color: "#111827",
  },

  // Cards
  featureCard: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 20,
    marginBottom: 18,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    alignItems: "center",
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 10,
    color: "#111827",
  },
  featureText: {
    color: "#6B7280",
    fontSize: 14,
    textAlign: "center",
    marginTop: 6,
  },

  // Valores
  valuesRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginTop: 10,
  },
  valueItem: {
    alignItems: "center",
  },
  valueLabel: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
});