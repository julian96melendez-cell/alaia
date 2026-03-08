"use client";

import React from "react";
import { computeETA, formatEtaDate } from "../../../utils/eta";

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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function TrackingTimeline({ timeline }: Props) {
  if (!timeline || timeline.length === 0) {
    return (
      <div style={styles.empty}>
        <span style={styles.emptyText}>Sin movimientos aún</span>
      </div>
    );
  }

  const eta = computeETA(timeline);
  const etaDate = formatEtaDate(eta.etaDateISO);
  const progress = `${clamp(eta.progress, 0, 1) * 100}%`;

  return (
    <div style={styles.wrapper}>
      <div style={styles.headerCard}>
        <div style={styles.headerTitle}>Entrega estimada</div>
        <div style={styles.headerEta}>{eta.etaText}</div>

        {etaDate ? <div style={styles.headerSub}>{etaDate}</div> : null}

        <div style={styles.progressBar}>
          <div style={{ ...styles.progressFill, width: progress }} />
        </div>

        <div style={styles.headerHint}>
          Confianza:{" "}
          <span style={styles.headerHintStrong}>
            {eta.confidence.toUpperCase()}
          </span>
        </div>
      </div>

      {timeline.map((item, index) => {
        const isLast = index === timeline.length - 1;
        const completed = item.isCompleted === true;
        const current = item.isCurrent === true;

        return (
          <div key={`${item.type}-${item.at}`} style={styles.row}>
            <div style={styles.left}>
              <div
                style={{
                  ...styles.dot,
                  ...(completed ? styles.dotCompleted : {}),
                  ...(current ? styles.dotCurrent : {}),
                }}
              />
              {!isLast && (
                <div
                  style={{
                    ...styles.line,
                    ...(completed ? styles.lineCompleted : {}),
                  }}
                />
              )}
            </div>

            <div style={styles.content}>
              <div
                style={{
                  ...styles.label,
                  ...(current ? styles.labelCurrent : {}),
                  ...(completed ? styles.labelCompleted : {}),
                }}
              >
                {item.label}
              </div>

              <div style={styles.date}>
                {new Date(item.at).toLocaleString()}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
    fontWeight: 900,
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
    transition: "width 0.7s ease",
  },
  headerHint: {
    marginTop: 8,
    fontSize: 12,
    color: "#445",
  },
  headerHintStrong: {
    fontWeight: 800,
  },
  row: {
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-start",
  },
  left: {
    width: 28,
    display: "flex",
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
    transform: "scale(1.2)",
  },
  line: {
    width: 2,
    flex: 1,
    minHeight: 28,
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
    fontWeight: 900,
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
    padding: "12px 0",
    display: "flex",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 13,
    color: "#777",
    fontStyle: "italic",
  },
};