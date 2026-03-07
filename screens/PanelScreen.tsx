// screens/PanelScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo } from "react";
import {
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from "react-native-reanimated";
import { useThemeContext } from "../context/ThemeContext";

// ─────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────

type PanelAction = {
  id: string;
  label: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  gradient: [string, string];
  screen?: string;
  isToggleTheme?: boolean;
};

// ─────────────────────────────────────────────
// Pantalla principal
// ─────────────────────────────────────────────

const PanelScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { colors, isDarkMode, toggleTheme } = useThemeContext();

  const actions: PanelAction[] = useMemo(
    () => [
      {
        id: "profile",
        label: "Mi perfil",
        subtitle: "Datos personales y seguridad",
        icon: "person-circle-outline",
        gradient: ["#6366F1", "#8B5CF6"],
        screen: "Profile",
      },
      {
        id: "orders",
        label: "Mis pedidos",
        subtitle: "Historial y estado de compras",
        icon: "bag-handle-outline",
        gradient: ["#22C55E", "#4ADE80"],
        screen: "OrderHistory",
      },
      {
        id: "settings",
        label: "Configuración",
        subtitle: "Preferencias de la aplicación",
        icon: "settings-outline",
        gradient: ["#0EA5E9", "#38BDF8"],
        screen: "Settings",
      },
      {
        id: "theme",
        label: isDarkMode ? "Modo claro" : "Modo oscuro",
        subtitle: isDarkMode
          ? "Toca para usar un fondo claro"
          : "Toca para activar modo noche",
        icon: isDarkMode ? "sunny-outline" : "moon-outline",
        gradient: isDarkMode
          ? ["#FACC15", "#FDE68A"]
          : ["#A855F7", "#D946EF"],
        isToggleTheme: true,
      },
    ],
    [isDarkMode]
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER ELEGANTE */}
        <View style={styles.header}>
          <Text style={[styles.kicker, { color: colors.textSecondary }]}>
            Panel principal
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>
            Bienvenido a ALAIA 👋
          </Text>
          <Text
            style={[
              styles.subtitle,
              { color: colors.textSecondary || "#6B7280" },
            ]}
          >
            Gestiona tu perfil, pedidos, ajustes y apariencia desde un panel
            moderno y organizado.
          </Text>
        </View>

        {/* GRID DE TARJETAS */}
        <View style={styles.grid}>
          {actions.map((action) => (
            <PanelCard
              key={action.id}
              action={action}
              onPress={() => {
                if (action.isToggleTheme) {
                  toggleTheme();
                  return;
                }
                if (action.screen) {
                  navigation.navigate(action.screen);
                }
              }}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

export default PanelScreen;

// ─────────────────────────────────────────────
// Tarjeta individual
// ─────────────────────────────────────────────

type PanelCardProps = {
  action: PanelAction;
  onPress: () => void;
};

const PanelCard: React.FC<PanelCardProps> = ({ action, onPress }) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.94, { damping: 18, stiffness: 200 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 18, stiffness: 200 });
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.cardWrapper}
    >
      <Animated.View style={[styles.cardShadow, animatedStyle]}>
        <LinearGradient
          colors={action.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cardGradient}
        >
          <View style={styles.cardTopRow}>
            <View style={styles.iconCircle}>
              <Ionicons name={action.icon} size={30} color="#FFFFFF" />
            </View>

            <View style={styles.chevron}>
              <Ionicons
                name="chevron-forward-outline"
                size={18}
                color="rgba(255,255,255,0.75)"
              />
            </View>
          </View>

          <Text style={styles.cardTitle}>{action.label}</Text>
          <Text style={styles.cardSubtitle}>{action.subtitle}</Text>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
};

// ─────────────────────────────────────────────
// Estilos
// ─────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: Platform.OS === "ios" ? 60 : 30,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  header: {
    marginBottom: 26,
  },
  kicker: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  cardWrapper: {
    width: "48%",
    marginBottom: 18,
  },

  cardShadow: {
    borderRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 7,
    overflow: "hidden",
  },
  cardGradient: {
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 14,
  },

  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.18)",
    justifyContent: "center",
    alignItems: "center",
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255,255,255,0.85)",
  },

  chevron: {
    padding: 4,
  },
});