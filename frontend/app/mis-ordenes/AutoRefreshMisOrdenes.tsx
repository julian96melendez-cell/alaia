"use client";

/**
 * ======================================================
 * AutoRefreshMisOrdenes — ENTERPRISE
 * ======================================================
 * ✔ Refresca la página sin recargar pestaña (router.refresh)
 * ✔ Solo si enabled=true
 * ✔ Se detiene solo por seguridad
 * ======================================================
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

type Props = {
  enabled: boolean;
  intervalSeconds?: number; // default 6
  maxSeconds?: number; // default 120
};

export default function AutoRefreshMisOrdenes({
  enabled,
  intervalSeconds = 6,
  maxSeconds = 120,
}: Props) {
  const router = useRouter();

  const elapsedRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      elapsedRef.current = 0;
      return;
    }

    const intervalMs = Math.max(2000, Math.floor(intervalSeconds * 1000));
    const max = Math.max(10, Math.floor(maxSeconds));

    elapsedRef.current = 0;

    timerRef.current = window.setInterval(() => {
      elapsedRef.current += Math.ceil(intervalMs / 1000);

      router.refresh();

      if (elapsedRef.current >= max) {
        if (timerRef.current) window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }, intervalMs);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [enabled, intervalSeconds, maxSeconds, router]);

  return null;
}