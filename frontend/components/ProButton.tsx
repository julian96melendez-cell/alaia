import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
    ActivityIndicator,
    GestureResponderEvent,
    Pressable,
    StyleProp,
    StyleSheet,
    Text,
    TextStyle,
    ViewStyle
} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import useTheme from "../../hooks/useTheme";

type Variant = "primary" | "secondary" | "ghost" | "link";
type Size = "sm" | "md" | "lg";

interface ProButtonProps {
  title: string;
  onPress?: (event: GestureResponderEvent) => void;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: "left" | "right";
  loading?: boolean;
  disabled?: boolean;
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
}

const ProButton: React.FC<ProButtonProps> = ({
  title,
  onPress,
  icon,
  iconPosition = "left",
  loading = false,
  disabled = false,
  variant = "primary",
  size = "md",
  fullWidth = false,
  style,
  textStyle,
  testID,
}) => {
  const { theme } = useTheme();
  const pressed = useSharedValue(0);

  const handlePressIn = () => {
    pressed.value = 1;
  };

  const handlePressOut = () => {
    pressed.value = 0;
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(pressed.value ? 0.96 : 1) }],
    opacity: withTiming(disabled ? 0.6 : 1, { duration: 180 }),
  }));

  const getPadding = () => {
    switch (size) {
      case "sm":
        return { paddingVertical: 8, paddingHorizontal: 16, fontSize: 14 };
      case "lg":
        return { paddingVertical: 16, paddingHorizontal: 28, fontSize: 18 };
      default:
        return { paddingVertical: 12, paddingHorizontal: 22, fontSize: 16 };
    }
  };

  const { paddingVertical, paddingHorizontal, fontSize } = getPadding();

  const backgroundColors = {
    primary: theme.colors.primary,
    secondary: theme.colors.card,
    ghost: "transparent",
    link: "transparent",
  };

  const textColors = {
    primary: theme.colors.background,
    secondary: theme.colors.text,
    ghost: theme.colors.text,
    link: theme.colors.primary,
  };

  const borderColors = {
    primary: theme.colors.primary,
    secondary: theme.colors.border,
    ghost: "transparent",
    link: "transparent",
  };

  const iconSize = size === "sm" ? 16 : size === "lg" ? 22 : 20;

  return (
    <Animated.View style={[{ width: fullWidth ? "100%" : "auto" }, animatedStyle]}>
      <Pressable
        testID={testID}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        style={[
          styles.button,
          {
            backgroundColor: backgroundColors[variant],
            borderColor: borderColors[variant],
            borderWidth: variant === "secondary" ? 1.5 : 0,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingVertical,
            paddingHorizontal,
            borderRadius: 14,
          },
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator
            color={variant === "primary" ? theme.colors.background : theme.colors.primary}
            size="small"
          />
        ) : (
          <>
            {icon && iconPosition === "left" && (
              <Ionicons
                name={icon}
                size={iconSize}
                color={textColors[variant]}
                style={{ marginRight: 8 }}
              />
            )}

            <Text
              style={[
                styles.title,
                {
                  color: textColors[variant],
                  fontSize,
                },
                textStyle,
              ]}
            >
              {title}
            </Text>

            {icon && iconPosition === "right" && (
              <Ionicons
                name={icon}
                size={iconSize}
                color={textColors[variant]}
                style={{ marginLeft: 8 }}
              />
            )}
          </>
        )}
      </Pressable>
    </Animated.View>
  );
};

export default ProButton;

const styles = StyleSheet.create({
  button: {
    borderRadius: 14,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  title: {
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.3,
  },
});