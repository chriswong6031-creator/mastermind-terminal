"use client";
/**
 * useFlowStream — subscribe to a flow feed over SSE, with a polling fallback.
 *
 * Phase 1 live spine (client half). Opens ONE EventSource to /api/flow/stream?f=<f>
 * and pushes updates into React state as the server sends them. If SSE is unsupported
 * or errors repeatedly, it degrades to the existing flowGet() polling — so a consumer
 * that swaps flowGet for useFlowStream never ends up worse off than before.
 *
 * Returns { data, live, error }:
 *   - data:  latest payload (null until the first message)
 *   - live:  true while the SSE connection is open (drives an optional "LIVE" badge)
 *   - error: true after the stream errored and before it recovered
 *
 * SSR-safe: no EventSource touched on the server; the connection opens in useEffect.
 */
import { useEffect, useRef, useState } from "react";
import { flowGet } from "@/lib/flowClientCache";

export interface FlowStreamResult<T> {
  data: T | null;
  live: boolean;
  error: boolean;
}

export function useFlowStream<T = unknown>(
  f: string | null,
  opts?: { pollMs?: number },
): FlowStreamResult<T> {
  const pollMs = opts?.pollMs ?? 30_000;
  const [data, setData] = useState<T | null>(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!f) return;
    // New subscription key — clear the previous feed's data so a consumer never
    // flashes stale content (e.g. the old ticker's ladder) while the first snapshot
    // for the new key is in flight.
    setData(null);
    setLive(false);
    setError(false);
    let cancelled = false;
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (pollTimer) return;
      const tick = async () => {
        const d = await flowGet(f);
        if (!cancelled && d != null) { setData(d as T); setError(false); }
      };
      void tick();
      pollTimer = setInterval(tick, pollMs);
    };
    const stopPolling = () => {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    };

    if (typeof window !== "undefined" && "EventSource" in window) {
      let errCount = 0;
      es = new EventSource(`/api/flow/stream?f=${encodeURIComponent(f)}`);
      es.onopen = () => {
        if (cancelled) return;
        setLive(true);
        setError(false);
        errCount = 0;
        stopPolling(); // SSE recovered — drop the fallback poll
      };
      es.onmessage = (ev) => {
        if (cancelled) return;
        try {
          setData(JSON.parse(ev.data) as T);
          setError(false);
        } catch { /* keep last good data on a malformed frame */ }
      };
      es.onerror = () => {
        if (cancelled) return;
        setLive(false);
        setError(true);
        // EventSource auto-reconnects; if it keeps failing, fall back to polling
        // so the consumer still updates while SSE is unavailable.
        if (++errCount >= 3) startPolling();
      };
    } else {
      // No EventSource (old browser / SSR hydration edge) — poll from the start.
      startPolling();
    }

    return () => {
      cancelled = true;
      if (es) es.close();
      stopPolling();
      setLive(false);
    };
  }, [f, pollMs]);

  return { data, live, error };
}
