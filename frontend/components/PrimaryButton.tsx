import { BlurView } from "expo-blur";
import React, { useRef } from "react";
import {
    ActivityIndicator,
    Animated,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextStyle,
    ViewStyle
} from "react-native";
import useTheme from "../../hooks/useTheme";

interface PrimaryButtonProps {
  title: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  glass?: boolean; // 🌟 Glassmorphism opcional
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
}

const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  title,
  onPress,
  loading = false,
  disabled = false,
  glass = false,
  style,
  textStyle,
  fullWidth = true,
}) => {
  const { theme, isDarkMode } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 50,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
    }).start();
  };

  const content = (
    <Animated.View
      style={[
        styles.button,
        {
          transform: [{ scale: scaleAnim }],
          backgroundColor: glass
            ? isDarkMode
              ? "rgba(255,255,255,0.06)"
              : "rgba(255,255,255,0.4)"
            : theme.colors.primary,
          opacity: disabled ? 0.6 : 1,
          borderColor: glass ? theme.colors.border : "transparent",
          width: fullWidth ? "100%" : "auto",
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text
          style={[
            styles.text,
            { color: glass ? theme.colors.text : "#fff" },
            textStyle,
          ]}
        >
          {title}
        </Text>
      )}
    </Animated.View>
  );

  if (glass && Platform.OS === "ios") {
    return (
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        style={{ width: fullWidth ? "100%" : undefined }}
      >
        <BlurView
          intensity={isDarkMode ? 30 : 50}
          tint={isDarkMode ? "dark" : "light"}
          style={[styles.glassContainer, style]}
        >
          {content}
        </BlurView>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      style={{ width: fullWidth ? "100%" : undefined }}
    >
      {content}
    </Pressable>
  );
};

export default PrimaryButton;

const styles = StyleSheet.create({
  button: {
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.2,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  text: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  glassContainer: {
    borderRadius: 14,
    overflow: "hidden",
  },
});