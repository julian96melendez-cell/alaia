// app/bluetooth.tsx
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
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
import { useThemeContext } from "../context/ThemeContext";

/* ------------------------------------------------------- */
/*        TIPOS DE DISPOSITIVOS (SIMULACIÓN FUTURISTA)     */
/* ------------------------------------------------------- */

type Device = {
  id: string;
  name: string;
  type: "audio" | "wearable" | "other";
  connected: boolean;
  battery?: number;
  lastSync?: string;
};

export default function BluetoothScreen() {
  const { colors, isDarkMode } = useThemeContext();
  const router = useRouter();

  const [enabled, setEnabled] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<Device[]>([
    {
      id: "1",
      name: "ALAIA Pods Ultra",
      type: "audio",
      connected: true,
      battery: 82,
      lastSync: "Hace 2 min",
    },
    {
      id: "2",
      name: "ALAIA Fit Vision Watch",
      type: "wearable",
      connected: false,
      battery: 56,
      lastSync: "Ayer",
    },
    {
      id: "3",
      name: "SmartBand AirTrack",
      type: "wearable",
      connected: false,
      battery: 49,
      lastSync: "Hace 3 días",
    },
  ]);

  /* ------------------------------------------------------- */
  /*               ANIMACIONES FUTURISTAS                   */
  /* ------------------------------------------------------- */

  const fade = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 480,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 480,
        useNativeDriver: true,
      }),
    ]).start();

    // Pulso suave del icono principal
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.06,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [fade, translateY, pulse]);

  /* ------------------------------------------------------- */
  /*               ACCIONES DEL SISTEMA                     */
  /* ------------------------------------------------------- */

  const openSystemBluetoothSettings = async () => {
    try {
      await Linking.openSettings();
    } catch {
      Alert.alert(
        "No se pudo abrir ajustes",
        "Por favor abre la configuración de Bluetooth desde el sistema."
      );
    }
  };

  const toggleSimulated = () => {
    setEnabled((prev) => !prev);
  };

  const toggleDeviceConnection = (id: string) => {
    setDevices((prev) =>
      prev.map((d) =>
        d.id === id
          ? { ...d, connected: !d.connected, lastSync: "Ahora mismo" }
          : d
      )
    );
  };

  const handleScanDevices = () => {
    if (isScanning) return;
    setIsScanning(true);

    setTimeout(() => {
      setDevices((prev) => {
        const exists = prev.some((d) => d.id === "4");
        if (exists) {
          return prev.map((d) =>
            d.id === "4"
              ? { ...d, connected: true, lastSync: "Hace 1 min", battery: 91 }
              : d
          );
        }
        return [
          {
            id: "4",
            name: "ALAIA Speaker Neo",
            type: "audio",
            connected: true,
            battery: 91,
            lastSync: "Recién encontrado",
          },
          ...prev,
        ];
      });
      setIsScanning(false);
    }, 2200);
  };

  /* ------------------------------------------------------- */
  /*                      UI PRINCIPAL                       */
  /* ------------------------------------------------------- */

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.background },
      ]}
    >
      <StatusBar
        barStyle={isDarkMode ? "light-content" : "dark-content"}
        translucent
        backgroundColor="transparent"
      />

      {/* Capa decorativa de fondo */}
      <View style={styles.decorLayer}>
        <LinearGradient
          colors={
            isDarkMode
              ? ["rgba(56,189,248,0.18)", "transparent"]
              : ["rgba(99,102,241,0.14)", "transparent"]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.decorBlobTop}
        />
        <LinearGradient
          colors={
            isDarkMode
              ? ["rgba(139,92,246,0.18)", "transparent"]
              : ["rgba(45,212,191,0.16)", "transparent"]
          }
          start={{ x: 1, y: 1 }}
          end={{ x: 0, y: 0 }}
          style={styles.decorBlobBottom}
        />
      </View>

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Conexiones inalámbricas
        </Text>

        <View style={{ width: 24 }} />
      </View>

      <Animated.View
        style={{
          flex: 1,
          opacity: fade,
          transform: [{ translateY }],
        }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* BLOQUE PRINCIPAL ESTADO BLUETOOTH */}
          <LinearGradient
            colors={
              enabled
                ? isDarkMode
                  ? ["#0F172A", "#1D2538"]
                  : ["#EEF2FF", "#FFFFFF"]
                : isDarkMode
                ? ["#111827", "#020617"]
                : ["#FEE2E2", "#FFFFFF"]
            }
            style={[
              styles.mainCardGradient,
              {
                borderColor: enabled ? colors.primary + "44" : "#FCA5A5",
              },
            ]}
          >
            <View style={styles.mainCardInner}>
              <Animated.View
                style={[
                  styles.mainIconCircle,
                  {
                    backgroundColor: enabled
                      ? colors.primary + "22"
                      : "#FECACA",
                    transform: [{ scale: pulse }],
                  },
                ]}
              >
                <Ionicons
                  name={enabled ? "bluetooth-outline" : "close-circle-outline"}
                  size={30}
                  color={enabled ? colors.primary : "#EF4444"}
                />
              </Animated.View>

              <View style={styles.mainTextBlock}>
                <Text style={[styles.mainTitle, { color: colors.text }]}>
                  {enabled ? "Bluetooth activado" : "Bluetooth desactivado"}
                </Text>
                <Text
                  style={[
                    styles.mainSubtitle,
                    { color: colors.textSecondary },
                  ]}
                >
                  {enabled
                    ? "Tus dispositivos ALAIA se conectan de forma inteligente y segura."
                    : "Activa Bluetooth para emparejar auriculares, relojes y más."}
                </Text>

                <View style={styles.mainChipsRow}>
                  <View style={styles.mainChip}>
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={13}
                      color="#22C55E"
                    />
                    <Text style={styles.mainChipText}>Conexiones cifradas</Text>
                  </View>
                  <View style={styles.mainChip}>
                    <Ionicons
                      name="sparkles-outline"
                      size={13}
                      color="#A855F7"
                    />
                    <Text style={styles.mainChipText}>Optimizado para ALAIA</Text>
                  </View>
                </View>
              </View>
            </View>
          </LinearGradient>

          {/* ACCIONES RÁPIDAS */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Acciones rápidas
          </Text>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
              activeOpacity={0.9}
              onPress={toggleSimulated}
            >
              <View style={styles.actionIconWrap}>
                <Ionicons
                  name={
                    enabled
                      ? "pause-circle-outline"
                      : "play-circle-outline"
                  }
                  size={22}
                  color={colors.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionTitle, { color: colors.text }]}>
                  {enabled ? "Simular apagado" : "Simular encendido"}
                </Text>
                <Text
                  style={[
                    styles.actionSubtitle,
                    { color: colors.textSecondary },
                  ]}
                >
                  Útil para probar estados sin cambiar el sistema.
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionBtn,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
              activeOpacity={0.9}
              onPress={openSystemBluetoothSettings}
            >
              <View style={styles.actionIconWrap}>
                <Ionicons
                  name="settings-outline"
                  size={22}
                  color={colors.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionTitle, { color: colors.text }]}>
                  Abrir ajustes
                </Text>
                <Text
                  style={[
                    styles.actionSubtitle,
                    { color: colors.textSecondary },
                  ]}
                >
                  Ir directamente a la configuración del sistema.
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* ESCANEO / NUEVOS DISPOSITIVOS */}
          <View
            style={[
              styles.scanCard,
              {
                backgroundColor: isDarkMode ? "#020617" : "#F9FAFB",
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.scanHeaderRow}>
              <View style={styles.scanHeaderLeft}>
                <View
                  style={[
                    styles.scanIconCircle,
                    { backgroundColor: colors.primary + "1A" },
                  ]}
                >
                  <Ionicons
                    name="scan-outline"
                    size={20}
                    color={colors.primary}
                  />
                </View>
                <View>
                  <Text style={[styles.scanTitle, { color: colors.text }]}>
                    Escanear dispositivos
                  </Text>
                  <Text
                    style={[
                      styles.scanSubtitle,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Detecta nuevos accesorios compatibles alrededor.
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.scanButton,
                  {
                    backgroundColor: isScanning
                      ? colors.border
                      : colors.primary,
                  },
                ]}
                activeOpacity={0.9}
                onPress={handleScanDevices}
                disabled={isScanning}
              >
                {isScanning ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Ionicons name="search-outline" size={18} color="#FFF" />
                )}
                <Text style={styles.scanButtonText}>
                  {isScanning ? "Buscando..." : "Escanear"}
                </Text>
              </TouchableOpacity>
            </View>

            <Text
              style={[
                styles.scanHint,
                { color: colors.textSecondary },
              ]}
            >
              Consejo: mantén tus dispositivos cerca y con Bluetooth activado.
            </Text>
          </View>

          {/* LISTA DE DISPOSITIVOS */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Dispositivos vinculados
          </Text>

          {devices.map((d) => {
            const icon =
              d.type === "audio"
                ? "headset-outline"
                : d.type === "wearable"
                ? "watch-outline"
                : "hardware-chip-outline";

            const typeLabel =
              d.type === "audio"
                ? "Audio"
                : d.type === "wearable"
                ? "Wearable"
                : "Otro";

            return (
              <View
                key={d.id}
                style={[
                  styles.deviceCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.deviceLeft}>
                  <View
                    style={[
                      styles.deviceIconCircle,
                      {
                        backgroundColor: d.connected
                          ? "#22C55E22"
                          : isDarkMode
                          ? "#020617"
                          : "#E5E7EB",
                      },
                    ]}
                  >
                    <Ionicons
                      name={icon as any}
                      size={22}
                      color={d.connected ? "#22C55E" : "#6B7280"}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={[styles.deviceName, { color: colors.text }]}>
                      {d.name}
                    </Text>

                    <View style={styles.deviceMetaRow}>
                      <Text
                        style={[
                          styles.deviceMetaText,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {d.connected ? "Conectado" : "No conectado"}
                        {d.lastSync ? ` • ${d.lastSync}` : ""}
                      </Text>

                      <View style={styles.devicePillsRow}>
                        <View style={styles.devicePill}>
                          <Ionicons
                            name="pricetag-outline"
                            size={11}
                            color="#6B7280"
                          />
                          <Text style={styles.devicePillText}>{typeLabel}</Text>
                        </View>
                        {typeof d.battery === "number" && (
                          <View style={styles.devicePill}>
                            <Ionicons
                              name={
                                d.battery > 70
                                  ? "battery-full-outline"
                                  : d.battery > 30
                                  ? "battery-half-outline"
                                  : "battery-dead-outline"
                              }
                              size={11}
                              color="#16A34A"
                            />
                            <Text style={styles.devicePillText}>
                              {d.battery}%
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.deviceAction}
                  activeOpacity={0.85}
                  onPress={() => toggleDeviceConnection(d.id)}
                >
                  <Text
                    style={[
                      styles.deviceActionText,
                      { color: d.connected ? "#EF4444" : colors.primary },
                    ]}
                  >
                    {d.connected ? "Desconectar" : "Conectar"}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}

          {/* TIPS / EDUCACIÓN */}
          <View
            style={[
              styles.tipsCard,
              {
                backgroundColor: isDarkMode ? "#020617" : "#F9FAFB",
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Consejos de uso
            </Text>
            <Text style={styles.tip}>
              • Desactiva Bluetooth cuando no lo necesites para mejorar la batería.
            </Text>
            <Text style={styles.tip}>
              • Elimina dispositivos antiguos o duplicados para evitar conflictos.
            </Text>
            <Text style={styles.tip}>
              • Mantén tus accesorios cerca del teléfono mientras los vinculas.
            </Text>
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

/* ------------------------------------------------------- */
/*                        ESTILOS                          */
/* ------------------------------------------------------- */

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) + 8 : 52,
  },

  /* CAPA DECORATIVA DE FONDO */
  decorLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: -1,
  },
  decorBlobTop: {
    position: "absolute",
    top: -40,
    right: -80,
    width: 220,
    height: 220,
    borderRadius: 220,
  },
  decorBlobBottom: {
    position: "absolute",
    bottom: -60,
    left: -60,
    width: 260,
    height: 260,
    borderRadius: 260,
  },

  /* HEADER */
  header: {
    height: 50,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
  },

  scroll: {
    paddingHorizontal: 18,
    paddingBottom: 32,
  },

  /* MAIN CARD */
  mainCardGradient: {
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 18,
    padding: 14,
  },
  mainCardInner: {
    flexDirection: "row",
    alignItems: "center",
  },
  mainIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  mainTextBlock: {
    flex: 1,
  },
  mainTitle: {
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 4,
  },
  mainSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  mainChipsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  mainChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.03)",
  },
  mainChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
  },

  /* SECCIONES */
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 10,
    marginTop: 4,
  },

  /* ACCIONES RÁPIDAS */
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
  },
  actionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(99,102,241,0.08)",
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  actionSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },

  /* ESCANEO */
  scanCard: {
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    marginBottom: 18,
  },
  scanHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  scanHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  scanIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  scanTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  scanSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  scanButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  scanHint: {
    marginTop: 8,
    fontSize: 11,
  },

  /* DISPOSITIVOS */
  deviceCard: {
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  deviceLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  deviceIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  deviceName: {
    fontSize: 15,
    fontWeight: "800",
  },
  deviceMetaRow: {
    marginTop: 4,
  },
  deviceMetaText: {
    fontSize: 12,
    marginBottom: 4,
  },
  devicePillsRow: {
    flexDirection: "row",
    gap: 6,
  },
  devicePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#E5E7EB55",
  },
  devicePillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4B5563",
  },
  deviceAction: {
    alignSelf: "center",
    paddingHorizontal: 10,
  },
  deviceActionText: {
    fontSize: 13,
    fontWeight: "800",
  },

  /* TIPS */
  tipsCard: {
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  tip: {
    fontSize: 13,
    marginBottom: 4,
    color: "#64748B",
  },
});