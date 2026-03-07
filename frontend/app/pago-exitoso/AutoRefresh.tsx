"use client";

/**
 * ======================================================
 * AutoRefresh — Pago Exitoso (ENTERPRISE PRO FINAL)
 * ======================================================
 * ✔ Solo refresca si enabled=true
 * ✔ Refresca cada N segundos (default 3s)
 * ✔ Se detiene solo al llegar a maxSeconds (default 90s)
 * ✔ No hace parpadeos: usa router.refresh()
 * ✔ Evita duplicados en React Strict Mode
 * ✔ Pausa si pestaña está oculta (background)
 * ✔ Pausa si el usuario está offline
 * ✔ 100% compatible con Next.js App Router
 * ======================================================
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

type Props = {
  enabled: boolean;
  /**
   * Cada cuántos segundos refrescar (default 3)
   */
  intervalSeconds?: number;
  /**
   * Cuántos segundos máximo refrescar antes de parar (default 90)
   */
  maxSeconds?: number;
  /**
   * Si quieres reiniciarlo manualmente desde fuera, cambia este key
   */
  resetKey?: string | number;
};

export default function AutoRefresh({
  enabled,
  intervalSeconds = 3,
  maxSeconds = 90,
  resetKey,
}: Props) {
  const router = useRouter();

  const timerRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    // Limpieza total (por si React Strict Mode monta/desmonta)
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    startRef.current = null;

    if (!enabled) return;

    // Sanitizar valores
    const intervalMs = Math.max(1000, Math.floor(intervalSeconds * 1000));
    const maxMs = Math.max(5000, Math.floor(maxSeconds * 1000));

    startRef.current = Date.now();

    timerRef.current = window.setInterval(() => {
      // Si está en background, no hacemos nada (ahorra recursos)
      if (typeof document !== "undefined" && document.hidden) return;

      // Si está offline, no refrescamos
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;

      const startedAt = startRef.current || Date.now();
      const elapsedMs = Date.now() - startedAt;

      // Corte duro por seguridad
      if (elapsedMs >= maxMs) {
        if (timerRef.current) window.clearInterval(timerRef.current);
        timerRef.current = null;
        return;
      }

      // Refresca Server Components sin recargar la pestaña
      router.refresh();
    }, intervalMs);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      startRef.current = null;
    };
  }, [enabled, intervalSeconds, maxSeconds, resetKey, router]);

  return null;
}