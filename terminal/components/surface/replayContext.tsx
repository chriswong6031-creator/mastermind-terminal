"use client";
/**
 * replayContext — shared replay state for the surface pane group.
 *
 * A single ReplayProvider owns the replay reducer (lib/replayEngine) and exposes:
 *   - state (stamps, frame, playing, speed)
 *   - dispatch (the reducer actions)
 *   - asOfStamp: the "HHMM" the group is time-traveled to (null = no data)
 *   - atHead: at the newest frame of the LOADED session
 *   - live: at the newest frame of the LIVE session (atHead AND not an archived session)
 *   - sessionDate / archived: which session is loaded (null / false = today)
 *
 * SurfacePane consumes asOfStamp + sessionDate to fetch the right frame; ReplayBar drives
 * dispatch. The `atHead` / `live` split is what keeps point-in-time honesty working for
 * multi-day replay: the last frame of an ARCHIVED session is at the head of that session but
 * is not the present, so anything that can only describe the present (the head-of-day expiry
 * matrix, today's tide) must key off `live`, never `atHead`.
 *
 * The position is also published to replayBus so sibling hub tabs — which are kept alive but
 * live outside this provider's subtree — can react to the scrubber.
 *
 * The play clock lives here (one interval per provider) so every consumer advances in
 * lockstep. Keyboard Home/End/Space/←/→ are bound while the group is hovered/focused.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import {
  replayReducer,
  initReplay,
  stampAt,
  isAtHead,
  keyToAction,
  tickIntervalMs,
  createEngagementTracker,
  type ReplayState,
  type ReplayAction,
} from "@/lib/replayEngine";
import { publishWorkspaceReplay, releaseWorkspaceReplay } from "./replayBus";

interface ReplayCtx {
  state: ReplayState;
  dispatch: (a: ReplayAction) => void;
  asOfStamp: string | null;
  /** Newest frame of the LOADED session. */
  atHead: boolean;
  /** Newest frame of the LIVE session — false for every frame of an archived one. */
  live: boolean;
  /** The loaded session date ("YYYY-MM-DD"), or null while on today. */
  sessionDate: string | null;
  /** A past session is loaded. */
  archived: boolean;
  /** Attach to the pane-group root so keybinds only fire while it's engaged. */
  bindGroupRef: (el: HTMLElement | null) => void;
}

const Ctx = createContext<ReplayCtx | null>(null);

export function ReplayProvider({
  children,
  sessionDate = null,
}: {
  children: ReactNode;
  /** A past session to replay ("YYYY-MM-DD"); null = today's live session. */
  sessionDate?: string | null;
}) {
  const [state, dispatch] = useReducer(replayReducer, [], () => initReplay([]));
  // ONE tracker for the provider's life. Its handler set is created once, so every
  // removeEventListener matches its addEventListener and nothing accumulates (B5).
  const trackerRef = useRef(createEngagementTracker());
  // Identity for the workspace bus, so a remounting provider can't clear a newer one.
  const busIdRef = useRef(Symbol("replay-provider"));

  const archived = sessionDate != null;
  const atHead = isAtHead(state);
  const live = atHead && !archived;
  const asOfStamp = stampAt(state);

  // Play clock: one interval, retimed when speed or playing changes.
  useEffect(() => {
    if (!state.playing) return;
    const id = setInterval(() => dispatch({ type: "tick" }), tickIntervalMs(state.speed));
    return () => clearInterval(id);
  }, [state.playing, state.speed]);

  // Keyboard: only when the group is hovered/focused and not typing in a field.
  useEffect(() => {
    const tracker = trackerRef.current;
    function onKey(e: KeyboardEvent) {
      if (!tracker.engaged()) return;
      const tgt = e.target as HTMLElement | null;
      const tag = tgt?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tgt?.isContentEditable) return;
      const action = keyToAction(e.key);
      if (!action) return;
      e.preventDefault();
      dispatch(action);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Broadcast the position to sibling tabs (Session Flow, GEX ladder, expiry drawer).
  useEffect(() => {
    publishWorkspaceReplay(busIdRef.current, { asOfStamp, atHead, live, archived, sessionDate });
  }, [asOfStamp, atHead, live, archived, sessionDate]);

  useEffect(() => {
    const id = busIdRef.current;
    return () => releaseWorkspaceReplay(id);
  }, []);

  // Detach on unmount so a torn-down group leaves no listeners behind.
  useEffect(() => {
    const tracker = trackerRef.current;
    return () => tracker.bind(null);
  }, []);

  const bindGroupRef = useCallback((el: HTMLElement | null) => {
    trackerRef.current.bind(el);
  }, []);

  const value = useMemo<ReplayCtx>(
    () => ({ state, dispatch, asOfStamp, atHead, live, sessionDate, archived, bindGroupRef }),
    [state, asOfStamp, atHead, live, sessionDate, archived, bindGroupRef],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReplay(): ReplayCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useReplay must be used within a ReplayProvider");
  return ctx;
}
