"use client";
/**
 * replayContext — shared replay state for the surface pane group.
 *
 * A single ReplayProvider owns the replay reducer (lib/replayEngine) and exposes:
 *   - state (stamps, frame, playing, speed)
 *   - dispatch (the reducer actions)
 *   - asOfStamp: the "HHMM" the group is time-traveled to (null = no data)
 *   - live: true when scrubbed to the head
 *
 * SurfacePane consumes asOfStamp to fetch the right frame; ReplayBar drives dispatch.
 * The provider is deliberately generic so SessionFlowPane / the ladder can consume the
 * SAME asOfStamp later (Wave-2 cross-pane sync) without touching this file.
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
  type ReplayState,
  type ReplayAction,
} from "@/lib/replayEngine";

interface ReplayCtx {
  state: ReplayState;
  dispatch: (a: ReplayAction) => void;
  asOfStamp: string | null;
  live: boolean;
  /** Attach to the pane-group root so keybinds only fire while it's engaged. */
  bindGroupRef: (el: HTMLElement | null) => void;
}

const Ctx = createContext<ReplayCtx | null>(null);

export function ReplayProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(replayReducer, [], () => initReplay([]));
  const groupRef = useRef<HTMLElement | null>(null);
  const hoveredRef = useRef(false);

  // Play clock: one interval, retimed when speed or playing changes.
  useEffect(() => {
    if (!state.playing) return;
    const id = setInterval(() => dispatch({ type: "tick" }), tickIntervalMs(state.speed));
    return () => clearInterval(id);
  }, [state.playing, state.speed]);

  // Keyboard: only when the group is hovered/focused and not typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!hoveredRef.current) return;
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

  const bindGroupRef = useCallback((el: HTMLElement | null) => {
    // Detach listeners from a previous element.
    const prev = groupRef.current;
    if (prev) {
      prev.removeEventListener("mouseenter", onEnter);
      prev.removeEventListener("mouseleave", onLeave);
      prev.removeEventListener("focusin", onEnter);
    }
    groupRef.current = el;
    if (el) {
      el.addEventListener("mouseenter", onEnter);
      el.addEventListener("mouseleave", onLeave);
      el.addEventListener("focusin", onEnter);
    }
    function onEnter() { hoveredRef.current = true; }
    function onLeave() { hoveredRef.current = false; }
  }, []);

  const value = useMemo<ReplayCtx>(
    () => ({
      state,
      dispatch,
      asOfStamp: stampAt(state),
      live: isAtHead(state),
      bindGroupRef,
    }),
    [state, bindGroupRef],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReplay(): ReplayCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useReplay must be used within a ReplayProvider");
  return ctx;
}
