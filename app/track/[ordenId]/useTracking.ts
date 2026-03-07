import { useEffect, useRef, useState } from "react";

export type TimelineItem = {
  type: string;
  label: string;
  at: string;
  meta?: any;
};

export type TrackingData = {
  ordenId: string;
  timeline: TimelineItem[];
};

type ApiResponse<T> = {
  ok: boolean;
  message?: string;
  data?: T;
};

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:3001";

export function useTracking(ordenId: string) {
  const [data, setData] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const mountedRef = useRef(true);

  const isFinalState = (timeline?: TimelineItem[]) => {
    if (!timeline?.length) return false;
    const last = timeline[timeline.length - 1]?.type;
    return last?.includes("entregado") || last?.includes("cancelado");
  };

  // --------------------------------------------------
  // FETCH INICIAL
  // --------------------------------------------------
  async function fetchTracking() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(
        `${BACKEND_URL}/api/ordenes/public/${ordenId}/timeline`
      );

      if (!res.ok) throw new Error("No se pudo cargar el tracking");

      const json: ApiResponse<TrackingData> = await res.json();

      if (!json.ok || !json.data) {
        throw new Error(json.message || "Respuesta inválida");
      }

      if (!mountedRef.current) return;

      setData(json.data);
    } catch (e: any) {
      if (!mountedRef.current) return;
      setError(e.message || "Error de red");
      setData(null);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  // --------------------------------------------------
  // 🔥 SSE — TIEMPO REAL
  // --------------------------------------------------
  function startStream() {
    stopStream();

    const es = new EventSource(
      `${BACKEND_URL}/api/ordenes/public/${ordenId}/stream`
    );

    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);

        // snapshot inicial
        if (payload.type === "snapshot") {
          setData({
            ordenId: payload.data._id,
            timeline: payload.data.historial || [],
          });
        }

        // eventos nuevos
        if (payload.type === "timeline") {
          setData((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              timeline: [...prev.timeline, payload.data],
            };
          });
        }
      } catch {}
    };

    es.onerror = () => {
      stopStream();
    };
  }

  function stopStream() {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }

  // --------------------------------------------------
  // EFFECT
  // --------------------------------------------------
  useEffect(() => {
    mountedRef.current = true;

    if (!ordenId) return;

    fetchTracking();
    startStream();

    return () => {
      mountedRef.current = false;
      stopStream();
    };
  }, [ordenId]);

  // Detener stream si ya terminó
  useEffect(() => {
    if (isFinalState(data?.timeline)) {
      stopStream();
    }
  }, [data]);

  return {
    data,
    loading,
    error,
  };
}