// screens/SettingsScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeContext } from "../context/ThemeContext";

type ThemeContextValue = ReturnType<typeof useThemeContext>;

type OptionRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  rightContent?: React.ReactNode;
  onPress?: () => void;
  colors: ThemeContextValue["colors"];
  isDarkMode: boolean;
  disabled?: boolean;
};

const OptionRow = memo(function OptionRow({
  icon,
  title,
  description,
  rightContent,
  onPress,
  colors,
  isDarkMode,
  disabled = false,
}: OptionRowProps) {
  const Container = onPress ? TouchableOpacity : View;

  return (
    <Container
      {...(onPress
        ? {
            activeOpacity: 0.85,
            onPress,
            accessibilityRole: "button" as const,
          }
        : {})}
      style={[
        styles.option,
        {
          backgroundColor: isDarkMode ? "#1E293B" : "#FFFFFF",
          borderColor: isDarkMode ? "#334155" : "#E5E7EB",
          opacity: disabled ? 0.6 : 1,
        },
      ]}
    >
      <View style={styles.optionLeft}>
        <Ionicons name={icon} size={24} color={colors.primary} style={styles.optionIcon} />

        <View style={styles.optionTextWrap}>
          <Text style={[styles.optionTitle, { color: colors.text }]}>{title}</Text>

          {!!description && (
            <Text
              style={[
                styles.optionDescription,
                { color: isDarkMode ? "#CBD5E1" : "#64748B" },
              ]}
            >
              {description}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.rightContent}>{rightContent}</View>
    </Container>
  );
});

export default function SettingsScreen() {
  const { colors, isDarkMode, toggleTheme } = useThemeContext();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [language, setLanguage] = useState<"Español" | "English">("Español");

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 450,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const handleLanguageChange = useCallback(() => {
    Alert.alert("Cambiar idioma", "Selecciona tu idioma preferido:", [
      { text: "Español", onPress: () => setLanguage("Español") },
      { text: "English", onPress: () => setLanguage("English") },
      { text: "Cancelar", style: "cancel" },
    ]);
  }, []);

  const handleResetApp = useCallback(() => {
    Alert.alert(
      "Restablecer configuración",
      "¿Deseas restaurar los valores por defecto?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Restablecer",
          style: "destructive",
          onPress: () => {
            setNotificationsEnabled(true);
            setLanguage("Español");

            if (isDarkMode) {
              toggleTheme();
            }

            Alert.alert("Configuración restablecida", "Los valores por defecto fueron restaurados.");
          },
        },
      ]
    );
  }, [isDarkMode, toggleTheme]);

  const year = useMemo(() => new Date().getFullYear(), []);

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        {
          backgroundColor: colors.background,
        },
      ]}
      edges={["top", "left", "right"]}
    >
      <Animated.View
        style={[
          styles.container,
          {
            backgroundColor: colors.background,
            opacity: fadeAnim,
          },
        ]}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <Text style={[styles.header, { color: colors.text }]}>Configuración ⚙️</Text>

          <Text
            style={[
              styles.sectionTitle,
              { color: isDarkMode ? "#94A3B8" : "#64748B" },
            ]}
          >
            Preferencias de usuario
          </Text>

          <OptionRow
            icon="notifications-outline"
            title="Notificaciones"
            description="Recibe alertas y promociones"
            colors={colors}
            isDarkMode={isDarkMode}
            rightContent={
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ false: "#94A3B8", true: colors.primary }}
                thumbColor="#FFFFFF"
                ios_backgroundColor={isDarkMode ? "#334155" : "#CBD5E1"}
              />
            }
          />

          <OptionRow
            icon="language-outline"
            title="Idioma"
            description={`Actual: ${language}`}
            colors={colors}
            isDarkMode={isDarkMode}
            rightContent={
              <Ionicons
                name="chevron-forward-outline"
                size={20}
                color="#94A3B8"
              />
            }
            onPress={handleLanguageChange}
          />

          <Text
            style={[
              styles.sectionTitle,
              { color: isDarkMode ? "#94A3B8" : "#64748B" },
            ]}
          >
            Apariencia
          </Text>

          <OptionRow
            icon={isDarkMode ? "sunny-outline" : "moon-outline"}
            title="Tema"
            description={isDarkMode ? "Modo oscuro activado" : "Modo claro activado"}
            colors={colors}
            isDarkMode={isDarkMode}
            rightContent={
              <Switch
                value={isDarkMode}
                onValueChange={toggleTheme}
                trackColor={{ false: "#94A3B8", true: colors.primary }}
                thumbColor="#FFFFFF"
                ios_backgroundColor={isDarkMode ? "#334155" : "#CBD5E1"}
              />
            }
          />

          <Text
            style={[
              styles.sectionTitle,
              { color: isDarkMode ? "#94A3B8" : "#64748B" },
            ]}
          >
            Sistema
          </Text>

          <OptionRow
            icon="refresh-circle-outline"
            title="Restablecer aplicación"
            description="Reinicia las preferencias"
            colors={colors}
            isDarkMode={isDarkMode}
            rightContent={
              <Ionicons
                name="chevron-forward-outline"
                size={20}
                color="#94A3B8"
              />
            }
            onPress={handleResetApp}
          />

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: "#94A3B8" }]}>
              ShiboApp v1.0.0 • © {year}
            </Text>
          </View>
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  header: {
    fontSize: 22,
    fontWeight: "700",
    marginTop: 8,
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginTop: 20,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  option: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    minHeight: 68,
  },
  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  optionIcon: {
    marginRight: 12,
  },
  optionTextWrap: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  optionDescription: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  rightContent: {
    marginLeft: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    alignItems: "center",
    marginTop: 36,
    marginBottom: 20,
  },
  footerText: {
    fontSize: 13,
  },
});