import { useEffect, useRef } from "react";

type Options<T> = {
  onMessage: (data: T) => void;

  /**
   * Si SSE no está disponible o falla, podemos hacer fallback a polling.
   */
  onError?: (err?: any) => void;

  /**
   * Fallback polling (opcional)
   * - Si lo pasas, cuando SSE no exista, se ejecuta cada X ms.
   */
  pollingFetch?: () => Promise<void> | void;
  pollingIntervalMs?: number;
};

function isEventSourceAvailable() {
  return typeof globalThis !== "undefined" && "EventSource" in globalThis;
}

export function useTrackingStream<T>(
  url: string,
  {
    onMessage,
    onError,
    pollingFetch,
    pollingIntervalMs = 15000,
  }: Options<T>
) {
  const eventSourceRef = useRef<any>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!url) return;

    // -----------------------------
    // 1) Si NO hay EventSource (RN / Expo)
    // -----------------------------
    if (!isEventSourceAvailable()) {
      // fallback a polling si se provee
      if (pollingFetch) {
        pollingFetch();
        pollingRef.current = setInterval(() => {
          pollingFetch();
        }, pollingIntervalMs);
      }

      onError?.("EventSource no disponible en esta plataforma. Usando fallback.");
      return () => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      };
    }

    // -----------------------------
    // 2) WEB: SSE normal
    // -----------------------------
    try {
      const ES = (globalThis as any).EventSource;
      const es = new ES(url);

      eventSourceRef.current = es;

      es.onmessage = (event: any) => {
        try {
          const data = JSON.parse(event.data) as T;
          onMessage(data);
        } catch {
          // payload inválido → ignorar
        }
      };

      es.onerror = (err: any) => {
        try {
          es.close();
        } catch {}
        eventSourceRef.current = null;

        // fallback a polling si existe
        if (pollingFetch) {
          pollingFetch();
          pollingRef.current = setInterval(() => {
            pollingFetch();
          }, pollingIntervalMs);
        }

        onError?.(err);
      };

      return () => {
        try {
          es.close();
        } catch {}
        eventSourceRef.current = null;

        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      };
    } catch (err) {
      // Si algo falla creando EventSource → polling fallback
      if (pollingFetch) {
        pollingFetch();
        pollingRef.current = setInterval(() => {
          pollingFetch();
        }, pollingIntervalMs);
      }
      onError?.(err);

      return () => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      };
    }
  }, [url, pollingFetch, pollingIntervalMs, onMessage, onError]);
}