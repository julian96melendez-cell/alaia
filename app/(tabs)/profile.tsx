import {
  Feather,
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
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

type ProfileItem = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  showChevron?: boolean;
  danger?: boolean;
};

export default function ProfileScreen() {
  const nav = useAppNavigation();
  const { user, logout } = useAuth();
  const { isDarkMode, toggleTheme } = useThemeContext();

  const displayName = user?.displayName || "Usuario ALAIA";
  const email = user?.email || "usuario@example.com";
  const avatar =
    user?.photoURL || "https://cdn-icons-png.flaticon.com/512/149/149071.png";

  const openEmail = async () => {
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

  const handleLogout = () => {
    Alert.alert("Cerrar sesión", "¿Deseas cerrar sesión ahora?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Cerrar sesión",
        style: "destructive",
        onPress: async () => {
          try {
            await logout();
            nav.replace("/(auth)/login");
          } catch {
            Alert.alert("Error", "No se pudo cerrar sesión. Intenta de nuevo.");
          }
        },
      },
    ]);
  };

  const sections: { title: string; items: ProfileItem[] }[] = [
    {
      title: "Cuenta",
      items: [
        {
          icon: "person-outline",
          label: "Mi información",
          onPress: () => nav.push(nav.routes.profileInfo),
        },
        {
          icon: "receipt-outline",
          label: "Órdenes",
          onPress: () => nav.push(nav.routes.orders),
        },
        {
          icon: "notifications-outline",
          label: "Notificaciones",
          onPress: () => nav.push(nav.routes.notifications),
        },
        {
          icon: "heart-outline",
          label: "Favoritos",
          onPress: () => nav.push(nav.routes.wishlist),
        },
      ],
    },
    {
      title: "Preferencias",
      items: [
        {
          icon: isDarkMode ? "sunny-outline" : "moon-outline",
          label: isDarkMode ? "Modo claro" : "Modo oscuro",
          onPress: toggleTheme,
          showChevron: false,
        },
        {
          icon: "settings-outline",
          label: "Configuración",
          onPress: () => nav.push(nav.routes.settings),
        },
        {
          icon: "language-outline",
          label: "Idioma",
          onPress: () =>
            Alert.alert("Idioma", "Selector de idioma en preparación."),
        },
      ],
    },
    {
      title: "Soporte",
      items: [
        {
          icon: "help-circle-outline",
          label: "Centro de ayuda",
          onPress: () =>
            Alert.alert(
              "Centro de ayuda",
              "Puedes contactarnos desde Contactar soporte."
            ),
        },
        {
          icon: "chatbubble-outline",
          label: "Contactar soporte",
          onPress: openEmail,
        },
        {
          icon: "shield-checkmark-outline",
          label: "Privacidad",
          onPress: () =>
            Alert.alert(
              "Privacidad",
              "Tu privacidad y seguridad estarán disponibles próximamente."
            ),
        },
      ],
    },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View entering={FadeInDown} style={styles.header}>
        <Image source={{ uri: avatar }} style={styles.avatar} />

        <View style={styles.userInfo}>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.email}>{email}</Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.editBtn, pressed && styles.pressed]}
          onPress={() => nav.push(nav.routes.profileInfo)}
        >
          <Feather name="edit-3" size={18} color={Colors.light.primary} />
        </Pressable>
      </Animated.View>

      {sections.map((section, index) => (
        <Animated.View
          entering={FadeInDown.delay(120 + index * 120)}
          key={section.title}
          style={styles.section}
        >
          <Text style={styles.sectionTitle}>{section.title}</Text>

          {section.items.map((item) => (
            <Pressable
              key={item.label}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              onPress={item.onPress}
            >
              <Ionicons
                name={item.icon}
                size={22}
                color={item.danger ? "#EF4444" : Colors.light.primary}
              />

              <Text
                style={[
                  styles.rowText,
                  item.danger && { color: "#EF4444" },
                ]}
              >
                {item.label}
              </Text>

              {item.showChevron === false ? (
                <Text style={styles.statusText}>Activo</Text>
              ) : (
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color="#94A3B8"
                  style={styles.chevron}
                />
              )}
            </Pressable>
          ))}
        </Animated.View>
      ))}

      <Animated.View entering={FadeInDown.delay(650)}>
        <Pressable
          style={({ pressed }) => [styles.logoutBtn, pressed && styles.pressed]}
          onPress={handleLogout}
        >
          <MaterialCommunityIcons name="logout" size={20} color="#EF4444" />
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </Pressable>
      </Animated.View>
    </ScrollView>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 30,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 50,
    marginRight: 16,
    backgroundColor: "#E5E7EB",
  },
  userInfo: {
    flex: 1,
  },
  name: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.light.text,
  },
  email: {
    color: Colors.light.textSecondary,
    marginTop: 2,
    fontWeight: "500",
  },
  editBtn: {
    marginLeft: "auto",
    padding: 10,
    backgroundColor: "#EEF2FF",
    borderRadius: 12,
  },
  section: {
    marginBottom: 22,
    backgroundColor: "#FFF",
    borderRadius: 18,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 14,
    color: Colors.light.text,
  },
  row: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  pressed: {
    opacity: 0.55,
  },
  rowText: {
    marginLeft: 14,
    fontSize: 15,
    color: Colors.light.text,
    fontWeight: "600",
  },
  chevron: {
    marginLeft: "auto",
  },
  statusText: {
    marginLeft: "auto",
    color: "#22C55E",
    fontWeight: "800",
    fontSize: 12,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  logoutText: {
    marginLeft: 8,
    color: "#EF4444",
    fontSize: 16,
    fontWeight: "800",
  },
});