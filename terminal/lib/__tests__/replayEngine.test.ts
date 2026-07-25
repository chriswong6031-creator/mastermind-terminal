import { describe, it, expect } from "vitest";
import {
  clampFrame,
  stampAt,
  isAtHead,
  initReplay,
  replayReducer,
  keyToAction,
  tickIntervalMs,
  fmtStamp,
  type ReplayState,
} from "@/lib/replayEngine";

const STAMPS = ["0931", "0941", "0951", "1001", "1011"]; // 5 frames

function stateAt(frame: number, extra: Partial<ReplayState> = {}): ReplayState {
  return { stamps: STAMPS, frame, playing: false, speed: 1, ...extra };
}

describe("clampFrame", () => {
  it("clamps below/above range", () => {
    expect(clampFrame(-3, 5)).toBe(0);
    expect(clampFrame(9, 5)).toBe(4);
    expect(clampFrame(2, 5)).toBe(2);
  });
  it("empty index → 0", () => {
    expect(clampFrame(4, 0)).toBe(0);
  });
  it("rounds fractional scrubber positions", () => {
    expect(clampFrame(2.7, 5)).toBe(3);
  });
});

describe("frame ↔ stamp mapping", () => {
  it("stampAt returns the stamp for the frame", () => {
    expect(stampAt(stateAt(0))).toBe("0931");
    expect(stampAt(stateAt(4))).toBe("1011");
  });
  it("stampAt clamps an out-of-range frame", () => {
    expect(stampAt(stateAt(99))).toBe("1011");
  });
  it("stampAt on empty index → null", () => {
    expect(stampAt({ stamps: [], frame: 0, playing: false, speed: 1 })).toBeNull();
  });
  it("isAtHead only at the last frame", () => {
    expect(isAtHead(stateAt(4))).toBe(true);
    expect(isAtHead(stateAt(3))).toBe(false);
  });
  it("fmtStamp HHMM → HH:MM", () => {
    expect(fmtStamp("0931")).toBe("09:31");
    expect(fmtStamp(null)).toBe("—");
    expect(fmtStamp("live")).toBe("live");
  });
});

describe("initReplay — starts pinned to head (LIVE)", () => {
  it("head frame for a non-empty index", () => {
    const s = initReplay(STAMPS);
    expect(s.frame).toBe(4);
    expect(isAtHead(s)).toBe(true);
    expect(s.playing).toBe(false);
  });
  it("empty index", () => {
    const s = initReplay([]);
    expect(s.frame).toBe(0);
    expect(s.stamps).toEqual([]);
  });
});

describe("replayReducer — button + keybind transitions", () => {
  it("toFirst / toLast (Home / End) jump to the ends and pause", () => {
    expect(replayReducer(stateAt(3, { playing: true }), { type: "toFirst" })).toMatchObject({
      frame: 0,
      playing: false,
    });
    expect(replayReducer(stateAt(1), { type: "toLast" })).toMatchObject({ frame: 4 });
  });

  it("stepBack / stepFwd move one frame and clamp", () => {
    expect(replayReducer(stateAt(2), { type: "stepFwd" }).frame).toBe(3);
    expect(replayReducer(stateAt(2), { type: "stepBack" }).frame).toBe(1);
    expect(replayReducer(stateAt(4), { type: "stepFwd" }).frame).toBe(4); // clamp at head
    expect(replayReducer(stateAt(0), { type: "stepBack" }).frame).toBe(0); // clamp at 0
  });

  it("togglePlay pauses when playing", () => {
    expect(replayReducer(stateAt(2, { playing: true }), { type: "togglePlay" }).playing).toBe(false);
  });

  it("togglePlay/play at the head restarts from frame 0", () => {
    const s = replayReducer(stateAt(4), { type: "togglePlay" });
    expect(s.playing).toBe(true);
    expect(s.frame).toBe(0);
  });

  it("play mid-timeline just plays from where it is", () => {
    const s = replayReducer(stateAt(2), { type: "play" });
    expect(s.playing).toBe(true);
    expect(s.frame).toBe(2);
  });

  it("setFrame (scrubber) clamps and pauses", () => {
    expect(replayReducer(stateAt(0, { playing: true }), { type: "setFrame", frame: 3 })).toMatchObject(
      { frame: 3, playing: false },
    );
    expect(replayReducer(stateAt(0), { type: "setFrame", frame: 100 }).frame).toBe(4);
  });

  it("setSpeed changes speed only", () => {
    expect(replayReducer(stateAt(2), { type: "setSpeed", speed: 4 }).speed).toBe(4);
  });

  it("tick advances one frame while playing and stops (pauses) at head", () => {
    const s1 = replayReducer(stateAt(2, { playing: true }), { type: "tick" });
    expect(s1.frame).toBe(3);
    expect(s1.playing).toBe(true);
    const s2 = replayReducer(stateAt(4, { playing: true }), { type: "tick" });
    expect(s2.frame).toBe(4);
    expect(s2.playing).toBe(false); // reached head → stop
  });

  it("tick is a no-op when paused", () => {
    const s = stateAt(2, { playing: false });
    expect(replayReducer(s, { type: "tick" })).toBe(s);
  });
});

describe("replayReducer — setStamps head-follow semantics", () => {
  it("follows the new head when already at head (LIVE viewer)", () => {
    const grown = ["0931", "0941", "0951", "1001", "1011", "1021"];
    const s = replayReducer(stateAt(4), { type: "setStamps", stamps: grown });
    expect(s.frame).toBe(5); // followed the new head
    expect(isAtHead(s)).toBe(true);
  });

  it("holds the current frame for a scrubbed-back viewer", () => {
    const grown = ["0931", "0941", "0951", "1001", "1011", "1021"];
    const s = replayReducer(stateAt(1), { type: "setStamps", stamps: grown });
    expect(s.frame).toBe(1); // not yanked forward
  });

  it("keepHead forces head-follow even when scrubbed back", () => {
    const grown = ["0931", "0941", "0951", "1001", "1011", "1021"];
    const s = replayReducer(stateAt(1), { type: "setStamps", stamps: grown, keepHead: true });
    expect(s.frame).toBe(5);
  });

  it("empty new index resets frame to 0", () => {
    const s = replayReducer(stateAt(3), { type: "setStamps", stamps: [] });
    expect(s.frame).toBe(0);
    expect(s.stamps).toEqual([]);
  });

  it("shrinking index clamps the frame into range", () => {
    const s = replayReducer(stateAt(4), { type: "setStamps", stamps: ["0931", "0941"] });
    expect(s.frame).toBe(1);
  });
});

describe("keyToAction", () => {
  it("maps the replay keys", () => {
    expect(keyToAction("Home")).toEqual({ type: "toFirst" });
    expect(keyToAction("End")).toEqual({ type: "toLast" });
    expect(keyToAction(" ")).toEqual({ type: "togglePlay" });
    expect(keyToAction("Spacebar")).toEqual({ type: "togglePlay" });
    expect(keyToAction("ArrowLeft")).toEqual({ type: "stepBack" });
    expect(keyToAction("ArrowRight")).toEqual({ type: "stepFwd" });
  });
  it("returns null for non-replay keys", () => {
    expect(keyToAction("a")).toBeNull();
    expect(keyToAction("Enter")).toBeNull();
  });
});

describe("tickIntervalMs", () => {
  it("faster speed → shorter interval", () => {
    expect(tickIntervalMs(1)).toBe(700);
    expect(tickIntervalMs(2)).toBe(350);
    expect(tickIntervalMs(4)).toBe(175);
    expect(tickIntervalMs(8)).toBe(88);
  });
});
