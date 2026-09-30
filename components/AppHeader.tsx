import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAppNavigation } from "../navigation/useAppNavigation";

type Props = {
  title: string;
  subtitle?: string;
  fallback?: string;
  right?: React.ReactNode;
  showBack?: boolean;
};

export default function AppHeader({
  title,
  subtitle,
  fallback,
  right,
  showBack = true,
}: Props) {
  const nav = useAppNavigation();

  const handleBack = () => {
  nav.back(fallback ?? "/(tabs)");
};

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        {/* LEFT */}
        <View style={styles.left}>
          {showBack ? (
            <Pressable
              onPress={handleBack}
              style={({ pressed }) => [
                styles.backBtn,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="chevron-back" size={26} color="#111827" />
            </Pressable>
          ) : (
            <View style={styles.sidePlaceholder} />
          )}
        </View>

        {/* CENTER */}
        <View style={styles.center}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>

          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {/* RIGHT */}
        <View style={styles.right}>
          {right || <View style={styles.sidePlaceholder} />}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },

  header: {
    height: 60,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
  },

  left: {
    width: 50,
    alignItems: "flex-start",
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  right: {
    width: 50,
    alignItems: "flex-end",
  },

  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },

  pressed: {
    opacity: 0.6,
  },

  sidePlaceholder: {
    width: 42,
    height: 42,
  },

  title: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
  },

  subtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
    fontWeight: "600",
  },
});