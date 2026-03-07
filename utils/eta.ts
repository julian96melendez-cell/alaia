// utils/eta.ts
// ======================================================
// ETA Engine — Enterprise / Amazon-like
// - No depende de APIs externas
// - Usa el timeline (eventos reales)
// - Entrega:
//   - progreso 0..1
//   - texto humanizado
//   - ETA estimado (best-effort)
// ======================================================

export type TimelineItem = {
  type: string;
  label: string;
  at: string;
  isCompleted?: boolean;
  isCurrent?: boolean;
};

export type EtaResult = {
  progress: number; // 0..1
  etaText: string; // "Llega hoy", "Llega en 2-3 días", etc.
  etaDateISO: string | null; // fecha estimada (best-effort)
  confidence: "low" | "medium" | "high";
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeDate(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function hoursBetween(a: Date, b: Date) {
  return Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60);
}

function addHours(d: Date, hours: number) {
  return new Date(d.getTime() + hours * 60 * 60 * 1000);
}

function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Reglas base por "fase" (puedes tunear luego con data real)
 * Las horas son rangos aproximados.
 */
const ETA_RULES: Array<{
  match: (type: string) => boolean;
  minHours: number;
  maxHours: number;
  confidence: EtaResult["confidence"];
}> = [
  {
    match: (t) => t.includes("fulfillment_pendiente"),
    minHours: 24,
    maxHours: 72,
    confidence: "low",
  },
  {
    match: (t) => t.includes("fulfillment_procesando"),
    minHours: 12,
    maxHours: 48,
    confidence: "medium",
  },
  {
    match: (t) => t.includes("fulfillment_enviado"),
    minHours: 6,
    maxHours: 48,
    confidence: "medium",
  },
  {
    match: (t) => t.includes("fulfillment_entregado"),
    minHours: 0,
    maxHours: 0,
    confidence: "high",
  },
  {
    match: (t) => t.includes("fulfillment_cancelado"),
    minHours: 0,
    maxHours: 0,
    confidence: "high",
  },
];

function formatEtaText(minHours: number, maxHours: number) {
  if (maxHours <= 0) return "Finalizado";

  const minDays = Math.ceil(minHours / 24);
  const maxDays = Math.ceil(maxHours / 24);

  // Menos de 24h -> "hoy" / "en horas"
  if (maxHours <= 24) {
    if (minHours <= 6) return "Llega muy pronto";
    return "Llega hoy / mañana";
  }

  if (minDays === maxDays) return `Llega en ${maxDays} día(s)`;
  return `Llega en ${minDays}-${maxDays} días`;
}

/**
 * Calcula progreso y ETA a partir del timeline
 */
export function computeETA(timeline: TimelineItem[]): EtaResult {
  const tl = Array.isArray(timeline) ? timeline : [];
  if (!tl.length) {
    return { progress: 0, etaText: "Sin ETA", etaDateISO: null, confidence: "low" };
  }

  const last = tl[tl.length - 1];
  const type = String(last?.type || "");
  const lastAt = safeDate(last?.at);

  // Final states
  if (type.includes("entregado")) {
    return { progress: 1, etaText: "Entregado", etaDateISO: lastAt?.toISOString() || null, confidence: "high" };
  }
  if (type.includes("cancelado")) {
    return { progress: 1, etaText: "Cancelado", etaDateISO: null, confidence: "high" };
  }

  // Progreso: basado en items completos/actuales si vienen, sino por posición
  const completedCount = tl.filter((x) => x?.isCompleted).length;
  const hasFlags = tl.some((x) => typeof x.isCompleted === "boolean" || typeof x.isCurrent === "boolean");

  let progress = 0;
  if (hasFlags) {
    const denom = Math.max(1, tl.length);
    progress = clamp((completedCount + 0.35) / denom, 0, 0.95);
  } else {
    // fallback simple: avanza con el tamaño del timeline
    progress = clamp((tl.length - 1) / Math.max(1, tl.length + 2), 0, 0.9);
  }

  // Reglas por estado
  const rule = ETA_RULES.find((r) => r.match(type));
  const minHours = rule?.minHours ?? 24;
  const maxHours = rule?.maxHours ?? 72;
  const confidence = rule?.confidence ?? "low";

  const etaBase = lastAt || new Date();
  // ETA “best effort”: usamos el maxHours como fecha estimada (más segura)
  const etaDate = maxHours === 0 ? etaBase : addHours(etaBase, maxHours);

  return {
    progress,
    etaText: formatEtaText(minHours, maxHours),
    etaDateISO: etaDate.toISOString(),
    confidence,
  };
}

/**
 * UI helper: "Llega el martes 5, 3:20 PM" (best-effort)
 */
export function formatEtaDate(etaDateISO: string | null) {
  if (!etaDateISO) return null;
  const d = safeDate(etaDateISO);
  if (!d) return null;
  return d.toLocaleString();
}