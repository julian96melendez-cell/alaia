import { useEffect, useState } from "react";

export function useTrackingWeb(ordenId: string) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ordenId) return;

    const source = new EventSource(
      `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/ordenes/public/${ordenId}/stream`
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