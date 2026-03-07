import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { computeETA, formatEtaDate } from "../../../utils/eta";

/**
 * ======================================================
 * TIPOS
 * ======================================================
 */
export type TimelineItem = {
  type: string;
  label: string;
  at: string;
  isCompleted?: boolean;
  isCurrent?: boolean;
};

type Props = {
  timeline: TimelineItem[];
};

/**
 * ======================================================
 * UTILS
 * ======================================================
 */
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * ======================================================
 * COMPONENT
 * ======================================================
 */
export default function TrackingTimeline({ timeline }: Props) {
  if (!timeline || timeline.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Sin movimientos aún</Text>
      </View>
    );
  }

  const eta = computeETA(timeline);
  const etaDate = formatEtaDate(eta.etaDateISO);

  /**
   * ======================================================
   * ANIMACIÓN PROGRESO
   * ======================================================
   */
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: clamp(eta.progress, 0, 1),
      duration: 700,
      useNativeDriver: false,
    }).start();
  }, [eta.progress]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  /**
   * ======================================================
   * RENDER
   * ======================================================
   */
  return (
    <View style={styles.wrapper}>
      {/* HEADER ETA */}
      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>Entrega estimada</Text>
        <Text style={styles.headerEta}>{eta.etaText}</Text>

        {etaDate ? <Text style={styles.headerSub}>{etaDate}</Text> : null}

        <View style={styles.progressBar}>
          <Animated.View
            style={[styles.progressFill, { width: progressWidth }]}
          />
        </View>

        <Text style={styles.headerHint}>
          Confianza:{" "}
          <Text style={styles.headerHintStrong}>
            {eta.confidence.toUpperCase()}
          </Text>
        </Text>
      </View>

      {/* TIMELINE */}
      {timeline.map((item, index) => {
        const isLast = index === timeline.length - 1;
        const completed = item.isCompleted === true;
        const current = item.isCurrent === true;

        return (
          <View key={`${item.type}-${item.at}`} style={styles.row}>
            {/* LEFT */}
            <View style={styles.left}>
              <View
                style={[
                  styles.dot,
                  completed && styles.dotCompleted,
                  current && styles.dotCurrent,
                ]}
              />

              {!isLast && (
                <View
                  style={[
                    styles.line,
                    completed && styles.lineCompleted,
                  ]}
                />
              )}
            </View>

            {/* CONTENT */}
            <View style={styles.content}>
              <Text
                style={[
                  styles.label,
                  current && styles.labelCurrent,
                  completed && styles.labelCompleted,
                ]}
              >
                {item.label}
              </Text>

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
    marginTop: 12,
  },

  headerCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#eef3ff",
    marginBottom: 16,
  },

  headerTitle: {
    fontSize: 12,
    color: "#445",
    marginBottom: 4,
  },

  headerEta: {
    fontSize: 17,
    fontWeight: "900",
    color: "#1c2a55",
  },

  headerSub: {
    marginTop: 4,
    fontSize: 12,
    color: "#445",
  },

  progressBar: {
    marginTop: 12,
    height: 10,
    backgroundColor: "#dfe7ff",
    borderRadius: 10,
    overflow: "hidden",
  },

  progressFill: {
    height: 10,
    backgroundColor: "#2a6df4",
    borderRadius: 10,
  },

  headerHint: {
    marginTop: 8,
    fontSize: 12,
    color: "#445",
  },

  headerHintStrong: {
    fontWeight: "800",
  },

  row: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  left: {
    width: 28,
    alignItems: "center",
  },

  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#cfd3da",
    marginTop: 2,
  },

  dotCompleted: {
    backgroundColor: "#4caf50",
  },

  dotCurrent: {
    backgroundColor: "#2a6df4",
    transform: [{ scale: 1.2 }],
  },

  line: {
    width: 2,
    flex: 1,
    backgroundColor: "#e0e0e0",
    marginTop: 2,
  },

  lineCompleted: {
    backgroundColor: "#4caf50",
  },

  content: {
    flex: 1,
    paddingBottom: 18,
  },

  label: {
    fontSize: 15,
    color: "#333",
  },

  labelCurrent: {
    fontWeight: "900",
    color: "#2a6df4",
  },

  labelCompleted: {
    color: "#2e7d32",
  },

  date: {
    fontSize: 12,
    color: "#777",
    marginTop: 2,
  },

  empty: {
    paddingVertical: 12,
    alignItems: "center",
  },

  emptyText: {
    fontSize: 13,
    color: "#777",
    fontStyle: "italic",
  },
});