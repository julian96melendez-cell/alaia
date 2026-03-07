import { TimelineItem } from "./TrackingClient";

const MINUTES = 60 * 1000;

export function calculateETA(timeline: TimelineItem[]) {
  if (!timeline.length) return null;

  const now = Date.now();
  const last = timeline[timeline.length - 1];

  const avgDurations: Record<string, number> = {
    fulfillment_pendiente: 10 * MINUTES,
    fulfillment_procesando: 20 * MINUTES,
    fulfillment_enviado: 30 * MINUTES,
  };

  const remaining =
    avgDurations[last.type] ?? 15 * MINUTES;

  const etaFrom = new Date(now + remaining * 0.8);
  const etaTo = new Date(now + remaining * 1.2);

  return {
    from: etaFrom,
    to: etaTo,
  };
}