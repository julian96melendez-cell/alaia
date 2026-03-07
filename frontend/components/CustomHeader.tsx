import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
    Animated,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useTheme } from "../../context/ThemeContext";

interface CustomHeaderProps {
  title?: string;
  scrollY?: Animated.Value; // Valor de scroll animado desde la pantalla
  onSearchPress?: () => void;
  onCartPress?: () => void;
  onProfilePress?: () => void;
  cartCount?: number;
}

const CustomHeader: React.FC<CustomHeaderProps> = ({
  title = "Alaia",
  scrollY = new Animated.Value(0),
  onSearchPress,
  onCartPress,
  onProfilePress,
  cartCount = 0,
}) => {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const headerTranslateY = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [0, -100],
    extrapolate: "clamp",
  });

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const colors = {
    background: isDark ? "rgba(18,18,18,0.9)" : "rgba(255,255,255,0.92)",
    text: isDark ? "#f2f2f2" : "#111",
    icon: isDark ? "#f2f2f2" : "#111",
    border: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          transform: [{ translateY: headerTranslateY }],
          opacity: headerOpacity,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        translucent
        backgroundColor="transparent"
      />

      <View style={styles.leftContainer}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      </View>

      <View style={styles.rightContainer}>
        <TouchableOpacity onPress={onSearchPress}>
          <Ionicons name="search-outline" size={24} color={colors.icon} />
        </TouchableOpacity>

        <TouchableOpacity onPress={onCartPress} style={{ marginHorizontal: 16 }}>
          <View>
            <Ionicons name="cart-outline" size={24} color={colors.icon} />
            {cartCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{cartCount}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={onProfilePress}>
          <Ionicons name="person-circle-outline" size={26} color={colors.icon} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: Platform.OS === "ios" ? 55 : 30,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  leftContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  rightContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  badge: {
    position: "absolute",
    top: -5,
    right: -10,
    backgroundColor: "#007AFF",
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  badgeText: {
    fontSize: 10,
    color: "#fff",
    fontWeight: "700",
  },
});

export default CustomHeader;