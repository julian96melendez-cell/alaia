// app/(tabs)/_layout.tsx
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Tabs } from "expo-router";
import { useEffect, useRef } from "react";
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

import { useThemeContext } from "../../context/ThemeContext";

let BlurView: any = View;
try {
  BlurView = require("expo-blur").BlurView;
} catch {}

let Haptics: any = { selectionAsync: async () => {} };
try {
  Haptics = require("expo-haptics");
} catch {}

let useCartBadge: () => number = () => 0;
try {
  useCartBadge = require("../../hooks/useCartBadge").default;
} catch {}

let useNotificationsBadge: () => number = () => 0;
try {
  useNotificationsBadge = require("../../hooks/useNotificationsBadge").default;
} catch {}

type TabName =
  | "index"
  | "one"
  | "wishlist"
  | "cart"
  | "notifications"
  | "orders"
  | "profile"
  | "search"
  | "settings";

type TabConfig = {
  name: TabName;
  title: string;
  iconActive: keyof typeof Ionicons.glyphMap;
  iconInactive: keyof typeof Ionicons.glyphMap;
};

const MAIN_TABS: TabConfig[] = [
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
];

const HIDDEN_TABS = ["two", "mobile", "notifications", "search", "settings"];

export default function TabsLayout() {
  const { colors } = useThemeContext();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary ?? "#94A3B8",
      }}
      tabBar={(props) => <FloatingGlassTabBar {...props} />}
    >
      {MAIN_TABS.map((tab) => (
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

      {HIDDEN_TABS.map((name) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            href: null,
          }}
        />
      ))}
    </Tabs>
  );
}

function FloatingGlassTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const { colors, isDarkMode } = useThemeContext();
  const { width } = useWindowDimensions();

  const cartBadge = useCartBadge();
  const notificationsBadge = useNotificationsBadge();

  const visibleRoutes = state.routes.filter((route) =>
    MAIN_TABS.some((tab) => tab.name === route.name)
  );

  const activeVisibleIndex = Math.max(
    0,
    visibleRoutes.findIndex((route) => route.key === state.routes[state.index]?.key)
  );

  const animatedIndex = useRef(new Animated.Value(activeVisibleIndex)).current;

  useEffect(() => {
    Animated.timing(animatedIndex, {
      toValue: activeVisibleIndex,
      duration: 240,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [activeVisibleIndex, animatedIndex]);

  const containerWidth = Math.min(width - 28, 440);
  const itemWidth = containerWidth / visibleRoutes.length;

  const pillLeft = animatedIndex.interpolate({
    inputRange: visibleRoutes.map((_, i) => i),
    outputRange: visibleRoutes.map((_, i) => i * itemWidth),
  });

  const cardBg =
    Platform.OS === "android"
      ? isDarkMode
        ? "rgba(2,6,23,0.94)"
        : "rgba(255,255,255,0.94)"
      : "transparent";

  const getBadgeCount = (routeName: string) => {
    if (routeName === "cart") return cartBadge;
    if (routeName === "notifications") return notificationsBadge;
    return 0;
  };

  return (
    <View pointerEvents="box-none" style={styles.tabContainerWrapper}>
      <View style={styles.absoluteBottom}>
        <BlurView
          intensity={Platform.OS === "ios" ? 42 : 28}
          tint={isDarkMode ? "dark" : "light"}
          style={[
            styles.glassWrap,
            {
              width: containerWidth,
              backgroundColor: cardBg,
              borderColor: `${colors.border}90`,
            },
          ]}
        >
          <Animated.View
            style={[
              styles.activePill,
              {
                left: pillLeft,
                width: itemWidth,
                backgroundColor: `${colors.primary}20`,
                borderColor: `${colors.primary}55`,
              },
            ]}
          />

          {visibleRoutes.map((route, visibleIndex) => {
            const { options } = descriptors[route.key];
            const tabMeta = MAIN_TABS.find((tab) => tab.name === route.name);
            const isFocused = state.routes[state.index]?.key === route.key;

            const label = tabMeta?.title || options.title || route.name;

            const color = isFocused
              ? colors.primary
              : colors.textSecondary ?? "#94A3B8";

            const badgeCount = getBadgeCount(route.name);

            const scale = animatedIndex.interpolate({
              inputRange: visibleRoutes.map((_, i) => i),
              outputRange: visibleRoutes.map((_, i) =>
                i === visibleIndex ? 1.08 : 0.96
              ),
            });

            const opacity = animatedIndex.interpolate({
              inputRange: visibleRoutes.map((_, i) => i),
              outputRange: visibleRoutes.map((_, i) =>
                i === visibleIndex ? 1 : 0.72
              ),
            });

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

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityLabel={String(label)}
                accessibilityState={isFocused ? { selected: true } : {}}
                onPress={onPress}
                onLongPress={() =>
                  navigation.emit({
                    type: "tabLongPress",
                    target: route.key,
                  })
                }
                style={[styles.item, { width: itemWidth }]}
              >
                <Animated.View
                  style={[
                    styles.itemInner,
                    {
                      transform: [{ scale }],
                      opacity,
                    },
                  ]}
                >
                  <View style={styles.iconWrapper}>
                    <Ionicons
                      name={
                        isFocused
                          ? tabMeta?.iconActive || "ellipse"
                          : tabMeta?.iconInactive || "ellipse-outline"
                      }
                      size={22}
                      color={color}
                    />

                    {badgeCount > 0 ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                          {badgeCount > 99 ? "99+" : badgeCount}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <Text
                    numberOfLines={1}
                    style={[
                      styles.label,
                      {
                        color,
                        fontWeight: isFocused ? "900" : "700",
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

const styles = StyleSheet.create({
  tabContainerWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 98,
  },
  absoluteBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: Platform.OS === "ios" ? 20 : 14,
    alignItems: "center",
    justifyContent: "center",
  },
  glassWrap: {
    borderRadius: 26,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 24,
  },
  activePill: {
    position: "absolute",
    top: 7,
    bottom: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  item: {
    paddingVertical: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  itemInner: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapper: {
    minHeight: 25,
    minWidth: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    marginTop: 2,
    fontSize: 10.5,
    letterSpacing: 0.2,
  },
  badge: {
    position: "absolute",
    top: -6,
    right: -11,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
  },
});