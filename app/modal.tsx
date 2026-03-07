// app/modal.tsx
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useThemeContext } from "../context/ThemeContext";

type ThemeColors = ReturnType<typeof useThemeContext>["colors"];

export default function ModalScreen() {
  const router = useRouter();
  const { colors, isDarkMode, toggleTheme } = useThemeContext();

  // Toggles rápidos (solo estado local)
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);

  const handleClose = () => {
    router.back();
  };

  // Pequeño helper para evitar errores de typedRoutes
  const go = (path: string) => {
    router.push(path as any); // evita error de tipos si la ruta aún no existe
  };

  const goToHome = () => {
    go("/(tabs)");
  };

  const goToProfile = () => {
    // crea app/(tabs)/profile.tsx cuando quieras
    go("/(tabs)/profile");
  };

  const goToSettings = () => {
    // crea app/(tabs)/settings.tsx cuando quieras
    go("/(tabs)/settings");
  };

  const goToOrders = () => {
    // crea app/(tabs)/orders.tsx cuando quieras
    go("/(tabs)/orders");
  };

  const goToNotifications = () => {
    // crea app/(tabs)/notifications.tsx cuando quieras
    go("/(tabs)/notifications");
  };

  const handleSupport = () => {
    Alert.alert(
      "Soporte",
      "En una versión futura puedes conectar este botón a WhatsApp, correo o chat en vivo para tus usuarios."
    );
  };

  const quickStats = useMemo(
    () => [
      { label: "Compras", value: "—" },
      { label: "Favoritos", value: "—" },
      { label: "Notificaciones", value: pushEnabled ? "Activas" : "Pausadas" },
    ],
    [pushEnabled]
  );

  return (
    <>
      <Stack.Screen
        options={{
          presentation: "modal",
          headerTitle: "Centro rápido",
          headerTitleAlign: "center",
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerShadowVisible: false,
          headerLeft: () => null,
          headerRight: () => (
            <Pressable
              onPress={handleClose}
              hitSlop={10}
              style={({ pressed }) => [
                styles.headerCloseBtn,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Ionicons
                name="close"
                size={22}
                color={isDarkMode ? "#E5E7EB" : "#111827"}
              />
            </Pressable>
          ),
        }}
      />

      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.background,
            paddingTop:
              Platform.OS === "android"
                ? (StatusBar.currentHeight ?? 0) + 4
                : 0,
          },
        ]}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* HERO */}
          <View style={styles.hero}>
            <View
              style={[
                styles.heroIconWrap,
                {
                  backgroundColor: isDarkMode
                    ? colors.primary + "33"
                    : colors.primary + "1A",
                },
              ]}
            >
              <Ionicons
                name="sparkles-outline"
                size={30}
                color={colors.primary}
              />
            </View>
            <Text style={[styles.heroTitle, { color: colors.text }]}>
              Herramientas rápidas de ALAIA
            </Text>
            <Text
              style={[
                styles.heroSubtitle,
                { color: colors.textSecondary || "#6B7280" },
              ]}
            >
              Desde aquí puedes acceder en segundos a tu perfil, pedidos,
              ajustes y preferencias visuales.
            </Text>
          </View>

          {/* STATS RÁPIDAS */}
          <View
            style={[
              styles.cardSoft,
              {
                backgroundColor: isDarkMode
                  ? "#020617"
                  : "rgba(148,163,184,0.09)",
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.sectionLabel,
                { color: colors.textSecondary || "#6B7280" },
              ]}
            >
              Resumen rápido
            </Text>
            <View style={styles.statsRow}>
              {quickStats.map((item) => (
                <View key={item.label} style={styles.statBox}>
                  <Text
                    style={[
                      styles.statValue,
                      { color: colors.text },
                    ]}
                    numberOfLines={1}
                  >
                    {item.value}
                  </Text>
                  <Text
                    style={[
                      styles.statLabel,
                      { color: colors.textMuted || "#9CA3AF" },
                    ]}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* GRID DE ACCIONES PRINCIPALES */}
          <Text
            style={[
              styles.sectionTitle,
              { color: colors.text },
            ]}
          >
            Acceso rápido
          </Text>
          <View style={styles.actionsGrid}>
            <ActionCard
              icon="home-outline"
              title="Inicio"
              description="Ir al feed principal y explorar productos."
              colors={colors}
              onPress={goToHome}
            />
            <ActionCard
              icon="person-circle-outline"
              title="Mi perfil"
              description="Ver y editar tus datos personales."
              colors={colors}
              onPress={goToProfile}
            />
            <ActionCard
              icon="bag-handle-outline"
              title="Mis pedidos"
              description="Historial, estados y detalles de compras."
              colors={colors}
              onPress={goToOrders}
            />
            <ActionCard
              icon="settings-outline"
              title="Configuración"
              description="Tema, idioma y notificaciones avanzadas."
              colors={colors}
              onPress={goToSettings}
            />
            <ActionCard
              icon="notifications-outline"
              title="Centro de alertas"
              description="Ver promociones y avisos importantes."
              colors={colors}
              onPress={goToNotifications}
            />
            <ActionCard
              icon="help-buoy-outline"
              title="Ayuda & soporte"
              description="Obtén ayuda cuando algo no salga bien."
              colors={colors}
              onPress={handleSupport}
            />
          </View>

          {/* PREFERENCIAS RÁPIDAS */}
          <Text
            style={[
              styles.sectionTitle,
              { color: colors.text },
            ]}
          >
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
            <ToggleRow
              icon="notifications-outline"
              label="Notificaciones push"
              subtitle="Alertas sobre pedidos y promociones."
              value={pushEnabled}
              onChange={setPushEnabled}
              colors={colors}
            />

            <View style={styles.separator} />

            <ToggleRow
              icon="mail-outline"
              label="Resumen por correo"
              subtitle="Novedades e ideas seleccionadas."
              value={emailEnabled}
              onChange={setEmailEnabled}
              colors={colors}
            />

            <View style={styles.separator} />

            <ToggleRow
              icon={isDarkMode ? "sunny-outline" : "moon-outline"}
              label={isDarkMode ? "Modo claro" : "Modo oscuro"}
              subtitle={
                isDarkMode
                  ? "Usar fondo claro y tonos suaves."
                  : "Descansa la vista en ambientes oscuros."
              }
              value={isDarkMode}
              onChange={toggleTheme}
              colors={colors}
            />
          </View>

          {/* INFO DE LA APP */}
          <Text
            style={[
              styles.sectionTitle,
              { color: colors.text },
            ]}
          >
            Sobre ALAIA
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
            <InfoRow
              icon="information-circle-outline"
              label="Versión de la app"
              value="1.0.0"
              colors={colors}
            />
            <InfoRow
              icon="shield-checkmark-outline"
              label="Privacidad"
              value="Tus datos se manejan de forma segura."
              colors={colors}
            />
            <InfoRow
              icon="sparkles-outline"
              label="Experiencia"
              value="Pensada para compras simples, rápidas y elegantes."
              colors={colors}
            />
          </View>

          {/* BOTÓN CERRAR */}
          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [
              styles.closeButton,
              {
                backgroundColor: isDarkMode ? "#020617" : "#E5E7EB",
                borderColor: isDarkMode ? "#1F2937" : "#CBD5E1",
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.closeButtonText,
                { color: colors.textSecondary || "#4B5563" },
              ]}
            >
              Cerrar
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  COMPONENTES REUTILIZABLES                                        */
/* ------------------------------------------------------------------ */

type ActionCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  colors: ThemeColors;
  onPress: () => void;
};

function ActionCard({
  icon,
  title,
  description,
  colors,
  onPress,
}: ActionCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.actionIconWrap,
          { backgroundColor: colors.primary + "18" },
        ]}
      >
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>

      <View style={styles.actionTextWrap}>
        <Text style={[styles.actionTitle, { color: colors.text }]}>
          {title}
        </Text>
        <Text
          style={[
            styles.actionDescription,
            { color: colors.textSecondary || "#6B7280" },
          ]}
          numberOfLines={2}
        >
          {description}
        </Text>
      </View>

      <Ionicons
        name="chevron-forward-outline"
        size={18}
        color={colors.textMuted || "#9CA3AF"}
      />
    </Pressable>
  );
}

type ToggleRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle: string;
  value: boolean;
  onChange: (v: boolean) => void;
  colors: ThemeColors;
};

function ToggleRow({
  icon,
  label,
  subtitle,
  value,
  onChange,
  colors,
}: ToggleRowProps) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleLeft}>
        <View
          style={[
            styles.toggleIconWrap,
            { backgroundColor: colors.primary + "18" },
          ]}
        >
          <Ionicons name={icon} size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.toggleLabel, { color: colors.text }]}>
            {label}
          </Text>
          <Text
            style={[
              styles.toggleSubtitle,
              { color: colors.textSecondary || "#6B7280" },
            ]}
          >
            {subtitle}
          </Text>
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{
          false: "#94A3B8",
          true: colors.primary,
        }}
        ios_backgroundColor={colors.border}
      />
    </View>
  );
}

type InfoRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  colors: ThemeColors;
};

function InfoRow({ icon, label, value, colors }: InfoRowProps) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoLeft}>
        <Ionicons
          name={icon}
          size={18}
          color={colors.textSecondary || "#6B7280"}
        />
        <Text style={[styles.infoLabel, { color: colors.text }]}>
          {label}
        </Text>
      </View>
      <Text
        style={[
          styles.infoValue,
          { color: colors.textSecondary || "#6B7280" },
        ]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  ESTILOS                                                           */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 32,
    paddingTop: 8,
  },

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
  actionTextWrap: {
    flex: 1,
  },
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

  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginVertical: 4,
  },
  infoLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    marginRight: 8,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  infoValue: {
    flex: 1,
    fontSize: 12,
    textAlign: "right",
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