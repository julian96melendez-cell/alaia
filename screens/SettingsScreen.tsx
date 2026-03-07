// screens/SettingsScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useThemeContext } from "../context/ThemeContext";

/** Fila reutilizable optimizada (memo) */
type OptionRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  rightContent?: React.ReactNode;
  onPress?: () => void;
  colors: ReturnType<typeof useThemeContext>["colors"];
  isDarkMode: boolean;
};

const OptionRow = React.memo(function OptionRow({
  icon,
  title,
  description,
  rightContent,
  onPress,
  colors,
  isDarkMode,
}: OptionRowProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.option,
        {
          backgroundColor: isDarkMode ? "#1E293B" : "#FFFFFF",
          borderColor: isDarkMode ? "#334155" : "#E5E7EB",
        },
      ]}
    >
      <View style={styles.optionLeft}>
        <Ionicons name={icon} size={24} color={colors.primary} />
        <View>
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

      {rightContent}
    </TouchableOpacity>
  );
});

// 👇 OJO: quitamos el tipo de retorno `: JSX.Element`
export default function SettingsScreen() {
  const { colors, isDarkMode, toggleTheme } = useThemeContext();

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [language, setLanguage] = useState<"Español" | "English">("Español");

  // ANIMACIÓN DE ENTRADA
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // Cambiar idioma
  const handleLanguageChange = useCallback(() => {
    Alert.alert("Cambiar idioma", "Selecciona tu idioma preferido:", [
      { text: "Español", onPress: () => setLanguage("Español") },
      { text: "English", onPress: () => setLanguage("English") },
      { text: "Cancelar", style: "cancel" },
    ]);
  }, []);

  // Restablecer app
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
            if (isDarkMode) toggleTheme();
            Alert.alert("Configuración restablecida ✅");
          },
        },
      ]
    );
  }, [isDarkMode, toggleTheme]);

  const year = useMemo(() => new Date().getFullYear(), []);

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: colors.background, opacity: fadeAnim },
      ]}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={[styles.header, { color: colors.text }]}>Configuración ⚙️</Text>

        {/* PREFERENCIAS */}
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

        {/* APARIENCIA */}
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
              ios_backgroundColor={isDarkMode ? "#334155" : "#CBD5E1"}
            />
          }
        />

        {/* SISTEMA */}
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

        {/* FOOTER */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: "#94A3B8" }]}>
            ShiboApp v1.0.0 • © {year}
          </Text>
        </View>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  header: { fontSize: 22, fontWeight: "700", marginVertical: 18 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginTop: 20,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  option: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  optionLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  optionTitle: { fontSize: 16, fontWeight: "600" },
  optionDescription: { fontSize: 13, marginTop: 2 },
  footer: { alignItems: "center", marginTop: 40, marginBottom: 50 },
  footerText: { fontSize: 13 },
});