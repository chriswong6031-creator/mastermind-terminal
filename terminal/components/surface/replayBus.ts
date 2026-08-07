"use client";
/**
 * replayBus — the workspace-wide broadcast of the replay spine's current position.
 *
 * The scrubber lives in ONE place (the Surface tab's ReplayProvider), but the panes that
 * must react to it are scattered across sibling hub tabs — the Tide tab's Session Flow pane,
 * the GEX desk's ladder and its expiry drawer. Those tabs are kept alive but never nested
 * inside the provider, so React context cannot reach them. This module is the missing wire:
 * the provider publishes its position here, and any component anywhere subscribes.
 *
 * It carries POSITION, never data — subscribers decide for themselves what their own payload
 * is allowed to say at that position. That split is what keeps the honesty rules local:
 *   - intraday series (session flow) truncate at `asOfStamp` while on the live session;
 *   - EOD stores (GEX ladder, expiry drawer) do NOT truncate — they tag themselves
 *     "not replayed" via `offHead` and keep showing the close they actually describe;
 *   - anything whose payload only exists for the live session withdraws when `archived`.
 *
 * Exactly one publisher is expected (the Surface tab's provider). A second publisher would
 * simply overwrite the snapshot; `release` only clears when the CURRENT publisher unmounts,
 * so a provider remount (root / view / session change) can't blank a live one out of order.
 */

import { useSyncExternalStore } from "react";

export interface WorkspaceReplay {
  /** False until a replay provider has mounted and published. Consumers stay silent. */
  active: boolean;
  /** The "HHMM" the workspace is time-traveled to (null = no frames). */
  asOfStamp: string | null;
  /** At the newest frame of the LOADED session (true for an archived session's last frame). */
  atHead: boolean;
  /** At the newest frame of the LIVE session — i.e. `atHead && !archived`. */
  live: boolean;
  /** A past session is loaded (session picker off "Today"). */
  archived: boolean;
  /** The loaded session's date ("YYYY-MM-DD"), or null while on today. */
  sessionDate: string | null;
  /** Convenience: the workspace is showing something other than the live present. */
  offHead: boolean;
}

const IDLE: WorkspaceReplay = {
  active: false,
  asOfStamp: null,
  atHead: true,
  live: true,
  archived: false,
  sessionDate: null,
  offHead: false,
};

let snapshot: WorkspaceReplay = IDLE;
let publisher: symbol | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

/**
 * Publish the current replay position. `owner` identifies the publishing provider instance so
 * a stale unmount cannot clear a newer provider's snapshot.
 */
export function publishWorkspaceReplay(
  owner: symbol,
  next: Omit<WorkspaceReplay, "active" | "offHead">,
): void {
  publisher = owner;
  const value: WorkspaceReplay = {
    ...next,
    active: true,
    offHead: !next.atHead || next.archived,
  };
  // Reference-stable when nothing changed: useSyncExternalStore compares by identity and
  // would otherwise re-render every subscriber on each publish.
  if (
    snapshot.active === value.active &&
    snapshot.asOfStamp === value.asOfStamp &&
    snapshot.atHead === value.atHead &&
    snapshot.live === value.live &&
    snapshot.archived === value.archived &&
    snapshot.sessionDate === value.sessionDate
  ) {
    return;
  }
  snapshot = value;
  emit();
}

/** Drop the snapshot when the publishing provider unmounts (no-op for a stale owner). */
export function releaseWorkspaceReplay(owner: symbol): void {
  if (publisher !== owner) return;
  publisher = null;
  snapshot = IDLE;
  emit();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

const getSnapshot = () => snapshot;
/** SSR renders the idle snapshot — no replay exists on the server. */
const getServerSnapshot = () => IDLE;

/**
 * Read the workspace replay position from anywhere — inside the provider's subtree or in a
 * completely different tab. Re-renders only when the position actually changes.
 */
export function useWorkspaceReplay(): WorkspaceReplay {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
