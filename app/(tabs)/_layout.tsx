// app/(tabs)/_layout.tsx
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Tabs } from "expo-router";
import React, { useMemo } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import useTheme from "../../hooks/useTheme";

// ==== IMPORTS SEGUROS (no rompen si el módulo no existe) ====
let BlurView: any = View;
try {
  BlurView = require("expo-blur").BlurView;
} catch {}

let Haptics: any = { selectionAsync: async () => {} };
try {
  Haptics = require("expo-haptics");
} catch {}

// Badges opcionales: si no existen los hooks, se devuelven 0
let useCartBadge: () => number = () => 0;
try {
  useCartBadge = require("../../hooks/useCartBadge").default;
} catch {}

let useNotificationsBadge: () => number = () => 0;
try {
  useNotificationsBadge = require("../../hooks/useNotificationsBadge").default;
} catch {}

// ==== CONFIG GLOBAL DE TABS (más limpio y escalable) ====
type TabConfig = {
  name: string;
  title: string;
  iconActive: keyof typeof Ionicons.glyphMap;
  iconInactive: keyof typeof Ionicons.glyphMap;
  // Función opcional para badge
  getBadgeCount?: () => number;
};

const TAB_CONFIG: TabConfig[] = [
  {
    name: "index",
    title: "Inicio",
    iconActive: "home",
    iconInactive: "home-outline",
  },
  {
    name: "one",
    title: "Explorar",
    iconActive: "compass",
    iconInactive: "compass-outline",
  },
  {
    name: "two",
    title: "Panel",
    iconActive: "grid",
    iconInactive: "grid-outline",
  },
  {
    name: "wishlist",
    title: "Favoritos",
    iconActive: "heart",
    iconInactive: "heart-outline",
  },
  {
    name: "cart",
    title: "Carrito",
    iconActive: "cart",
    iconInactive: "cart-outline",
    getBadgeCount: () => useCartBadge(),
  },
  {
    name: "mobile",
    title: "Móvil",
    iconActive: "phone-portrait",
    iconInactive: "phone-portrait-outline",
  },
  {
    name: "notifications",
    title: "Alertas",
    iconActive: "notifications",
    iconInactive: "notifications-outline",
    getBadgeCount: () => useNotificationsBadge(),
  },
  {
    name: "orders",
    title: "Órdenes",
    iconActive: "receipt",
    iconInactive: "receipt-outline",
  },
  {
    name: "profile",
    title: "Perfil",
    iconActive: "person",
    iconInactive: "person-outline",
  },
  {
    name: "search",
    title: "Buscar",
    iconActive: "search",
    iconInactive: "search-outline",
  },
  {
    name: "settings",
    title: "Ajustes",
    iconActive: "settings",
    iconInactive: "settings-outline",
  },
];

export default function TabsLayout() {
  const { theme } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary ?? "#94A3B8",
      }}
      tabBar={(props) => <FloatingGlassTabBar {...props} />}
    >
      {TAB_CONFIG.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? tab.iconActive : tab.iconInactive}
                size={size}
                color={color}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

// ============ TAB BAR CUSTOM AVANZADO ============

function FloatingGlassTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const { theme, isDarkMode } = useTheme();
  const { width } = useWindowDimensions();
  const activeIndex = state.index;

  // Animaciones
  const animatedIndex = useMemo(() => new Animated.Value(activeIndex), []);
  const itemWidth = (width - 32) / state.routes.length;

  Animated.timing(animatedIndex, {
    toValue: activeIndex,
    duration: 260,
    easing: Easing.out(Easing.quad),
    useNativeDriver: false,
  }).start();

  const pillLeft = animatedIndex.interpolate({
    inputRange: state.routes.map((_, i) => i),
    outputRange: state.routes.map((_, i) => i * itemWidth),
  });

  const cardBg =
    Platform.OS === "android"
      ? `${theme.colors.card}${isDarkMode ? "E0" : "D0"}`
      : "transparent";

  return (
    <View pointerEvents="box-none" style={styles.tabContainerWrapper}>
      {/* espacio para evitar que tape el contenido */}
      <View style={styles.spacer} />

      <View style={styles.absoluteBottom}>
        <BlurView
          intensity={Platform.OS === "ios" ? 40 : 25}
          tint={isDarkMode ? "dark" : "light"}
          style={[
            styles.glassWrap,
            {
              backgroundColor: cardBg,
              borderColor: `${theme.colors.border}80`,
            },
          ]}
        >
          {/* Indicador animado */}
          <Animated.View
            style={[
              styles.activePill,
              {
                left: pillLeft,
                width: itemWidth,
                backgroundColor: `${theme.colors.primary}22`,
                borderColor: `${theme.colors.primary}55`,
              },
            ]}
          />

          {/* Items */}
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const tabMeta = TAB_CONFIG.find((t) => t.name === route.name);
            const label = options.tabBarLabel ?? options.title ?? route.name;
            const isFocused = state.index === index;

            const color = isFocused
              ? theme.colors.primary
              : theme.colors.textSecondary ?? "#94A3B8";

            const onPress = () => {
              Haptics.selectionAsync?.().catch?.(() => {});
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            const badgeCount =
              typeof tabMeta?.getBadgeCount === "function"
                ? tabMeta.getBadgeCount()
                : 0;

            // Animaciones por item
            const scale = animatedIndex.interpolate({
              inputRange: state.routes.map((_, i) => i),
              outputRange: state.routes.map((_, i) =>
                i === index ? 1.08 : 0.96
              ),
            });

            const opacity = animatedIndex.interpolate({
              inputRange: state.routes.map((_, i) => i),
              outputRange: state.routes.map((_, i) => (i === index ? 1 : 0.7)),
            });

            const icon =
              typeof options.tabBarIcon === "function"
                ? options.tabBarIcon({ color, size: 22, focused: isFocused })
                : null;

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                onPress={onPress}
                onLongPress={() =>
                  navigation.emit({ type: "tabLongPress", target: route.key })
                }
                style={[styles.item, { width: itemWidth }]}
              >
                <Animated.View
                  style={{
                    alignItems: "center",
                    justifyContent: "center",
                    transform: [{ scale }],
                    opacity,
                  }}
                >
                  <View style={styles.iconWrapper}>
                    {icon}
                    {badgeCount > 0 && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                          {badgeCount > 99 ? "99+" : badgeCount}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.label,
                      {
                        color,
                        fontWeight: isFocused ? "800" : "600",
                      },
                    ]}
                  >
                    {String(label)}
                  </Text>
                </Animated.View>
              </Pressable>
            );
          })}
        </BlurView>
      </View>
    </View>
  );
}

// ============ ESTILOS ============

const styles = StyleSheet.create({
  tabContainerWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  spacer: {
    height: 90,
  },
  absoluteBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  glassWrap: {
    width: "92%",
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.20,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 24,
  },
  activePill: {
    position: "absolute",
    top: 6,
    bottom: 6,
    borderRadius: 18,
    borderWidth: 1,
  },
  item: {
    paddingVertical: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapper: {
    minHeight: 24,
    minWidth: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    marginTop: 2,
    fontSize: 11,
    letterSpacing: 0.25,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -10,
    minWidth: 16,
    paddingHorizontal: 3,
    borderRadius: 999,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
  },
});