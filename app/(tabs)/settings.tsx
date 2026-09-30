import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import Colors from "../../constants/Colors";
import { useAuth } from "../../context/AuthContext";
import { useThemeContext } from "../../context/ThemeContext";
import { useAppNavigation } from "../../navigation/useAppNavigation";

type SettingOption = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
};

export default function SettingsScreen() {
  const nav = useAppNavigation();
  const { user, logout } = useAuth();
  const { isDarkMode, toggleTheme } = useThemeContext();

  const displayName = user?.displayName || "Usuario ALAIA";
  const email = user?.email || "usuario@example.com";
  const avatar =
    user?.photoURL || "https://cdn-icons-png.flaticon.com/512/3177/3177440.png";

  const openSupportEmail = async () => {
    const url = "mailto:support@alaia.app?subject=Soporte%20ALAIA";

    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
        return;
      }
    } catch {}

    Alert.alert("Soporte", "Escríbenos a support@alaia.app");
  };

  const options: SettingOption[] = [
    {
      title: "Cuenta",
      icon: "person-outline",
      color: Colors.light.primary,
      onPress: () => nav.push(nav.routes.profileInfo),
    },
    {
      title: "Notificaciones",
      icon: "notifications-outline",
      color: "#F59E0B",
      onPress: () => nav.push(nav.routes.notifications),
    },
    {
      title: "Pagos",
      icon: "card-outline",
      color: "#10B981",
      onPress: () =>
        Alert.alert("Pagos", "La configuración de pagos estará disponible pronto."),
    },
    {
      title: "Direcciones",
      icon: "location-outline",
      color: "#3B82F6",
      onPress: () =>
        Alert.alert("Direcciones", "La gestión de direcciones estará disponible pronto."),
    },
    {
      title: "Seguridad",
      icon: "shield-checkmark-outline",
      color: "#EF4444",
      onPress: () =>
        Alert.alert("Seguridad", "Las opciones de seguridad estarán disponibles pronto."),
    },
    {
      title: isDarkMode ? "Modo claro" : "Modo oscuro",
      icon: isDarkMode ? "sunny-outline" : "moon-outline",
      color: "#6366F1",
      onPress: toggleTheme,
    },
  ];

  const supportOptions: SettingOption[] = [
    {
      title: "Centro de ayuda",
      icon: "help-circle-outline",
      color: "#6366F1",
      onPress: () =>
        Alert.alert(
          "Centro de ayuda",
          "Puedes contactarnos desde la opción Contáctanos."
        ),
    },
    {
      title: "Contáctanos",
      icon: "chatbubble-ellipses-outline",
      color: "#0EA5E9",
      onPress: openSupportEmail,
    },
    {
      title: "Privacidad",
      icon: "lock-closed-outline",
      color: "#64748B",
      onPress: () =>
        Alert.alert(
          "Privacidad",
          "Tu privacidad y seguridad estarán disponibles próximamente."
        ),
    },
  ];

  const handleLogout = () => {
    Alert.alert("Cerrar sesión", "¿Deseas cerrar tu sesión?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Salir",
        style: "destructive",
        onPress: async () => {
          try {
            await logout();
            nav.replace("/(auth)/login");
          } catch {
            Alert.alert("Error", "No se pudo cerrar sesión.");
          }
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View entering={FadeInDown.duration(350)} style={styles.profileCard}>
        <Image source={{ uri: avatar }} style={styles.avatar} />

        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.email}>{email}</Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.editBtn, pressed && styles.pressed]}
          onPress={() => nav.push(nav.routes.profileInfo)}
        >
          <Ionicons name="create-outline" size={20} color="#64748B" />
        </Pressable>
      </Animated.View>

      <SettingsSection title="Configuración" options={options} delay={150} />

      <SettingsSection title="Soporte" options={supportOptions} delay={350} />

      <Animated.View entering={FadeInDown.delay(550)}>
        <Pressable
          style={({ pressed }) => [styles.logoutBtn, pressed && styles.pressed]}
          onPress={handleLogout}
        >
          <MaterialCommunityIcons name="logout" size={20} color="#EF4444" />
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </Pressable>
      </Animated.View>

      <View style={{ height: 50 }} />
    </ScrollView>
  );
}

function SettingsSection({
  title,
  options,
  delay,
}: {
  title: string;
  options: SettingOption[];
  delay: number;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(delay)} style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>

      {options.map((opt, index) => (
        <Animated.View key={opt.title} entering={FadeInDown.delay(delay + index * 70)}>
          <Pressable
            style={({ pressed }) => [styles.optionRow, pressed && styles.pressed]}
            onPress={opt.onPress}
          >
            <View style={[styles.iconBox, { backgroundColor: `${opt.color}22` }]}>
              <Ionicons name={opt.icon} size={22} color={opt.color} />
            </View>

            <Text style={styles.optionText}>{opt.title}</Text>

            <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
          </Pressable>
        </Animated.View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  content: {
    padding: 20,
    paddingBottom: 50,
  },
  pressed: {
    opacity: 0.55,
  },
  profileCard: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    padding: 18,
    borderRadius: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    marginBottom: 26,
    elevation: 3,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 999,
    marginRight: 16,
    backgroundColor: "#E5E7EB",
  },
  name: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.light.text,
  },
  email: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
    fontWeight: "500",
  },
  editBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.light.textSecondary,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  optionRow: {
    backgroundColor: "#FFF",
    flexDirection: "row",
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  optionText: {
    flex: 1,
    marginLeft: 14,
    fontSize: 15,
    fontWeight: "700",
    color: Colors.light.text,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  logoutBtn: {
    marginTop: 20,
    backgroundColor: "#FEE2E2",
    paddingVertical: 14,
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  logoutText: {
    color: "#EF4444",
    fontSize: 15,
    fontWeight: "800",
  },
});