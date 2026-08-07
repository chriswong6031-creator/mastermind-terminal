import { describe, it, expect } from "vitest";
import { washoutTurnRead } from "../washoutTurn";

// Frozen "today" so the data-through suffix is deterministic: 2026-08-05 (the MCD miss review).
const NOW = Date.parse("2026-08-05T12:00:00Z");

// The reference block: MCD's 2026-07-31 weekly cross at the 6.3rd depth percentile.
const MCD = {
  state: "WASHOUT_TURN",
  since: "2026-07-31",
  depth_pctile: 6.3,
  data_through: "2026-08-04",
  history: { n: 11, med_13w: 4.2, med_26w: 7.9 },
};

describe("washoutTurnRead — turn, full history", () => {
  it("renders the pinned EN turn read", () => {
    const r = washoutTurnRead(MCD, false, NOW)!;
    expect(r).not.toBeNull();
    expect(r.state).toBe("WASHOUT_TURN");
    expect(r.turn).toBe(true);
    expect(r.head).toBe("Washout turn");
    expect(r.detail).toBe("weekly momentum crossed up from a deep base · since 2026-07-31");
    expect(r.stance).toBe("watch — early turn; windows, not certainties");
    expect(r.receipt).toBe(
      "depth: bottom 6.3% of own history · similar turns n=11: 13w median 4.2% · 26w median 7.9%",
    );
  });

  it("renders the pinned ZH turn read", () => {
    const r = washoutTurnRead(MCD, true, NOW)!;
    expect(r.head).toBe("洗盘转向");
    expect(r.detail).toBe("周线动能自深部上穿 · 起于 2026-07-31");
    expect(r.stance).toBe("观察 — 转向初期；窗口而非定论");
    expect(r.receipt).toBe("深度：自身历史最低 6.3% · 类似转向 n=11：13周中位 4.2% · 26周中位 7.9%");
  });

});

describe("washoutTurnRead — front-facing vocabulary", () => {
  // Front-facing copy law: falsifier/refutation language stays on the Calibration Lab, and a
  // watch row never carries an act-now verb. Every state × language cell is scanned, zh
  // included — a banned term that only appears in the zh watch head is still shipped copy.
  const BANNED = [
    "validated", "证伪", "falsifier", "falsif", "refuted", "refut",
    "buy now", "act now", "buy", "sell", "target",
  ];
  for (const state of ["WASHOUT_TURN", "TURN_WATCH"] as const) {
    for (const zh of [false, true]) {
      it(`keeps ${state} / ${zh ? "zh" : "en"} clear of banned vocabulary`, () => {
        const r = washoutTurnRead({ ...MCD, state }, zh, NOW)!;
        expect(r).not.toBeNull();
        const all = [r.head, r.detail ?? "", r.stance, r.receipt].join(" ").toLowerCase();
        for (const banned of BANNED) {
          expect(all, `${state} / ${zh ? "zh" : "en"} leaked "${banned}"`).not.toContain(banned.toLowerCase());
        }
      });
    }
  }
});

describe("washoutTurnRead — watch state", () => {
  const WATCH = { ...MCD, state: "TURN_WATCH" };

  it("renders the pinned EN watch read with no detail sentence", () => {
    const r = washoutTurnRead(WATCH, false, NOW)!;
    expect(r.state).toBe("TURN_WATCH");
    expect(r.turn).toBe(false);
    expect(r.head).toBe("Deep base — momentum curling up");
    expect(r.detail).toBeNull(); // no dated cross yet — the watch has nothing to date
    expect(r.stance).toBe("watch — early turn; windows, not certainties");
    expect(r.receipt).toBe(
      "depth: bottom 6.3% of own history · similar turns n=11: 13w median 4.2% · 26w median 7.9%",
    );
  });

  it("renders the pinned ZH watch read", () => {
    const r = washoutTurnRead(WATCH, true, NOW)!;
    expect(r.head).toBe("深部筑底 — 动能回升中");
    expect(r.detail).toBeNull();
    expect(r.stance).toBe("观察 — 转向初期；窗口而非定论");
  });
});

describe("washoutTurnRead — thin history disclosure", () => {
  it("says so in plain words when there is one prior turn and no medians", () => {
    const thin = { ...MCD, history: { n: 1, med_13w: null, med_26w: null } };
    expect(washoutTurnRead(thin, false, NOW)!.receipt).toBe(
      "depth: bottom 6.3% of own history · too few prior turns to summarize (n=1)",
    );
    expect(washoutTurnRead(thin, true, NOW)!.receipt).toBe("深度：自身历史最低 6.3% · 历史样本不足（n=1）");
  });

  it("falls to the thin form when n is high but a median is missing", () => {
    // n >= 8 alone must NOT unlock the summary — a null median has nothing to print.
    const noMed = { ...MCD, history: { n: 40, med_13w: 4.2, med_26w: null } };
    expect(washoutTurnRead(noMed, false, NOW)!.receipt).toBe(
      "depth: bottom 6.3% of own history · too few prior turns to summarize (n=40)",
    );
  });

  it("holds the n>=8 boundary: 7 is thin, 8 summarizes", () => {
    const at7 = { ...MCD, history: { ...MCD.history, n: 7 } };
    const at8 = { ...MCD, history: { ...MCD.history, n: 8 } };
    expect(washoutTurnRead(at7, false, NOW)!.receipt).toBe(
      "depth: bottom 6.3% of own history · too few prior turns to summarize (n=7)",
    );
    expect(washoutTurnRead(at8, false, NOW)!.receipt).toBe(
      "depth: bottom 6.3% of own history · similar turns n=8: 13w median 4.2% · 26w median 7.9%",
    );
  });

  it("treats an absent history block as n=0", () => {
    const bare = { state: "WASHOUT_TURN", since: "2026-07-31", depth_pctile: 6.3 };
    expect(washoutTurnRead(bare, false, NOW)!.receipt).toBe(
      "depth: bottom 6.3% of own history · too few prior turns to summarize (n=0)",
    );
  });
});

describe("washoutTurnRead — data-through suffix", () => {
  it("stays off inside the 3-day window and appears past it", () => {
    // NOW = 2026-08-05T12:00Z; data_through parses at midnight UTC.
    const on = (dt: string) => washoutTurnRead({ ...MCD, data_through: dt }, false, NOW)!.receipt;
    // 2026-08-02T00:00Z → 3.5 days → past the 3-day threshold: suffix shows
    expect(on("2026-08-02")).toContain(" · data through 2026-08-02");
    // 2026-08-03T00:00Z → 2.5 days → inside the window: no suffix
    expect(on("2026-08-03")).not.toContain("data through");
    expect(on("2026-08-03")).toBe(
      "depth: bottom 6.3% of own history · similar turns n=11: 13w median 4.2% · 26w median 7.9%",
    );
  });

  it("renders the pinned ZH suffix", () => {
    const r = washoutTurnRead({ ...MCD, data_through: "2026-08-02" }, true, NOW)!;
    expect(r.receipt).toBe(
      "深度：自身历史最低 6.3% · 类似转向 n=11：13周中位 4.2% · 26周中位 7.9% · 数据截至 2026-08-02",
    );
  });

  it("holds the boundary exactly: 3.000d is inside, +1ms is past", () => {
    // data_through parses at midnight UTC; the threshold is a strict `>`.
    const dt = "2026-08-02";
    const exact = Date.parse("2026-08-05T00:00:00Z"); // exactly 3 days
    expect(washoutTurnRead({ ...MCD, data_through: dt }, false, exact)!.receipt)
      .not.toContain("data through");
    expect(washoutTurnRead({ ...MCD, data_through: dt }, false, exact + 1)!.receipt)
      .toContain(" · data through 2026-08-02");
  });

  it("ignores an absent or unparseable data_through", () => {
    const noDt = { ...MCD } as Record<string, unknown>;
    delete noDt.data_through;
    expect(washoutTurnRead(noDt, false, NOW)!.receipt).not.toContain("data through");
    expect(washoutTurnRead({ ...MCD, data_through: "not-a-date" }, false, NOW)!.receipt)
      .not.toContain("data through");
  });

  it("rejects a date-shaped string that is not a real day", () => {
    // Date.parse rolls "2026-02-30" forward to 2026-03-02 and returns finite — without the
    // round-trip guard the row printed a day that never existed, verbatim.
    const r = washoutTurnRead({ ...MCD, data_through: "2026-02-30" }, false, NOW)!;
    expect(r.receipt).not.toContain("data through");
    expect(r.receipt).not.toContain("2026-02-30");
    expect(r.receipt).not.toContain("2026-03-02");
    expect(washoutTurnRead({ ...MCD, data_through: "2026-13-01" }, false, NOW)!.receipt)
      .not.toContain("data through");
  });

  it("rejects a data_through carrying a time component, without throwing", () => {
    const r = washoutTurnRead({ ...MCD, data_through: "2026-07-31T00:00:00Z" }, false, NOW)!;
    expect(r.receipt).not.toContain("data through");
    expect(r.receipt).toBe(
      "depth: bottom 6.3% of own history · similar turns n=11: 13w median 4.2% · 26w median 7.9%",
    );
  });

  it("rejects a non-string data_through", () => {
    for (const bad of [20260731, {}, [], true]) {
      expect(washoutTurnRead({ ...MCD, data_through: bad }, false, NOW)!.receipt)
        .not.toContain("data through");
    }
  });
});

describe("washoutTurnRead — hostile field shapes", () => {
  // The bridge trims and rounds, but this formatter renders whatever the tape hands it. A
  // half-migrated or hand-rolled block must still read as one of the pinned forms.
  const HOSTILE: Array<[string, Record<string, unknown>]> = [
    ["depth NaN", { ...MCD, depth_pctile: NaN }],
    ["depth {}", { ...MCD, depth_pctile: {} }],
    ["depth Infinity", { ...MCD, depth_pctile: Infinity }],
    ["depth string", { ...MCD, depth_pctile: "6.3" }],
    ["med NaN", { ...MCD, history: { n: 11, med_13w: NaN, med_26w: 7.9 } }],
    ["med {}", { ...MCD, history: { n: 11, med_13w: {}, med_26w: {} } }],
    ["med Infinity", { ...MCD, history: { n: 11, med_13w: Infinity, med_26w: 7.9 } }],
    ["n string", { ...MCD, history: { n: "11", med_13w: 4.2, med_26w: 7.9 } }],
    ["n NaN", { ...MCD, history: { n: NaN, med_13w: 4.2, med_26w: 7.9 } }],
    ["history []", { ...MCD, history: [] }],
    ["since 0", { ...MCD, since: 0 }],
    ["since false", { ...MCD, since: false }],
    ["since {}", { ...MCD, since: {} }],
    ["since []", { ...MCD, since: [] }],
    ["since empty", { ...MCD, since: "" }],
    ["data_through 2026-02-30", { ...MCD, data_through: "2026-02-30" }],
    ["everything hostile", { state: "TURN_WATCH", since: {}, depth_pctile: NaN,
                             data_through: [], history: { n: {}, med_13w: NaN, med_26w: {} } }],
  ];

  it("never prints NaN, undefined, Infinity, or [object Object]", () => {
    for (const [name, wt] of HOSTILE) {
      for (const zh of [false, true]) {
        const r = washoutTurnRead(wt, zh, NOW);
        expect(r, `${name} (${zh ? "zh" : "en"}) rendered nothing`).not.toBeNull();
        const all = [r!.head, r!.detail ?? "", r!.stance, r!.receipt].join(" ");
        for (const bad of ["NaN", "undefined", "Infinity", "[object Object]", "null"]) {
          expect(all, `${name} (${zh ? "zh" : "en"}) leaked ${bad}: ${all}`).not.toContain(bad);
        }
      }
    }
  });

  it("degrades each hostile field to its pinned placeholder form", () => {
    expect(washoutTurnRead({ ...MCD, since: 0 }, false, NOW)!.detail)
      .toBe("weekly momentum crossed up from a deep base · since —");
    expect(washoutTurnRead({ ...MCD, depth_pctile: NaN }, false, NOW)!.receipt)
      .toBe("depth: bottom —% of own history · similar turns n=11: 13w median 4.2% · 26w median 7.9%");
    // a NaN median must not unlock the summary — it falls to the thin form
    expect(washoutTurnRead({ ...MCD, history: { n: 11, med_13w: NaN, med_26w: 7.9 } }, false, NOW)!.receipt)
      .toBe("depth: bottom 6.3% of own history · too few prior turns to summarize (n=11)");
    // an uncountable n is 0 prior turns
    expect(washoutTurnRead({ ...MCD, history: { n: "11", med_13w: 4.2, med_26w: 7.9 } }, false, NOW)!.receipt)
      .toBe("depth: bottom 6.3% of own history · too few prior turns to summarize (n=0)");
    expect(washoutTurnRead({ ...MCD, history: { n: NaN } }, true, NOW)!.receipt)
      .toBe("深度：自身历史最低 6.3% · 历史样本不足（n=0）");
  });
});

describe("washoutTurnRead — missing fields and bad input", () => {
  it("prints an em dash for a null since rather than 'null'", () => {
    const r = washoutTurnRead({ ...MCD, since: null }, false, NOW)!;
    expect(r.detail).toBe("weekly momentum crossed up from a deep base · since —");
    expect(washoutTurnRead({ ...MCD, since: null }, true, NOW)!.detail)
      .toBe("周线动能自深部上穿 · 起于 —");
  });

  it("prints an em dash for a null depth_pctile", () => {
    const r = washoutTurnRead({ ...MCD, depth_pctile: null }, false, NOW)!;
    expect(r.receipt).toBe(
      "depth: bottom —% of own history · similar turns n=11: 13w median 4.2% · 26w median 7.9%",
    );
  });

  it("returns null for a state the row cannot speak about", () => {
    expect(washoutTurnRead({ ...MCD, state: "SOME_FUTURE_STATE" }, false, NOW)).toBeNull();
    expect(washoutTurnRead({ ...MCD, state: "washout_turn" }, false, NOW)).toBeNull(); // case-exact
    expect(washoutTurnRead({ ...MCD, state: null }, false, NOW)).toBeNull();
    const noState = { ...MCD } as Record<string, unknown>;
    delete noState.state;
    expect(washoutTurnRead(noState, false, NOW)).toBeNull();
  });

  it("returns null — never throws — for a non-object", () => {
    for (const bad of [undefined, null, "WASHOUT_TURN", 3, true, []]) {
      expect(washoutTurnRead(bad, false, NOW)).toBeNull();
      expect(washoutTurnRead(bad, true, NOW)).toBeNull();
    }
  });
});
