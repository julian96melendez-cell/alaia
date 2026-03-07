import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import Colors from "../../constants/Colors";

export default function SettingsScreen() {
  const user = {
    name: "Usuario Invitado",
    email: "example@mail.com",
    avatar:
      "https://cdn-icons-png.flaticon.com/512/3177/3177440.png",
  };

  const options = [
    {
      title: "Cuenta",
      icon: "person-outline",
      color: Colors.light.primary,
    },
    {
      title: "Notificaciones",
      icon: "notifications-outline",
      color: "#F59E0B",
    },
    {
      title: "Pagos",
      icon: "card-outline",
      color: "#10B981",
    },
    {
      title: "Direcciones",
      icon: "location-outline",
      color: "#3B82F6",
    },
    {
      title: "Seguridad",
      icon: "shield-checkmark-outline",
      color: "#EF4444",
    },
  ];

  const supportOptions = [
    {
      title: "Centro de ayuda",
      icon: "help-circle-outline",
      color: "#6366F1",
    },
    {
      title: "Contáctanos",
      icon: "chatbubble-ellipses-outline",
      color: "#0EA5E9",
    },
  ];

  const logout = () => {
    Alert.alert("Cerrar sesión", "¿Deseas cerrar tu sesión?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Salir", style: "destructive", onPress: () => {} },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 20 }}
      showsVerticalScrollIndicator={false}
    >
      {/* 🟦 Perfil del usuario */}
      <Animated.View entering={FadeInDown.duration(350)} style={styles.profileCard}>
        <Image source={{ uri: user.avatar }} style={styles.avatar} />

        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.email}>{user.email}</Text>
        </View>

        <Pressable style={styles.editBtn}>
          <Ionicons name="create-outline" size={20} color="#64748B" />
        </Pressable>
      </Animated.View>

      {/* ⚙️ Configuración */}
      <Animated.View entering={FadeInDown.delay(150)} style={styles.section}>
        <Text style={styles.sectionTitle}>Configuración</Text>

        {options.map((opt, index) => (
          <Animated.View
            key={index}
            entering={FadeInDown.delay(180 + index * 80)}
          >
            <Pressable style={styles.optionRow}>
              <View style={[styles.iconBox, { backgroundColor: `${opt.color}22` }]}>
                <Ionicons name={opt.icon as any} size={22} color={opt.color} />
              </View>

              <Text style={styles.optionText}>{opt.title}</Text>

              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </Pressable>
          </Animated.View>
        ))}
      </Animated.View>

      {/* 🛠️ Soporte */}
      <Animated.View entering={FadeInDown.delay(350)} style={styles.section}>
        <Text style={styles.sectionTitle}>Soporte</Text>

        {supportOptions.map((opt, index) => (
          <Animated.View
            key={index}
            entering={FadeInDown.delay(380 + index * 80)}
          >
            <Pressable style={styles.optionRow}>
              <View style={[styles.iconBox, { backgroundColor: `${opt.color}22` }]}>
                <Ionicons name={opt.icon as any} size={22} color={opt.color} />
              </View>

              <Text style={styles.optionText}>{opt.title}</Text>

              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </Pressable>
          </Animated.View>
        ))}
      </Animated.View>

      {/* 🚪 Cerrar sesión */}
      <Animated.View entering={FadeInDown.delay(550)}>
        <Pressable style={styles.logoutBtn} onPress={logout}>
          <MaterialCommunityIcons name="logout" size={20} color="#EF4444" />
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </Pressable>
      </Animated.View>

      <View style={{ height: 50 }} />
    </ScrollView>
  );
}

// 🧪 Estilos
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
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
  },
  name: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.light.text,
  },
  email: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
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
    fontWeight: "700",
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
    fontWeight: "600",
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
    fontWeight: "700",
  },
});