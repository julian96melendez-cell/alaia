import {
  Feather,
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import Colors from "../../constants/Colors";

export default function ProfileScreen() {
  const user = {
    name: "Usuario ALAIA",
    email: "usuario@example.com",
    avatar:
      "https://cdn-icons-png.flaticon.com/512/149/149071.png",
  };

  const sections = [
    {
      title: "Cuenta",
      items: [
        { icon: "person-outline", label: "Mi información" },
        { icon: "lock-closed-outline", label: "Privacidad" },
        { icon: "notifications-outline", label: "Notificaciones" },
      ],
    },
    {
      title: "Preferencias",
      items: [
        { icon: "moon-outline", label: "Modo oscuro" },
        { icon: "language-outline", label: "Idioma" },
      ],
    },
    {
      title: "Soporte",
      items: [
        { icon: "help-circle-outline", label: "Centro de ayuda" },
        { icon: "chatbubble-outline", label: "Contactar soporte" },
      ],
    },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 20, paddingBottom: 50 }}
      showsVerticalScrollIndicator={false}
    >
      {/* 🧑‍💼 HEADER */}
      <Animated.View entering={FadeInDown} style={styles.header}>
        <Image source={{ uri: user.avatar }} style={styles.avatar} />

        <View>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.email}>{user.email}</Text>
        </View>

        <Pressable style={styles.editBtn}>
          <Feather name="edit-3" size={18} color={Colors.light.primary} />
        </Pressable>
      </Animated.View>

      {/* 🧩 SECTIONS */}
      {sections.map((section, index) => (
        <Animated.View
          entering={FadeInDown.delay(150 + index * 150)}
          key={index}
          style={styles.section}
        >
          <Text style={styles.sectionTitle}>{section.title}</Text>

          {section.items.map((item, i) => (
            <Pressable key={i} style={styles.row}>
              <Ionicons
                name={item.icon as any}
                size={22}
                color={Colors.light.primary}
              />
              <Text style={styles.rowText}>{item.label}</Text>

              <Ionicons
                name="chevron-forward"
                size={20}
                color="#94A3B8"
                style={{ marginLeft: "auto" }}
              />
            </Pressable>
          ))}
        </Animated.View>
      ))}

      {/* 🚪 LOGOUT */}
      <Animated.View entering={FadeInDown.delay(650)}>
        <Pressable style={styles.logoutBtn}>
          <MaterialCommunityIcons
            name="logout"
            size={20}
            color="#EF4444"
          />
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

  // Header
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
  },
  name: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.light.text,
  },
  email: {
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  editBtn: {
    marginLeft: "auto",
    padding: 8,
    backgroundColor: "#EEF2FF",
    borderRadius: 10,
  },

  // Sections
  section: {
    marginBottom: 26,
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
    fontWeight: "700",
    marginBottom: 14,
    color: Colors.light.text,
  },

  // Rows
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  rowText: {
    marginLeft: 14,
    fontSize: 15,
    color: Colors.light.text,
    fontWeight: "500",
  },

  // Logout
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
  },
  logoutText: {
    marginLeft: 8,
    color: "#EF4444",
    fontSize: 16,
    fontWeight: "700",
  },
});