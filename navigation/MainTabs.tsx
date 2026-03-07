import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

// 🖥️ Screens principales
import CartScreen from "../screens/CartScreen";
import HomeScreen from "../screens/HomeScreen";
import OneScreen from "../screens/OneScreen";
import ProfileScreen from "../screens/ProfileScreen";
import SearchScreen from "../screens/SearchScreen";
import SettingsScreen from "../screens/SettingsScreen";
import TwoScreen from "../screens/TwoScreen";
import WishlistScreen from "../screens/WishlistScreen";

// 🎨 Colores base
const Colors = {
  primary: "#6C63FF",
  background: "#FFFFFF",
  text: "#1E293B",
  textSecondary: "#64748B",
  tabIconDefault: "#94A3B8",
  tabIconSelected: "#6C63FF",
};

// 🛒 (Opcional) Importar contexto del carrito si existe
// import { useCart } from "../context/CartContext";

const Tab = createBottomTabNavigator();

export default function MainTabs() {
  // const { totalItems } = useCart(); // 👉 Descomenta si tienes el contexto
  const totalItems = 0; // ⚠️ Temporal para que compile sin errores

  return (
    <Tab.Navigator
      initialRouteName="Inicio"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.tabIconDefault,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: styles.tabBar,
        tabBarIcon: ({ color, size }) => {
          let icon: keyof typeof Ionicons.glyphMap = "ellipse-outline";
          switch (route.name) {
            case "Inicio": icon = "home-outline"; break;
            case "Buscar": icon = "search-outline"; break;
            case "Carrito": icon = "cart-outline"; break;
            case "Wishlist": icon = "heart-outline"; break;
            case "Perfil": icon = "person-outline"; break;
            case "Config": icon = "settings-outline"; break;
            case "One": icon = "grid-outline"; break;
            case "Two": icon = "apps-outline"; break;
          }

          // 🛍️ Badge en el carrito
          if (route.name === "Carrito" && totalItems > 0) {
            return (
              <View>
                <Ionicons name={icon} size={size} color={color} />
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {totalItems > 9 ? "9+" : totalItems}
                  </Text>
                </View>
              </View>
            );
          }

          return <Ionicons name={icon} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Inicio" component={HomeScreen} />
      <Tab.Screen name="Buscar" component={SearchScreen} />
      <Tab.Screen name="Carrito" component={CartScreen} />
      <Tab.Screen name="Wishlist" component={WishlistScreen} />
      <Tab.Screen name="Perfil" component={ProfileScreen} />
      <Tab.Screen name="Config" component={SettingsScreen} />
      <Tab.Screen name="One" component={OneScreen} />
      <Tab.Screen name="Two" component={TwoScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.background,
    borderTopWidth: 0.5,
    borderTopColor: "#E2E8F0",
    height: Platform.OS === "ios" ? 80 : 64,
    paddingBottom: Platform.OS === "ios" ? 12 : 8,
    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: Platform.OS === "ios" ? 4 : 6,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -10,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
});