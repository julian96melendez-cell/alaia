import { apiUrl } from "../config/api";
import { useEffect, useState } from "react";

export function useTrackingWeb(ordenId: string) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ordenId) return;

    const source = new EventSource(
      apiUrl(`/api/ordenes/public/${encodeURIComponent(ordenId)}/stream`)
    );

    source.onmessage = (event) => {
      const payload = JSON.parse(event.data);

      if (payload.type === "snapshot") {
        setData(payload.data);
      }

      if (payload.type === "update") {
        setData((prev: any) => ({
          ...prev,
          timeline: [...(prev?.timeline || []), payload.event],
        }));
      }
    };

    source.onerror = () => {
      setError("Conexión en tiempo real perdida");
      source.close();
    };

    return () => source.close();
  }, [ordenId]);

  return { data, error };
}