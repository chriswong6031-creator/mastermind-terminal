"use client";
import { useEffect, useState } from "react";

// Live-data client — NEUTRALIZED 2026-07-19 (Wave-1 INFRA lane, databento-readiness audit).
//
// The previous implementation read `process.env.NEXT_PUBLIC_POLYGON_KEY` in a "use client" module
// and opened `new WebSocket("wss://socket.polygon.io/stocks")` DIRECTLY from the browser, sending
// the key in an auth frame. Any NEXT_PUBLIC_* var is inlined into the client bundle → the market-
// data key was world-readable, and a browser→vendor trades socket is a redistribution-license
// liability (a dev subscription is not a terminal redistribution license). Both are killed here.
//
// This is a key-safe no-op stub, kept ONLY to preserve the `useLive`/`LiveStatus` export contract
// its consumer (components/TerminalShell.tsx) depends on while the SHELL/DataBento lanes re-point
// the live tick source at a SERVER-mediated stream (hub SSE/WS proxy — see
// docs/DATABENTO_INTEGRATION_DESIGN.md). It never reads any NEXT_PUBLIC key and never opens a
// browser→vendor socket. `onTick` is intentionally never invoked; status stays "off".
// When TerminalShell is re-pointed, this file can be deleted outright.
export type LiveStatus = "off" | "connecting" | "live" | "error";

export function useLive(_symbol: string, _onTick: (price: number) => void): LiveStatus {
  const [status] = useState<LiveStatus>("off");
  // No browser-side vendor socket and no NEXT_PUBLIC key read — live ticks arrive server-mediated.
  useEffect(() => {
    // intentionally inert
  }, [_symbol]);
  return status;
}
