"use client";
/**
 * surfaceSync — crosshair sync across the quad view's four metric fields.
 *
 * The replay stamp is already shared (every pane reads `asOfStamp` from one
 * ReplayProvider), so the only thing left to join up is the pointer: hovering 592 at
 * 11:40 in the Net-Premium cell should light the same strike-minute in Gamma, Vanna and
 * Charm, because comparing the four AT ONE POINT is the entire reason the quad exists.
 *
 * Deliberately a ref-backed emitter rather than React state: the crosshair fires on every
 * mousemove, and routing that through a state update would re-render four charts per
 * frame. Subscribers apply the position imperatively via the chart API instead.
 *
 * Panes outside a provider (the single-field view) get a no-op context, so SurfacePane
 * needs no branch for "am I in a quad".
 */

import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";

export interface SyncPos {
  /** Display-epoch seconds (see lib/intradayShared sessionEpoch). */
  time: number;
  price: number;
}

interface SurfaceSyncCtx {
  /** True only inside a provider — panes use it to skip sync bookkeeping entirely. */
  active: boolean;
  publish: (fromId: string, pos: SyncPos | null) => void;
  subscribe: (id: string, cb: (pos: SyncPos | null) => void) => () => void;
}

const NOOP: SurfaceSyncCtx = {
  active: false,
  publish: () => {},
  subscribe: () => () => {},
};

const Ctx = createContext<SurfaceSyncCtx>(NOOP);

export function SurfaceSyncProvider({ children }: { children: ReactNode }) {
  const subs = useRef(new Map<string, (pos: SyncPos | null) => void>());

  const publish = useCallback((fromId: string, pos: SyncPos | null) => {
    for (const [id, cb] of subs.current) {
      if (id === fromId) continue; // never echo to the pane the pointer is actually in
      cb(pos);
    }
  }, []);

  const subscribe = useCallback((id: string, cb: (pos: SyncPos | null) => void) => {
    subs.current.set(id, cb);
    return () => { subs.current.delete(id); };
  }, []);

  const value = useMemo<SurfaceSyncCtx>(
    () => ({ active: true, publish, subscribe }),
    [publish, subscribe],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSurfaceSync(): SurfaceSyncCtx {
  return useContext(Ctx);
}
