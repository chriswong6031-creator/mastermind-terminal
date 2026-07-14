"use client";
import { useEffect, useRef, useState } from "react";

// Live-data client (HANDOFF §7). The account is NOT real-time-entitled yet, so this is OFF by
// default and the terminal runs on historical Polygon. Flip NEXT_PUBLIC_LIVE=1 with a real-time
// NEXT_PUBLIC_POLYGON_KEY to activate the Polygon trades WebSocket — the wiring is complete.
export type LiveStatus = "off" | "connecting" | "live" | "error";

export function useLive(symbol: string, onTick: (price: number) => void) {
  const [status, setStatus] = useState<LiveStatus>("off");
  const cb = useRef(onTick); cb.current = onTick;

  useEffect(() => {
    const on = process.env.NEXT_PUBLIC_LIVE === "1";
    const key = process.env.NEXT_PUBLIC_POLYGON_KEY;
    if (!on || !key || symbol.includes("-USD")) { setStatus("off"); return; }
    setStatus("connecting");
    let dead = false; let ws: WebSocket | null = null;
    try {
      ws = new WebSocket("wss://socket.polygon.io/stocks");
      ws.onopen = () => ws!.send(JSON.stringify({ action: "auth", params: key }));
      ws.onmessage = (ev) => {
        if (dead) return;
        try {
          for (const m of JSON.parse(ev.data)) {
            if (m.ev === "status" && m.status === "auth_success") { ws!.send(JSON.stringify({ action: "subscribe", params: `T.${symbol}` })); setStatus("live"); }
            else if (m.ev === "status" && m.status === "auth_failed") { setStatus("error"); ws!.close(); }
            else if (m.ev === "T" && typeof m.p === "number" && !dead) cb.current(m.p);
          }
        } catch {}
      };
      ws.onerror = () => { if (!dead) setStatus("error"); };
      ws.onclose = () => { if (!dead) setStatus((s) => (s === "live" ? "off" : s)); };
    } catch { setStatus("error"); }
    return () => { dead = true; try { ws?.close(); } catch {} };
  }, [symbol]);

  return status;
}
