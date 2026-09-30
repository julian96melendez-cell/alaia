export type EtaTimelineItem = {
  type: string;
  label?: string;
  at?: string;
};

const MINUTES = 60 * 1000;

export function calculateETA(timeline: EtaTimelineItem[]) {
  if (!timeline.length) return null;

  const now = Date.now();
  const last = timeline[timeline.length - 1];

  const avgDurations: Record<string, number> = {
    recibido: 45 * MINUTES,
    confirmada: 45 * MINUTES,
    preparando: 30 * MINUTES,
    en_preparacion: 30 * MINUTES,
    en_camino: 18 * MINUTES,
    fulfillment_pendiente: 45 * MINUTES,
    fulfillment_procesando: 30 * MINUTES,
    fulfillment_enviado: 18 * MINUTES,
    entregado: 0,
    cancelado: 0,
  };

  const remaining = avgDurations[last.type] ?? 25 * MINUTES;

  if (remaining <= 0) {
    return null;
  }

  return {
    from: new Date(now + remaining * 0.8),
    to: new Date(now + remaining * 1.2),
  };
}