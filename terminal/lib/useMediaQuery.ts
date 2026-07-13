"use client";
import { useCallback, useSyncExternalStore } from "react";

// SSR-safe media query hook (server snapshot = false to avoid hydration mismatch).
export function useMediaQuery(query: string): boolean {
  // useSyncExternalStore is React 18+; this app targets React 19. Stable callbacks keyed on
  // `query` so React doesn't resubscribe a fresh MediaQueryList every render.
  const subscribe = useCallback((cb: () => void) => {
    if (typeof window === "undefined") return () => {};
    const mql = window.matchMedia(query);
    mql.addEventListener("change", cb);
    return () => mql.removeEventListener("change", cb);
  }, [query]);
  const getSnapshot = useCallback(() => (typeof window === "undefined" ? false : window.matchMedia(query).matches), [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 860px)");
}
