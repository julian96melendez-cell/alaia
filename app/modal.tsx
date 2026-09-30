// app/modal.tsx
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { useThemeContext } from "../context/ThemeContext";
import { useAppNavigation } from "../navigation/useAppNavigation";

type ThemeColors = ReturnType<typeof useThemeContext>["colors"];

export default function ModalScreen() {
  const nav = useAppNavigation();
  const { colors, isDarkMode, toggleTheme } = useThemeContext();

  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);

  const muted = colors.textSecondary || colors.subtext || "#6B7280";

  const closeSafe = () => {
    nav.back(nav.routes.home);
  };

  const openSupport = async () => {
    const url = "mailto:support@alaia.app?subject=Soporte%20ALAIA";

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        return;
      }
    } catch {}

    Alert.alert("Soporte", "Escríbenos a support@alaia.app");
  };

  const quickStats = useMemo(
    () => [
      { label: "Compras", value: "—" },
      { label: "Favoritos", value: "—" },
      { label: "Alertas", value: pushEnabled ? "Activas" : "Pausadas" },
    ],
    [pushEnabled]
  );

  return (
    <>
      <Stack.Screen
        options={{
          presentation: "modal",
          title: "Centro rápido",
          headerTitleAlign: "center",
          headerShadowVisible: false,
          headerLeft: () => null,
          headerRight: () => (
            <Pressable
              onPress={closeSafe}
              hitSlop={10}
              style={({ pressed }) => [
                styles.headerCloseBtn,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          ),
        }}
      />

      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.hero}>
            <View
              style={[
                styles.heroIconWrap,
                {
                  backgroundColor: isDarkMode
                    ? `${colors.primary}33`
                    : `${colors.primary}1A`,
                },
              ]}
            >
              <Ionicons name="sparkles-outline" size={30} color={colors.primary} />
            </View>

            <Text style={[styles.heroTitle, { color: colors.text }]}>
              Herramientas rápidas de ALAIA
            </Text>

            <Text style={[styles.heroSubtitle, { color: muted }]}>
              Accede en segundos a perfil, pedidos, alertas, soporte y preferencias.
            </Text>
          </View>

          <View
            style={[
              styles.cardSoft,
              {
                backgroundColor: isDarkMode ? "#020617" : "#F8FAFC",
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.sectionLabel, { color: muted }]}>
              Resumen rápido
            </Text>

            <View style={styles.statsRow}>
              {quickStats.map((item) => (
                <View key={item.label} style={styles.statBox}>
                  <Text style={[styles.statValue, { color: colors.text }]}>
                    {item.value}
                  </Text>
                  <Text style={[styles.statLabel, { color: muted }]}>
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Acceso rápido
          </Text>

          <View style={styles.actionsGrid}>
            <ActionCard icon="home-outline" title="Inicio" description="Volver a la pantalla principal." colors={colors} muted={muted} onPress={() => nav.replace(nav.routes.home)} />
            <ActionCard icon="person-circle-outline" title="Mi perfil" description="Ver tu información y preferencias." colors={colors} muted={muted} onPress={() => nav.push(nav.routes.profile)} />
            <ActionCard icon="bag-handle-outline" title="Órdenes" description="Historial y seguimiento de compras." colors={colors} muted={muted} onPress={() => nav.push(nav.routes.orders)} />
            <ActionCard icon="heart-outline" title="Favoritos" description="Productos guardados para después." colors={colors} muted={muted} onPress={() => nav.push(nav.routes.wishlist)} />
            <ActionCard icon="notifications-outline" title="Alertas" description="Promociones y avisos importantes." colors={colors} muted={muted} onPress={() => nav.push(nav.routes.notifications)} />
            <ActionCard icon="help-buoy-outline" title="Ayuda y soporte" description="Contactar soporte por correo." colors={colors} muted={muted} onPress={openSupport} />
          </View>

          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Preferencias rápidas
          </Text>

          <View
            style={[
              styles.cardSoft,
              {
                backgroundColor: isDarkMode ? "#020617" : "#F9FAFB",
                borderColor: colors.border,
              },
            ]}
          >
            <ToggleRow icon="notifications-outline" label="Notificaciones push" subtitle="Alertas sobre pedidos y promociones." value={pushEnabled} onChange={setPushEnabled} colors={colors} muted={muted} />
            <View style={styles.separator} />
            <ToggleRow icon="mail-outline" label="Resumen por correo" subtitle="Novedades e ideas seleccionadas." value={emailEnabled} onChange={setEmailEnabled} colors={colors} muted={muted} />
            <View style={styles.separator} />
            <ToggleRow icon={isDarkMode ? "sunny-outline" : "moon-outline"} label={isDarkMode ? "Modo claro" : "Modo oscuro"} subtitle={isDarkMode ? "Cambiar a una apariencia clara." : "Activar apariencia oscura."} value={isDarkMode} onChange={() => toggleTheme()} colors={colors} muted={muted} />
          </View>

          <Pressable
            onPress={closeSafe}
            style={({ pressed }) => [
              styles.closeButton,
              {
                backgroundColor: isDarkMode ? "#020617" : "#E5E7EB",
                borderColor: isDarkMode ? "#1F2937" : "#CBD5E1",
              },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.closeButtonText, { color: muted }]}>Cerrar</Text>
          </Pressable>
        </ScrollView>
      </View>
    </>
  );
}

function ActionCard({
  icon,
  title,
  description,
  colors,
  muted,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  colors: ThemeColors;
  muted: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionCard,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.actionIconWrap, { backgroundColor: `${colors.primary}18` }]}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>

      <View style={styles.actionTextWrap}>
        <Text style={[styles.actionTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.actionDescription, { color: muted }]} numberOfLines={2}>
          {description}
        </Text>
      </View>

      <Ionicons name="chevron-forward-outline" size={18} color={muted} />
    </Pressable>
  );
}

function ToggleRow({
  icon,
  label,
  subtitle,
  value,
  onChange,
  colors,
  muted,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle: string;
  value: boolean;
  onChange: (value: boolean) => void;
  colors: ThemeColors;
  muted: string;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleLeft}>
        <View style={[styles.toggleIconWrap, { backgroundColor: `${colors.primary}18` }]}>
          <Ionicons name={icon} size={18} color={colors.primary} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={[styles.toggleLabel, { color: colors.text }]}>{label}</Text>
          <Text style={[styles.toggleSubtitle, { color: muted }]}>{subtitle}</Text>
        </View>
      </View>

      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: "#94A3B8", true: colors.primary }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={colors.border}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 32,
    paddingTop: 14,
  },
  pressed: { opacity: 0.65 },
  headerCloseBtn: {
    padding: 6,
    marginRight: 8,
    borderRadius: 999,
  },
  hero: {
    alignItems: "center",
    marginBottom: 20,
  },
  heroIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 8,
    fontWeight: "500",
  },
  sectionLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginTop: 18,
    marginBottom: 10,
  },
  cardSoft: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  statBox: {
    flex: 1,
    paddingVertical: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  actionsGrid: {
    gap: 10,
    marginBottom: 6,
  },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  actionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  actionTextWrap: { flex: 1 },
  actionTitle: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 2,
  },
  actionDescription: {
    fontSize: 12,
    fontWeight: "500",
  },
  separator: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 8,
    opacity: 0.6,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  toggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  toggleIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  toggleSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeButton: {
    alignSelf: "center",
    marginTop: 16,
    paddingHorizontal: 26,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: "800",
  },
});