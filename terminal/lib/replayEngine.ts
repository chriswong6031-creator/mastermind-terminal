/**
 * replayEngine.ts — pure logic for the surface replay spine.
 *
 * The replay bar time-travels the whole pane group: frames come from a snapshot index
 * (`stamps: ["HHMM", …]`), and scrubbing sets a global "asOfStamp" that panes consume.
 * All of the index math, the keybind reducer, and the play-clock stepping live here as
 * pure functions so they can be unit-tested (lib/__tests__/replayEngine.test.ts) without
 * a DOM — the ReplayBar component and its context are thin wrappers over this.
 */

export const REPLAY_SPEEDS = [1, 2, 4, 8] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

export interface ReplayState {
  /** All available frame stamps in ascending order, "HHMM". */
  stamps: string[];
  /** Current frame index into `stamps` (0-based). */
  frame: number;
  /** Whether the play clock is running. */
  playing: boolean;
  /** Play speed multiplier. */
  speed: ReplaySpeed;
}

export type ReplayAction =
  | { type: "setStamps"; stamps: string[]; keepHead?: boolean }
  | { type: "toFirst" } // ⏮ / Home
  | { type: "toLast" } // ⏭ / End
  | { type: "stepBack" } // ◀
  | { type: "stepFwd" } // ▶ (single frame)
  | { type: "togglePlay" } // Space
  | { type: "play" }
  | { type: "pause" }
  | { type: "setFrame"; frame: number } // scrubber
  | { type: "setSpeed"; speed: ReplaySpeed }
  | { type: "tick" }; // one play-clock advance

/** Clamp a frame index into [0, stamps.length-1] (or 0 when empty). */
export function clampFrame(frame: number, len: number): number {
  if (len <= 0) return 0;
  if (frame < 0) return 0;
  if (frame > len - 1) return len - 1;
  return Math.round(frame);
}

/** The stamp at the current frame, or null when there are no frames. */
export function stampAt(state: ReplayState): string | null {
  if (state.stamps.length === 0) return null;
  const f = clampFrame(state.frame, state.stamps.length);
  return state.stamps[f] ?? null;
}

/** True when the current frame is the newest (head) — drives the LIVE badge. */
export function isAtHead(state: ReplayState): boolean {
  return state.stamps.length > 0 && state.frame >= state.stamps.length - 1;
}

/** Initial state for a fresh index — starts pinned to the head (LIVE). */
export function initReplay(stamps: string[] = []): ReplayState {
  return {
    stamps,
    frame: Math.max(0, stamps.length - 1),
    playing: false,
    speed: 1,
  };
}

/**
 * Pure reducer. Every control (buttons + Home/End/Space + scrubber) routes through
 * here so keyboard and click paths cannot drift apart.
 *
 * setStamps semantics: when the index grows and we were already at the head (LIVE),
 * follow the new head; otherwise hold the current frame (a scrubbed-back viewer is not
 * yanked forward when a new snapshot lands). `keepHead` forces head-follow regardless.
 */
export function replayReducer(state: ReplayState, action: ReplayAction): ReplayState {
  const len = state.stamps.length;
  switch (action.type) {
    case "setStamps": {
      const wasHead = isAtHead(state);
      const nextLen = action.stamps.length;
      let frame: number;
      if (nextLen === 0) frame = 0;
      else if (action.keepHead || wasHead) frame = nextLen - 1;
      else frame = clampFrame(state.frame, nextLen);
      return { ...state, stamps: action.stamps, frame };
    }
    case "toFirst":
      return { ...state, frame: 0, playing: false };
    case "toLast":
      return { ...state, frame: Math.max(0, len - 1), playing: false };
    case "stepBack":
      return { ...state, frame: clampFrame(state.frame - 1, len), playing: false };
    case "stepFwd":
      return { ...state, frame: clampFrame(state.frame + 1, len), playing: false };
    case "togglePlay": {
      // Pressing play at the head restarts from the beginning (a natural "replay").
      if (!state.playing && isAtHead(state) && len > 1) {
        return { ...state, playing: true, frame: 0 };
      }
      return { ...state, playing: !state.playing };
    }
    case "play": {
      if (isAtHead(state) && len > 1) return { ...state, playing: true, frame: 0 };
      return { ...state, playing: true };
    }
    case "pause":
      return { ...state, playing: false };
    case "setFrame":
      return { ...state, frame: clampFrame(action.frame, len), playing: false };
    case "setSpeed":
      return { ...state, speed: action.speed };
    case "tick": {
      if (!state.playing || len === 0) return state;
      const next = state.frame + 1;
      if (next >= len) return { ...state, frame: len - 1, playing: false }; // stop at head
      return { ...state, frame: next };
    }
    default:
      return state;
  }
}

/** Milliseconds between play-clock ticks for a given speed (base 700ms/frame). */
export const BASE_TICK_MS = 700;
export function tickIntervalMs(speed: ReplaySpeed): number {
  return Math.round(BASE_TICK_MS / speed);
}

/**
 * Map a keyboard event key to a replay action, or null if it's not a replay key.
 * Home→toFirst, End→toLast, Space→togglePlay, ArrowLeft→stepBack, ArrowRight→stepFwd.
 * (Callers gate this on the pane group being focused/hovered so it doesn't hijack
 * typing in inputs.)
 */
export function keyToAction(key: string): ReplayAction | null {
  switch (key) {
    case "Home":
      return { type: "toFirst" };
    case "End":
      return { type: "toLast" };
    case " ":
    case "Spacebar": // legacy
      return { type: "togglePlay" };
    case "ArrowLeft":
      return { type: "stepBack" };
    case "ArrowRight":
      return { type: "stepFwd" };
    default:
      return null;
  }
}

/** "HHMM" → "HH:MM" for display; passthrough if it doesn't look like a stamp. */
export function fmtStamp(stamp: string | null): string {
  if (!stamp) return "—";
  if (/^\d{4}$/.test(stamp)) return `${stamp.slice(0, 2)}:${stamp.slice(2)}`;
  return stamp;
}
