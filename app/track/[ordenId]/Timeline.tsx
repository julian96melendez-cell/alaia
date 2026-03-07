import { useEffect } from "react";
import {
    LayoutAnimation,
    Platform,
    StyleSheet,
    Text,
    UIManager,
    View,
} from "react-native";
import type { TimelineItem } from "./TrackingClient";

/**
 * ======================================================
 * ANDROID FIX — HABILITAR LAYOUT ANIMATION
 * ======================================================
 * ⚠️ Requerido SOLO en Android
 * ⚠️ Esto es OFICIAL en React Native
 */
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = {
  timeline: TimelineItem[];
};

export default function Timeline({ timeline }: Props) {
  useEffect(() => {
    // Animación suave tipo Amazon / Uber
    LayoutAnimation.configureNext(
      LayoutAnimation.Presets.easeInEaseOut
    );
  }, [timeline]);

  if (!timeline.length) {
    return (
      <Text style={styles.empty}>Aún no hay movimientos</Text>
    );
  }

  return (
    <View style={styles.wrapper}>
      {timeline.map((item, index) => {
        const isLast = index === timeline.length - 1;

        return (
          <View key={`${item.type}-${index}`} style={styles.row}>
            {/* Línea vertical */}
            <View style={styles.left}>
              <View style={styles.dot} />
              {!isLast && <View style={styles.line} />}
            </View>

            {/* Contenido */}
            <View style={styles.content}>
              <Text style={styles.label}>{item.label}</Text>
              <Text style={styles.date}>
                {new Date(item.at).toLocaleString()}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/**
 * ======================================================
 * ESTILOS
 * ======================================================
 */
const styles = StyleSheet.create({
  wrapper: {
    marginTop: 8,
  },
  row: {
    flexDirection: "row",
    marginBottom: 16,
  },
  left: {
    alignItems: "center",
    width: 24,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#2a6df4",
    marginTop: 4,
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: "#d0d7ff",
    marginTop: 4,
  },
  content: {
    flex: 1,
    paddingLeft: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  date: {
    fontSize: 12,
    color: "#777",
  },
  empty: {
    color: "#666",
    fontStyle: "italic",
    marginTop: 8,
  },
});