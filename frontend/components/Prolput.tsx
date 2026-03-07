import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
    StyleSheet,
    Text,
    TextInput,
    TextInputProps,
    TouchableOpacity,
    View,
} from "react-native";
import useTheme from "../../hooks/useTheme";

interface ProInputProps extends TextInputProps {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  secure?: boolean;
  errorText?: string;
}

export default function ProInput({
  label,
  icon,
  secure = false,
  errorText,
  style,
  ...props
}: ProInputProps) {
  const { colors, isDarkMode } = useTheme();
  const [isSecure, setIsSecure] = useState(secure);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.container}>
      {label && <Text style={[styles.label, { color: colors.text }]}>{label}</Text>}

      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: colors.card,
            borderColor: errorText
              ? colors.error
              : focused
              ? colors.tint
              : colors.border,
          },
        ]}
      >
        {icon && (
          <Ionicons
            name={icon}
            size={20}
            color={errorText ? colors.error : colors.textSecondary || "#9CA3AF"}
            style={styles.icon}
          />
        )}

        <TextInput
          style={[styles.input, { color: colors.text }]}
          placeholderTextColor={colors.textSecondary || "#9CA3AF"}
          secureTextEntry={isSecure}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...props}
        />

        {secure && (
          <TouchableOpacity onPress={() => setIsSecure(!isSecure)}>
            <Ionicons
              name={isSecure ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={colors.textSecondary || "#9CA3AF"}
            />
          </TouchableOpacity>
        )}
      </View>

      {errorText && <Text style={[styles.error, { color: colors.error }]}>{errorText}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  icon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
  },
  error: {
    fontSize: 12,
    marginTop: 4,
  },
});