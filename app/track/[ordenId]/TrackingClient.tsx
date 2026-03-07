import { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

/**
 * ======================================================
 * TIPOS — ALINEADOS CON BACKEND ENTERPRISE
 * ======================================================
 */
export type TimelineItem = {
  type: string;
  label: string;
  at: string; // ISO
  meta?: any;

  // Si tu backend ya los envía (enriched timeline), los soportamos sin exigirlos
  stepIndex?: number;
  isCompleted?: boolean;
  isCurrent?: boolean;
};

export type TrackingData = {
  ordenId: string;
  totalSteps?: number;
  currentStep?: string | null;
  timeline: TimelineItem[];
};

type ApiResponse<T> = {
  ok: boolean;
  message?: string;
  data?: T;
};

type Props = {
  ordenId: string;
};

/**
 * ======================================================
 * CONFIG
 * ======================================================
 */
const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:3001";

// Polling fallback (si SSE falla)
const REFRESH_INTERVAL_MS = 15_000;

// SSE reconnection backoff (ms)
const SSE_RETRY_BASE_MS = 800;
const SSE_RETRY_MAX_MS = 10_000;

// Heartbeat watchdog: si en X tiempo no llegan eventos, reiniciamos SSE
const SSE_STALE_MS = 45_000;

/**
 * ======================================================
 * UTILS
 * ======================================================
 */
function safeSortTimeline(tl: TimelineItem[]) {
  return [...(tl || [])].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  );
}

function timelinesAreEqual(a: TimelineItem[], b: TimelineItem[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].type !== b[i].type) return false;
    if (a[i].at !== b[i].at) return false;
    if (a[i].label !== b[i].label) return false;
  }
  return true;
}

function isFinalStateFromTimeline(timeline?: TimelineItem[]) {
  if (!timeline?.length) return false;
  const last = timeline[timeline.length - 1]?.type || "";
  return last.includes("entregado") || last.includes("cancelado");
}

/**
 * “Enriquecido” local (por si el backend NO manda isCurrent/isCompleted)
 * No rompe si ya venían.
 */
function enrichLocalTimeline(tl: TimelineItem[]) {
  if (!tl.length) return tl;
  const lastIndex = tl.length - 1;
  return tl.map((x, idx) => ({
    ...x,
    stepIndex: x.stepIndex ?? idx,
    isCompleted: x.isCompleted ?? idx < lastIndex,
    isCurrent: x.isCurrent ?? idx === lastIndex,
  }));
}

/**
 * Aplica snapshot/update SSE sin duplicar y sin re-render inútil.
 * Backend SSE manda:
 *  - type: "snapshot", data: { _id, historial, estadoPago, estadoFulfillment, createdAt }
 *  - type: "update", data: payload
 *
 * Nosotros NO dependemos de ese shape: si el payload trae historial, lo usamos;
 * si trae timeline “ya armada”, también.
 */
function buildTimelineFromSsePayload(payload: any): TrackingData | null {
  // Caso A: el backend SSE manda la Orden cruda con historial
  const orden = payload?.data || payload; // soporta {data: orden} o directamente orden
  const ordenId = orden?._id || orden?.ordenId;
  const historial = orden?.historial;

  // Si viene timeline ya armado
  if (orden?.timeline && Array.isArray(orden.timeline)) {
    const tl = enrichLocalTimeline(safeSortTimeline(orden.timeline));
    return { ordenId: String(ordenId || ""), timeline: tl };
  }

  // Si viene historial, el timeline “real” lo devuelve /timeline
  // pero igual podemos mostrar avances básicos usando historial (si existe)
  if (ordenId && Array.isArray(historial)) {
    const tl = historial
      .filter((x: any) => x?.fecha)
      .map((x: any, index: number) => ({
        type: String(x?.estado || "unknown"),
        label: String(x?.estado || "unknown"),
        at: new Date(x.fecha).toISOString(),
        meta: x?.meta || null,
        stepIndex: index,
      }));

    const sorted = safeSortTimeline(tl);
    return { ordenId: String(ordenId), timeline: enrichLocalTimeline(sorted) };
  }

  return null;
}

/**
 * ======================================================
 * COMPONENT
 * ======================================================
 */
export default function TrackingClient({ ordenId }: Props) {
  const [data, setData] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"realtime" | "polling">("realtime");
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const mountedRef = useRef(true);

  // SSE refs
  const esRef = useRef<EventSource | null>(null);
  const sseRetryRef = useRef<number>(SSE_RETRY_BASE_MS);
  const sseWatchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSseEventAtRef = useRef<number>(Date.now());

  /**
   * ======================================================
   * HTTP FETCH (timeline canonical)
   * ======================================================
   */
  const fetchTracking = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetch(
        `${BACKEND_URL}/api/ordenes/public/${ordenId}/timeline`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
        }
      );

      if (!res.ok) {
        throw new Error(
          res.status === 404
            ? "Orden no encontrada"
            : "No se pudo cargar el seguimiento"
        );
      }

      const json: ApiResponse<any> = await res.json();

      if (!json.ok || !json.data) {
        throw new Error(json.message || "Respuesta inválida del servidor");
      }

      const serverData = json.data;

      // Soporta backend que devuelve {ordenId, timeline} directamente
      const rawTimeline = Array.isArray(serverData.timeline) ? serverData.timeline : [];

      const nextTimeline = enrichLocalTimeline(safeSortTimeline(rawTimeline));

      if (!mountedRef.current) return;

      setData((prev) => {
        const next: TrackingData = {
          ordenId: String(serverData.ordenId || serverData._id || ordenId),
          totalSteps: serverData.totalSteps,
          currentStep: serverData.currentStep,
          timeline: nextTimeline,
        };

        if (!prev) return next;

        // Si no cambió timeline, evitamos re-render
        if (timelinesAreEqual(prev.timeline || [], next.timeline || [])) return prev;

        return next;
      });

      // Si es final, podemos detener polling/realtime
      if (isFinalStateFromTimeline(nextTimeline)) {
        stopAutoRefresh();
        stopSse();
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      if (!mountedRef.current) return;

      setError(err?.message || "Error inesperado");
    } finally {
      if (mountedRef.current && !silent) setLoading(false);
    }
  };

  /**
   * ======================================================
   * POLLING (fallback)
   * ======================================================
   */
  const startAutoRefresh = () => {
    stopAutoRefresh();
    intervalRef.current = setInterval(() => {
      fetchTracking(true);
    }, REFRESH_INTERVAL_MS);
  };

  const stopAutoRefresh = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  /**
   * ======================================================
   * SSE REALTIME
   * ======================================================
   */
  const stopSse = () => {
    if (esRef.current) {
      try {
        esRef.current.close();
      } catch {}
      esRef.current = null;
    }
    if (sseWatchdogRef.current) {
      clearInterval(sseWatchdogRef.current);
      sseWatchdogRef.current = null;
    }
  };

  const startSseWatchdog = () => {
    if (sseWatchdogRef.current) clearInterval(sseWatchdogRef.current);

    sseWatchdogRef.current = setInterval(() => {
      const delta = Date.now() - lastSseEventAtRef.current;
      if (delta > SSE_STALE_MS) {
        // SSE se “congeló” → reconectar
        restartSse();
      }
    }, 5_000);
  };

  const scheduleSseRetry = () => {
    stopSse();
    const delay = Math.min(sseRetryRef.current, SSE_RETRY_MAX_MS);

    // Backoff exponencial controlado
    sseRetryRef.current = Math.min(sseRetryRef.current * 1.6, SSE_RETRY_MAX_MS);

    setTimeout(() => {
      if (!mountedRef.current) return;
      startSse();
    }, delay);
  };

  const restartSse = () => {
    // Reinicio “limpio” sin cambiar de modo
    stopSse();
    startSse();
  };

  const startSse = () => {
    // En RN, EventSource puede requerir polyfill en algunos setups.
    // Si no existe, caemos a polling.
    if (typeof EventSource === "undefined") {
      setMode("polling");
      startAutoRefresh();
      return;
    }

    stopSse();

    try {
      const url = `${BACKEND_URL}/api/ordenes/public/${ordenId}/stream`;
      const es = new EventSource(url);
      esRef.current = es;

      // Reset backoff cuando conecta
      sseRetryRef.current = SSE_RETRY_BASE_MS;

      // Watchdog
      lastSseEventAtRef.current = Date.now();
      startSseWatchdog();

      es.onopen = () => {
        // Realtime activo → apagamos polling
        setMode("realtime");
        stopAutoRefresh();
      };

      es.onmessage = (event) => {
        lastSseEventAtRef.current = Date.now();

        let payload: any = null;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }

        // payload esperado: { type:"snapshot"|"update"|"ping"|"error", data:any }
        if (payload?.type === "ping") return;

        if (payload?.type === "error") {
          // No matamos todo: caemos a polling
          setMode("polling");
          stopSse();
          startAutoRefresh();
          return;
        }

        // Para snapshot/update: hacemos una estrategia robusta:
        // - 1) Intentamos construir timeline local rápido (para UX)
        // - 2) Hacemos fetchTracking(silent) para traer timeline “canonical”
        //    (porque tu endpoint /timeline es el que humaniza y enriquece perfecto)
        const maybe = buildTimelineFromSsePayload(payload);
        if (maybe?.ordenId) {
          setData((prev) => {
            if (!prev) return maybe;
            if (timelinesAreEqual(prev.timeline || [], maybe.timeline || [])) return prev;
            return { ...prev, ordenId: maybe.ordenId, timeline: maybe.timeline };
          });

          // Si ya está final, cerramos todo
          if (isFinalStateFromTimeline(maybe.timeline)) {
            stopSse();
            stopAutoRefresh();
            return;
          }
        }

        // ✅ Canonical refresh (silent)
        fetchTracking(true);
      };

      es.onerror = () => {
        // SSE falló → fallback a polling (pero intentamos reconectar en background)
        setMode("polling");
        startAutoRefresh();

        // Reintento con backoff
        scheduleSseRetry();
      };
    } catch {
      // Si algo explota al crear EventSource
      setMode("polling");
      startAutoRefresh();
    }
  };

  /**
   * ======================================================
   * EFFECTS
   * ======================================================
   */
  useEffect(() => {
    mountedRef.current = true;

    if (!ordenId) return;

    // 1) Primera carga canonical
    fetchTracking();

    // 2) Intentamos realtime primero
    startSse();

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      stopAutoRefresh();
      stopSse();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenId]);

  /**
   * ======================================================
   * DERIVED STATE
   * ======================================================
   */
  const estadoActual = useMemo(() => {
    if (!data?.timeline?.length) return "Sin estado";
    return data.timeline[data.timeline.length - 1].label;
  }, [data]);

  const footerStatus = useMemo(() => {
    if (mode === "realtime") return "En vivo (realtime)";
    return "Actualizando cada 15s (fallback)";
  }, [mode]);

  /**
   * ======================================================
   * UI STATES
   * ======================================================
   */
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.muted}>Cargando seguimiento…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>

        <Text style={styles.retry} onPress={() => fetchTracking()}>
          Reintentar
        </Text>

        <Text style={styles.helper}>
          Si el realtime falla, la app entra en modo fallback automáticamente.
        </Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>No hay información disponible</Text>
      </View>
    );
  }

  /**
   * ======================================================
   * RENDER
   * ======================================================
   */
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Seguimiento de tu orden</Text>
      <Text style={styles.subtitle}>Orden #{data.ordenId}</Text>

      <View style={styles.estadoBox}>
        <Text style={styles.estadoLabel}>Estado actual</Text>
        <Text style={styles.estadoActual}>{estadoActual}</Text>
        <Text style={styles.realtimeHint}>{footerStatus}</Text>
      </View>

      <Text style={styles.historial}>Historial</Text>

      {data.timeline.length === 0 ? (
        <Text style={styles.empty}>Aún no hay movimientos</Text>
      ) : (
        data.timeline.map((item) => (
          <View key={`${item.type}-${item.at}`} style={styles.timelineItem}>
            <Text style={styles.timelineEstado}>{item.label}</Text>
            <Text style={styles.timelineFecha}>
              {new Date(item.at).toLocaleString()}
            </Text>
          </View>
        ))
      )}

      <Text style={styles.footerNote}>
        Tip: este tracking es público y funciona incluso sin sesión.
      </Text>
    </ScrollView>
  );
}

/**
 * ======================================================
 * ESTILOS
 * ======================================================
 */
const styles = StyleSheet.create({
  container: { padding: 24 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 16 },
  estadoBox: {
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#eef3ff",
    marginBottom: 20,
  },
  estadoLabel: { fontSize: 12, color: "#445", marginBottom: 4 },
  estadoActual: { fontSize: 16, fontWeight: "700" },
  realtimeHint: { marginTop: 6, fontSize: 12, color: "#445" },
  historial: { fontSize: 18, fontWeight: "600", marginBottom: 12 },
  timelineItem: {
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#f3f3f3",
    marginBottom: 12,
  },
  timelineEstado: { fontWeight: "600", marginBottom: 4 },
  timelineFecha: { fontSize: 12, color: "#777" },
  error: { color: "red", fontSize: 15, marginBottom: 8, textAlign: "center" },
  retry: { color: "#2a6df4", fontWeight: "600", marginTop: 8 },
  helper: { color: "#666", fontSize: 12, marginTop: 10, textAlign: "center" },
  empty: { color: "#666", fontStyle: "italic" },
  muted: { color: "#666", marginTop: 8 },
  footerNote: { marginTop: 14, fontSize: 12, color: "#777" },
});