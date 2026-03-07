// app/(tabs)/mobile.tsx
// Centro del dispositivo / Device Hub – AlaïaOS Edition
// Usa: expo-device, expo-battery, expo-network, expo-brightness, expo-haptics

import { Ionicons } from "@expo/vector-icons";
import * as Battery from "expo-battery";
import * as Brightness from "expo-brightness";
import * as Device from "expo-device";
import * as Haptics from "expo-haptics";
import * as Network from "expo-network";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useThemeContext } from "../../context/ThemeContext";

type BatteryInfo = {
  level: number | null; // 0 – 1
  state: Battery.BatteryState | null;
  lowPowerMode: boolean | null;
};

type NetworkInfo = {
  isConnected: boolean | null;
  type: Network.NetworkStateType | null;
  ipAddress: string | null;
};

export default function MobileScreen() {
  const { colors, isDarkMode } = useThemeContext();
  const router = useRouter();

  const [battery, setBattery] = useState<BatteryInfo>({
    level: null,
    state: null,
    lowPowerMode: null,
  });

  const [network, setNetwork] = useState<NetworkInfo>({
    isConnected: null,
    type: null,
    ipAddress: null,
  });

  const [brightness, setBrightness] = useState<number | null>(null);
  const [loadingBrightness, setLoadingBrightness] = useState(false);
  const [loadingNetwork, setLoadingNetwork] = useState(true);
  const [loadingBattery, setLoadingBattery] = useState(true);

  const [introAnim] = useState(new Animated.Value(0));

  // Animación de entrada suave
  useEffect(() => {
    Animated.timing(introAnim, {
      toValue: 1,
      duration: 550,
      useNativeDriver: true,
    }).start();
  }, [introAnim]);

  // --------- BATERÍA REAL ---------
  useEffect(() => {
    let batteryLevelSub: Battery.Subscription | null = null;
    let batteryStateSub: Battery.Subscription | null = null;
    let lowPowerSub: Battery.Subscription | null = null;

    const loadBattery = async () => {
      try {
        const [level, state, lowPowerMode] = await Promise.all([
          Battery.getBatteryLevelAsync(),
          Battery.getBatteryStateAsync(),
          Battery.isLowPowerModeEnabledAsync(),
        ]);

        setBattery({
          level,
          state,
          lowPowerMode,
        });

        // Listeners en tiempo real
        batteryLevelSub = Battery.addBatteryLevelListener(({ batteryLevel }) => {
          setBattery((prev) => ({ ...prev, level: batteryLevel }));
        });

        batteryStateSub = Battery.addBatteryStateListener(({ batteryState }) => {
          setBattery((prev) => ({ ...prev, state: batteryState }));
        });

        lowPowerSub = Battery.addLowPowerModeListener(({ lowPowerMode }) => {
          setBattery((prev) => ({ ...prev, lowPowerMode }));
        });
      } catch (e) {
        console.warn("Error leyendo batería", e);
      } finally {
        setLoadingBattery(false);
      }
    };

    loadBattery();

    return () => {
      batteryLevelSub && batteryLevelSub.remove();
      batteryStateSub && batteryStateSub.remove();
      lowPowerSub && lowPowerSub.remove();
    };
  }, []);

  // --------- RED / WIFI / DATOS ---------
  useEffect(() => {
    const loadNetwork = async () => {
      try {
        const state = await Network.getNetworkStateAsync();
        const ip = await Network.getIpAddressAsync().catch(() => null);

        setNetwork({
          isConnected: state.isConnected ?? null,
          type: state.type ?? null,
          ipAddress: ip,
        });
      } catch (e) {
        console.warn("Error leyendo red", e);
      } finally {
        setLoadingNetwork(false);
      }
    };

    loadNetwork();
  }, []);

  // --------- BRILLO DE PANTALLA REAL ---------
  useEffect(() => {
    const loadBrightness = async () => {
      try {
        const { status } = await Brightness.requestPermissionsAsync();
        if (status !== "granted") {
          setBrightness(null);
          return;
        }
        const b = await Brightness.getBrightnessAsync();
        setBrightness(b);
      } catch (e) {
        console.warn("Error leyendo brillo", e);
      }
    };

    loadBrightness();
  }, []);

  const adjustBrightness = async (delta: number) => {
    try {
      setLoadingBrightness(true);
      const current = brightness ?? (await Brightness.getBrightnessAsync());
      let next = current + delta;
      if (next < 0.05) next = 0.05;
      if (next > 1) next = 1;
      await Brightness.setBrightnessAsync(next);
      setBrightness(next);
      Haptics.selectionAsync();
    } catch (e) {
      console.warn("Error ajustando brillo", e);
      Alert.alert("Error", "No se pudo cambiar el brillo.");
    } finally {
      setLoadingBrightness(false);
    }
  };

  // --------- DERIVADOS BONITOS ---------
  const batteryPercent = useMemo(
    () => (battery.level != null ? Math.round(battery.level * 100) : null),
    [battery.level]
  );

  const batteryStateLabel = useMemo(() => {
    switch (battery.state) {
      case Battery.BatteryState.CHARGING:
        return "Cargando";
      case Battery.BatteryState.FULL:
        return "Carga completa";
      case Battery.BatteryState.UNPLUGGED:
        return "Usando batería";
      default:
        return "Estado desconocido";
    }
  }, [battery.state]);

  const networkTypeLabel = useMemo(() => {
    switch (network.type) {
      case Network.NetworkStateType.WIFI:
        return "Wi-Fi";
      case Network.NetworkStateType.CELLULAR:
        return "Datos móviles";
      case Network.NetworkStateType.ETHERNET:
        return "Ethernet";
      case Network.NetworkStateType.VPN:
        return "VPN activa";
      case Network.NetworkStateType.OTHER:
        return "Otro";
      case Network.NetworkStateType.NONE:
        return "Sin conexión";
      case Network.NetworkStateType.UNKNOWN:
      default:
        return "Desconocido";
    }
  }, [network.type]);

  const brightnessPercent = useMemo(
    () => (brightness != null ? Math.round(brightness * 100) : null),
    [brightness]
  );

  const isOnline = network.isConnected === true;

  const headerTranslateY = introAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [20, 0],
  });

  const cardOpacity = introAnim;
  const cardTranslateY = introAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [30, 0],
  });

  const openSystemSettings = async () => {
    const url = Platform.OS === "ios" ? "app-settings:" : "android.settings.SETTINGS";

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert(
          "No disponible",
          "No se pudieron abrir los ajustes del sistema en este dispositivo."
        );
      }
    } catch (e) {
      Alert.alert("Error", "No se pudieron abrir los ajustes del sistema.");
    }
  };

  const testHaptics = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const deviceName = Device.deviceName || Device.modelName || "Tu dispositivo";
  const osLabel = `${Device.osName ?? "SO"} ${Device.osVersion ?? ""}`.trim();

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.background },
      ]}
    >
      <StatusBar
        barStyle={isDarkMode ? "light-content" : "dark-content"}
        backgroundColor="transparent"
        translucent
      />

      {/* HEADER */}
      <Animated.View
        style={[
          styles.header,
          {
            transform: [{ translateY: headerTranslateY }],
            opacity: introAnim,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={10}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              Centro del dispositivo
            </Text>
            <Text
              style={[
                styles.headerSubtitle,
                { color: colors.textSecondary },
              ]}
              numberOfLines={1}
            >
              {deviceName} • {osLabel}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={openSystemSettings}
          style={[
            styles.settingsPill,
            { borderColor: colors.border },
          ]}
        >
          <Ionicons
            name="settings-outline"
            size={16}
            color={colors.textSecondary}
          />
          <Text
            style={[
              styles.settingsPillText,
              { color: colors.textSecondary },
            ]}
          >
            Ajustes del sistema
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {/* CONTENIDO */}
      <Animated.View
        style={{
          flex: 1,
          opacity: cardOpacity,
          transform: [{ translateY: cardTranslateY }],
        }}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Tarjeta: Estado general del dispositivo */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.cardRowTop}>
              <View style={styles.iconCircleBig}>
                <Ionicons
                  name="phone-portrait-outline"
                  size={28}
                  color={colors.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.cardTitle, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {deviceName}
                </Text>
                <Text
                  style={[
                    styles.cardSubtitle,
                    { color: colors.textSecondary },
                  ]}
                  numberOfLines={2}
                >
                  {Device.brand ? `${Device.brand} • ` : ""}
                  {osLabel}
                </Text>
              </View>
            </View>

            <View style={styles.chipsRow}>
              <InfoChip
                icon="hardware-chip-outline"
                label="Modelo"
                value={
                  Device.modelName ??
                  Device.productName ??
                  "Desconocido"
                }
              />
              <InfoChip
                icon="phone-portrait-outline"
                label="Tipo"
                value={
                  Device.deviceType === Device.DeviceType.TABLET
                    ? "Tablet"
                    : Device.deviceType === Device.DeviceType.DESKTOP
                    ? "Escritorio"
                    : Device.deviceType === Device.DeviceType.TV
                    ? "TV"
                    : "Móvil"
                }
              />
            </View>

            <View style={styles.chipsRow}>
              <InfoChip
                icon="bug-outline"
                label="Modo"
                value={Device.isDevice ? "Dispositivo real" : "Emulador"}
              />
              <InfoChip
                icon="information-circle-outline"
                label="Build ID"
                value={Device.osBuildId ?? "N/D"}
              />
            </View>
          </View>

          {/* Tarjeta: Batería */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderLeft}>
                <View
                  style={[
                    styles.iconCircle,
                    { backgroundColor: "#22C55E22" },
                  ]}
                >
                  <Ionicons
                    name="battery-half-outline"
                    size={22}
                    color="#22C55E"
                  />
                </View>
                <View>
                  <Text
                    style={[styles.cardTitle, { color: colors.text }]}
                  >
                    Batería
                  </Text>
                  <Text
                    style={[
                      styles.cardSubtitle,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {batteryStateLabel}
                  </Text>
                </View>
              </View>

              {loadingBattery ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text
                  style={[
                    styles.batteryPercent,
                    { color: colors.text },
                  ]}
                >
                  {batteryPercent != null ? `${batteryPercent}%` : "N/D"}
                </Text>
              )}
            </View>

            <View style={styles.batteryBarBg}>
              <View
                style={[
                  styles.batteryBarFill,
                  {
                    width: `${Math.max(
                      5,
                      Math.min(100, batteryPercent ?? 0)
                    )}%`,
                    backgroundColor:
                      batteryPercent != null && batteryPercent < 25
                        ? "#F97316"
                        : "#22C55E",
                  },
                ]}
              />
            </View>

            <View style={styles.rowSpace}>
              <InfoPill
                icon="leaf-outline"
                text={
                  battery.lowPowerMode
                    ? "Modo de bajo consumo activado"
                    : "Modo de bajo consumo desactivado"
                }
                tone={battery.lowPowerMode ? "warning" : "neutral"}
              />
            </View>
          </View>

          {/* Tarjeta: Conectividad */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderLeft}>
                <View
                  style={[
                    styles.iconCircle,
                    { backgroundColor: "#0EA5E922" },
                  ]}
                >
                  <Ionicons
                    name={
                      network.type === Network.NetworkStateType.WIFI
                        ? "wifi-outline"
                        : "cellular-outline"
                    }
                    size={22}
                    color="#0EA5E9"
                  />
                </View>
                <View>
                  <Text
                    style={[styles.cardTitle, { color: colors.text }]}
                  >
                    Conectividad
                  </Text>
                  <Text
                    style={[
                      styles.cardSubtitle,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {loadingNetwork
                      ? "Comprobando red…"
                      : isOnline
                      ? "Conectado"
                      : "Sin conexión"}
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.onlineDot,
                  { backgroundColor: isOnline ? "#22C55E" : "#EF4444" },
                ]}
              />
            </View>

            <View style={styles.chipsRow}>
              <InfoChip
                icon={
                  network.type === Network.NetworkStateType.WIFI
                    ? "wifi-outline"
                    : "cellular-outline"
                }
                label="Tipo"
                value={networkTypeLabel}
              />
              <InfoChip
                icon="speedometer-outline"
                label="Estado"
                value={isOnline ? "Activa" : "Offline"}
              />
            </View>

            <View style={styles.chipsRow}>
              <InfoChip
                icon="globe-outline"
                label="IP local"
                value={network.ipAddress ?? "No disponible"}
              />
            </View>

            <View style={styles.rowSpace}>
              <InfoPill
                icon="shield-checkmark-outline"
                text="Las estadísticas avanzadas de red se pueden habilitar desde tu backend Alaïa."
                tone="neutral"
              />
            </View>
          </View>

          {/* Tarjeta: Brillo & feedback táctil */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderLeft}>
                <View
                  style={[
                    styles.iconCircle,
                    { backgroundColor: "#FACC1522" },
                  ]}
                >
                  <Ionicons
                    name="sunny-outline"
                    size={22}
                    color="#FACC15"
                  />
                </View>
                <View>
                  <Text
                    style={[styles.cardTitle, { color: colors.text }]}
                  >
                    Brillo de pantalla
                  </Text>
                  <Text
                    style={[
                      styles.cardSubtitle,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Ajusta el brillo global del dispositivo
                  </Text>
                </View>
              </View>

              {loadingBrightness && (
                <ActivityIndicator size="small" color={colors.primary} />
              )}
            </View>

            <View style={styles.brightnessRow}>
              <TouchableOpacity
                onPress={() => adjustBrightness(-0.1)}
                style={styles.brightnessBtn}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="moon-outline"
                  size={18}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>

              <View style={styles.brightnessMeterBg}>
                <View
                  style={[
                    styles.brightnessMeterFill,
                    {
                      width: `${
                        brightnessPercent != null
                          ? Math.max(5, Math.min(100, brightnessPercent))
                          : 30
                      }%`,
                      backgroundColor:
                        brightnessPercent != null && brightnessPercent > 80
                          ? "#F97316"
                          : colors.primary,
                    },
                  ]}
                />
              </View>

              <TouchableOpacity
                onPress={() => adjustBrightness(0.1)}
                style={styles.brightnessBtn}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="sunny-outline"
                  size={18}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>

              <Text
                style={[
                  styles.brightnessLabel,
                  { color: colors.textSecondary },
                ]}
              >
                {brightnessPercent != null ? `${brightnessPercent}%` : "N/D"}
              </Text>
            </View>

            <View style={styles.quickRow}>
              <TouchableOpacity
                style={styles.quickAction}
                activeOpacity={0.85}
                onPress={testHaptics}
              >
                <Ionicons
                  name="phone-portrait-outline"
                  size={18}
                  color={colors.primary}
                />
                <Text
                  style={[
                    styles.quickText,
                    { color: colors.text },
                  ]}
                >
                  Probar vibración
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickAction}
                activeOpacity={0.85}
                onPress={openSystemSettings}
              >
                <Ionicons
                  name="settings-outline"
                  size={18}
                  color={colors.primary}
                />
                <Text
                  style={[
                    styles.quickText,
                    { color: colors.text },
                  ]}
                >
                  Abrir ajustes
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>
      </Animated.View>
    </View>
  );
}

/* ---------- Subcomponentes pequeños ---------- */

function InfoChip({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.chip}>
      <Ionicons name={icon} size={14} color="#6B7280" />
      <View style={{ flex: 1 }}>
        <Text style={styles.chipLabel}>{label}</Text>
        <Text style={styles.chipValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function InfoPill({
  icon,
  text,
  tone = "neutral",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  tone?: "neutral" | "warning";
}) {
  const bg = tone === "warning" ? "#FEF3C7" : "#E5E7EB";
  const color = tone === "warning" ? "#92400E" : "#374151";
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={[styles.pillText, { color }]}>{text}</Text>
    </View>
  );
}

/* ---------- Estilos ---------- */

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop:
      Platform.OS === "android"
        ? (StatusBar.currentHeight ?? 0) + 8
        : 18,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
    backgroundColor: "rgba(148,163,184,0.16)",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  settingsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  settingsPillText: {
    fontSize: 11,
    fontWeight: "700",
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 24,
    gap: 14,
  },

  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },

  cardRowTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 10,
  },
  iconCircleBig: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6366F122",
  },

  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 12,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  cardSubtitle: {
    fontSize: 12,
    fontWeight: "600",
  },

  chipsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 6,
  },
  chip: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "rgba(148,163,184,0.08)",
  },
  chipLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  chipValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
    marginTop: 1,
  },

  batteryPercent: {
    fontSize: 20,
    fontWeight: "900",
  },
  batteryBarBg: {
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#E5E7EB",
    marginTop: 8,
  },
  batteryBarFill: {
    height: "100%",
    borderRadius: 999,
  },

  rowSpace: {
    marginTop: 10,
  },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pillText: {
    fontSize: 11,
    fontWeight: "700",
  },

  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  brightnessRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 8,
  },
  brightnessBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(148,163,184,0.16)",
  },
  brightnessMeterBg: {
    flex: 1,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
  },
  brightnessMeterFill: {
    height: "100%",
    borderRadius: 999,
  },
  brightnessLabel: {
    fontSize: 12,
    fontWeight: "700",
    minWidth: 42,
    textAlign: "right",
  },

  quickRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    gap: 10,
  },
  quickAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "rgba(148,163,184,0.08)",
  },
  quickText: {
    fontSize: 13,
    fontWeight: "700",
  },
});