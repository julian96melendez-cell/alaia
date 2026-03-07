// app/wifi.tsx
import { Ionicons } from "@expo/vector-icons";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    Animated,
    Dimensions,
    Linking,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

const { width } = Dimensions.get("window");

export default function WifiScreen() {
  const [netState, setNetState] = useState<NetInfoState | null>(null);
  const [checking, setChecking] = useState(true);

  const fade = useRef(new Animated.Value(0)).current;
  const scaleCard = useRef(new Animated.Value(0.96)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  const isConnected = netState?.isConnected ?? false;
  const connectionType = netState?.type ?? "unknown";

  /* ───────────────── Animaciones de entrada & pulso ───────────────── */

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.spring(scaleCard, {
        toValue: 1,
        speed: 1.1,
        bounciness: 14,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fade, scaleCard]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.08,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [pulse]);

  /* ───────────────── Lógica de red ───────────────── */

  const runCheck = useCallback(() => {
    setChecking(true);
    NetInfo.fetch()
      .then((state) => {
        setNetState(state);
      })
      .finally(() => {
        setTimeout(() => setChecking(false), 350);
      });
  }, []);

  useEffect(() => {
    runCheck();
    const unsubscribe = NetInfo.addEventListener((state) => {
      setNetState(state);
    });
    return () => unsubscribe();
  }, [runCheck]);

  // Si está conectado → redirigir suavemente al home
  useEffect(() => {
    if (netState && netState.isConnected) {
      const timeout = setTimeout(() => {
        router.replace("/(tabs)");
      }, 800);
      return () => clearTimeout(timeout);
    }
  }, [netState]);

  /* ───────────────── Acciones ───────────────── */

  const handleOpenSettings = () => {
    Linking.openSettings().catch(() => {
      // Si falla, solo ignoramos; no rompemos nada
    });
  };

  const getStatusLabel = () => {
    if (checking) return "Comprobando conexión…";
    if (!isConnected) return "Sin conexión a Internet";
    if (connectionType === "wifi") return "Conectado por Wi-Fi";
    if (connectionType === "cellular") return "Conectado con datos móviles";
    return "Conectado";
  };

  const getStatusDescription = () => {
    if (checking) {
      return "Estamos verificando el estado de tu red. Esto tomará solo un momento.";
    }
    if (!isConnected) {
      return "Parece que no tienes acceso a una red. Revisa tu Wi-Fi o datos móviles para seguir usando Alaïa.";
    }
    if (connectionType === "wifi") {
      return "Todo listo. Hemos detectado una red Wi-Fi estable. Te llevamos a la app.";
    }
    if (connectionType === "cellular") {
      return "Detectamos una conexión de datos móviles. Asegúrate de tener buena cobertura.";
    }
    return "Conexión detectada. Redirigiendo a tu experiencia Alaïa.";
  };

  const isOffline = !checking && !isConnected;

  /* ───────────────── UI ───────────────── */

  return (
    <LinearGradient
      colors={["#020617", "#020617", "#0B1120"]}
      style={styles.root}
    >
      {/* Decor superior */}
      <View style={styles.decorContainer}>
        <View style={styles.circleBig} />
        <View style={styles.circleSmall} />
      </View>

      <Animated.View
        style={[
          styles.card,
          {
            opacity: fade,
            transform: [{ scale: scaleCard }],
          },
        ]}
      >
        {/* Logo / marca */}
        <View style={styles.brandRow}>
          <View style={styles.logoDot} />
          <Text style={styles.brandName}>ALAÏA</Text>
        </View>

        {/* Icono principal */}
        <Animated.View
          style={[
            styles.iconCircle,
            {
              transform: [{ scale: pulse }],
              backgroundColor: isOffline ? "#F9731624" : "#22C55E26",
            },
          ]}
        >
          <Ionicons
            name={isOffline ? "wifi-outline" : "wifi"}
            size={52}
            color={isOffline ? "#F97316" : "#22C55E"}
          />
        </Animated.View>

        {/* Estado */}
        <Text
          style={[
            styles.title,
            { color: isOffline ? "#F97316" : "#22C55E" },
          ]}
        >
          {getStatusLabel()}
        </Text>

        <Text style={styles.subtitle}>{getStatusDescription()}</Text>

        {/* Chip de detalle */}
        <View style={styles.chipRow}>
          <View style={styles.chip}>
            <Ionicons
              name={isOffline ? "cloud-offline-outline" : "cloud-done-outline"}
              size={16}
              color="#E5E7EB"
            />
            <Text style={styles.chipText}>
              {isOffline ? "Modo sin conexión" : "Red disponible"}
            </Text>
          </View>
          {connectionType !== "unknown" && (
            <View style={[styles.chip, { backgroundColor: "#02061755" }]}>
              <Ionicons name="podium-outline" size={16} color="#E5E7EB" />
              <Text style={styles.chipText}>Tipo: {connectionType}</Text>
            </View>
          )}
        </View>

        {/* Botones */}
        <View style={styles.buttons}>
          {isOffline ? (
            <>
              <TouchableOpacity
                style={styles.buttonPrimary}
                activeOpacity={0.9}
                onPress={runCheck}
              >
                <LinearGradient
                  colors={["#6366F1", "#8B5CF6"]}
                  style={styles.buttonPrimaryInner}
                >
                  <Ionicons name="refresh" size={18} color="#FFF" />
                  <Text style={styles.buttonPrimaryText}>Reintentar conexión</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.buttonGhost}
                activeOpacity={0.9}
                onPress={handleOpenSettings}
              >
                <Ionicons name="settings-outline" size={17} color="#E5E7EB" />
                <Text style={styles.buttonGhostText}>Abrir ajustes de red</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.buttonSuccess}>
              <Ionicons name="checkmark-circle" size={18} color="#BBF7D0" />
              <Text style={styles.buttonSuccessText}>
                Todo listo, entrando a tu experiencia Alaïa…
              </Text>
            </View>
          )}
        </View>
      </Animated.View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Alaïa cuida tu experiencia incluso cuando estás sin conexión.
        </Text>
      </View>
    </LinearGradient>
  );
}

/* ───────────────────────── estilos ───────────────────────── */

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 22,
    justifyContent: "center",
    alignItems: "center",
  },

  decorContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 260,
    overflow: "hidden",
  },
  circleBig: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "#4F46E5",
    opacity: 0.25,
    top: -80,
    right: -80,
  },
  circleSmall: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "#22C55E",
    opacity: 0.18,
    top: 40,
    left: -40,
  },

  card: {
    width: width * 0.9,
    borderRadius: 24,
    paddingVertical: 26,
    paddingHorizontal: 20,
    backgroundColor: "#020617DD",
    borderWidth: 1,
    borderColor: "#1F2937",
  },

  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  logoDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#6366F1",
    marginRight: 8,
  },
  brandName: {
    fontSize: 14,
    letterSpacing: 3,
    fontWeight: "800",
    color: "#E5E7EB",
  },

  iconCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 14,
  },

  title: {
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: "#CBD5E1",
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 20,
  },

  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginBottom: 20,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#02061788",
    borderWidth: 1,
    borderColor: "#64748B88",
    gap: 6,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#E5E7EB",
  },

  buttons: {
    marginTop: 4,
    gap: 10,
  },

  buttonPrimary: {
    borderRadius: 14,
    overflow: "hidden",
  },
  buttonPrimaryInner: {
    paddingVertical: 12,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonPrimaryText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "800",
  },

  buttonGhost: {
    marginTop: 4,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#4B5563",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  buttonGhostText: {
    color: "#E5E7EB",
    fontSize: 13,
    fontWeight: "700",
  },

  buttonSuccess: {
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#22C55E55",
    backgroundColor: "#022C2255",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonSuccessText: {
    color: "#BBF7D0",
    fontSize: 13,
    fontWeight: "700",
  },

  footer: {
    position: "absolute",
    bottom: 26,
    left: 26,
    right: 26,
  },
  footerText: {
    textAlign: "center",
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
  },
});