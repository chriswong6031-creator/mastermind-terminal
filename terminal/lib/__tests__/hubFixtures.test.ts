// Options-Hub per-root fixture keying (vol: / tctx: / matrix:) — the last three feeds to
// retire the first-key fallback (ticker:/gex:/moves:/gexstate: already refused unknown roots).
//
// Two things are locked here:
//   1. HONEST EMPTY. fixtureFor("<feed>:<ROOT>") for a root the fixture does not carry must
//      return {} — never the first key's payload, never a designated default. The fallbacks
//      dressed the QQQ Tickers drill in NVDA's tctx z-chips, rendered a substituted root's
//      IV percentile on the Exposure Desk's Structure strip, and fed the Prism SPY/QQQ/IWM
//      confluence board the same SPY matrix three times over (fabricated alignment). {} lands
//      each consumer in the same absent state a prod 503 for a missing root produces.
//   2. ENTRY INTEGRITY. Each fixture entry must be renderable under its OWN key: vol/matrix
//      docs carry root === key (OptionsHubView renders vol only when payload.root matches the
//      selection — a mis-keyed entry would be invisible, not an error), tctx docs carry the
//      exact five z-keys the chips iterate, and matrix docs carry the arrays MatrixGrid and
//      SurfacePane iterate unconditionally.
import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { fixtureFor } from "@/lib/flowSource";

const dataFile = (name: string) => path.join(process.cwd(), "public", "data", name);

const Z_KEYS = [
  "net_signed_premium_z252",
  "zerodte_share_z252",
  "short_dated_otm_call_share_z252",
  "vol_gt_oi_share_z252",
  "block_share_z252",
] as const;

type TctxEntry = { asof: string; history_n: number; z: Record<string, number | null> };
type VolEntry = { schema: string; root: string; asof: string };
type MatrixLevels = {
  call_wall: number | null;
  put_support: number | null;
  hvl: number | null;
  gamma_flip: number | null;
  max_pain: number | null;
};
type MatrixEntry = {
  schema: string;
  root: string;
  spot: number;
  expiries: string[];
  strikes: number[];
  cells: { strike: number; expiry: string; gex: number }[];
  levels: MatrixLevels;
};

const loadJson = async <T>(name: string) =>
  JSON.parse(await fs.readFile(dataFile(name), "utf8")) as Record<string, T>;

describe("fixtureFor vol:/tctx:/matrix: — root keying", () => {
  it("serves QQQ's own IV context for vol:QQQ (case-normalized)", async () => {
    const doc = (await fixtureFor("vol:QQQ")) as VolEntry;
    expect(doc.root).toBe("QQQ");
    expect(doc.schema).toBe("options_hub.vol/v1");
    expect(await fixtureFor("vol:qqq")).toEqual(doc);
  });

  it("serves QQQ's own z-context for tctx:QQQ — not NVDA's chips", async () => {
    // QQQ sits on the Tickers tab cold-start index (seeded onto the unusual board in #214);
    // before the flip its drill wore NVDA's z-chips via the first-key fallback.
    const doc = (await fixtureFor("tctx:QQQ")) as TctxEntry;
    const nvda = (await fixtureFor("tctx:NVDA")) as TctxEntry;
    // history_n must clear the chips' warming threshold (minN = 20 in OptionsHubView) so the
    // drill shows real z values, not the accumulating "—" state.
    expect(doc.history_n).toBeGreaterThanOrEqual(20);
    for (const k of Z_KEYS) expect(Number.isFinite(doc.z[k]), k).toBe(true);
    expect(doc.z).not.toEqual(nvda.z);
    expect(await fixtureFor("tctx:qqq")).toEqual(doc);
  });

  it("serves each Prism confluence root its OWN matrix — three distinct ladders, never SPY's thrice", async () => {
    // The retired `all["SPY"]` fallback made the board's three indices identical in dev;
    // #216 replaced it with an honest {} (two "—" columns), and the QQQ/IWM entries now make
    // all three columns real. The failure this guards is a silent regression to one ladder
    // rendered three times, which reads as perfect alignment at every level.
    const [spy, qqq, iwm] = (await Promise.all(
      ["matrix:SPY", "matrix:QQQ", "matrix:IWM"].map((f) => fixtureFor(f))
    )) as MatrixEntry[];
    for (const [root, e] of [["SPY", spy], ["QQQ", qqq], ["IWM", iwm]] as const) {
      expect(e.root, root).toBe(root);
      expect(Array.isArray(e.cells) && e.cells.length > 0, root).toBe(true);
    }
    // Distinct worlds, not one payload relabelled.
    expect(new Set([spy.spot, qqq.spot, iwm.spot]).size).toBe(3);
    expect(new Set([spy.strikes[0], qqq.strikes[0], iwm.strikes[0]]).size).toBe(3);
    expect(await fixtureFor("matrix:qqq")).toEqual(qqq);
  });

  it("every root-keyed feed refuses an unknown root with {} — the whole family, one convention", async () => {
    for (const f of [
      "ticker:ZZZT", "vol:ZZZT", "gex:ZZZT", "moves:ZZZT", "tctx:ZZZT", "gexstate:ZZZT", "matrix:ZZZT",
      // R3 OI suite joins the same convention.
      "oi_time:ZZZT", "max_pain:ZZZT", "oi_change:ZZZT",
    ]) {
      expect(await fixtureFor(f), f).toEqual({});
    }
  });
});

describe("hub fixtures — entry integrity (every root)", () => {
  it("vol entries are keyed by their own root", async () => {
    const all = await loadJson<VolEntry>("vol_fixture.json");
    expect(Object.keys(all)).toContain("QQQ");
    for (const [key, e] of Object.entries(all)) {
      // OptionsHubView renders vol only under `volData.root === selectedTicker`; an entry
      // whose root disagrees with its key would fetch fine and then never render.
      expect(e.root, key).toBe(key);
      expect(e.schema, key).toBe("options_hub.vol/v1");
    }
  });

  it("tctx entries carry the exact z-keys the drill chips read", async () => {
    const all = await loadJson<TctxEntry>("tctx_fixture.json");
    expect(Object.keys(all)).toContain("QQQ");
    for (const [key, e] of Object.entries(all)) {
      expect(typeof e.history_n, key).toBe("number");
      expect(typeof e.asof, key).toBe("string");
      expect(Object.keys(e.z).sort(), key).toEqual([...Z_KEYS].sort());
      for (const k of Z_KEYS) {
        const v = e.z[k];
        expect(v === null || Number.isFinite(v), `${key} ${k}`).toBe(true);
      }
    }
  });

  it("matrix entries carry the arrays the grids iterate unconditionally", async () => {
    const all = await loadJson<MatrixEntry>("matrix_fixture.json");
    expect(Object.keys(all).sort()).toEqual(["IWM", "QQQ", "SPY"]);
    for (const [key, e] of Object.entries(all)) {
      expect(e.root, key).toBe(key);
      expect(Number.isFinite(e.spot), key).toBe(true);
      expect(e.strikes.length, key).toBeGreaterThan(0);
      expect(e.expiries.length, key).toBeGreaterThan(0);
      expect(e.cells.length, key).toBeGreaterThan(0);
      const strikeSet = new Set(e.strikes);
      const expSet = new Set(e.expiries);
      for (const c of e.cells) {
        // SurfacePane parses strike/expiry/gex off every cell; MatrixGrid buckets cells by
        // the strike × expiry axes — a cell referencing an unlisted axis renders as a hole.
        expect(Number.isFinite(c.strike), `${key} cell strike`).toBe(true);
        expect(strikeSet.has(c.strike), `${key} cell strike ${c.strike} listed`).toBe(true);
        expect(expSet.has(c.expiry), `${key} cell expiry ${c.expiry} listed`).toBe(true);
        expect(Number.isFinite(c.gex), `${key} cell gex`).toBe(true);
      }
    }
  });

  it("matrix levels sit on listed strikes, and gamma_flip agrees with the cells' own sign change", async () => {
    const all = await loadJson<MatrixEntry>("matrix_fixture.json");
    for (const [key, e] of Object.entries(all)) {
      const strikeSet = new Set(e.strikes);
      const sorted = [...e.strikes].sort((a, b) => a - b);
      const step = Math.min(...sorted.slice(1).map((s, i) => s - sorted[i]));

      for (const [name, v] of Object.entries(e.levels)) {
        if (v == null || name === "gamma_flip") continue;
        // MatrixGrid badges a level onto the row whose strike it matches; a level off the
        // axis is a badge that never renders.
        expect(strikeSet.has(v), `${key} level ${name}=${v} listed`).toBe(true);
      }

      // strikeBadge() tests levels in a fixed priority order within prox = step * 1.2, so two
      // levels closer than that collide and the lower-priority badge is unreachable.
      const present = Object.entries(e.levels).filter(([, v]) => v != null) as [string, number][];
      for (let i = 0; i < present.length; i++) {
        for (let j = i + 1; j < present.length; j++) {
          const gap = Math.abs(present[i][1] - present[j][1]);
          expect(gap, `${key} levels ${present[i][0]}/${present[j][0]} collide`).toBeGreaterThan(step * 1.2);
        }
      }

      // The one cell<->level invariant SPY actually satisfies (its call_oi/put_oi/volume all
      // peak at 759 while the published levels are 760/740/750/745 — the levels are NOT
      // argmax-derived, so only the flip is checkable against the cells).
      const byStrike = new Map<number, number>();
      for (const c of e.cells) byStrike.set(c.strike, (byStrike.get(c.strike) ?? 0) + c.gex);
      const crossings: [number, number][] = [];
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = byStrike.get(sorted[i]);
        const b = byStrike.get(sorted[i + 1]);
        if (a == null || b == null) continue;
        if (a < 0 !== b < 0) crossings.push([sorted[i], sorted[i + 1]]);
      }
      const flip = e.levels.gamma_flip;
      if (flip == null) {
        // A null flip must be earned: QQQ carries a large 494 put position that holds a
        // negative-gamma pocket above spot through the near-dated weeklies, so the
        // strike-summed profile crosses zero more than once and no single flip exists.
        expect(crossings.length, `${key} null gamma_flip with a single clean crossing`).toBeGreaterThan(1);
      } else {
        expect(crossings.length, `${key} gamma_flip with ${crossings.length} crossings`).toBe(1);
        expect(flip, `${key} gamma_flip inside its crossing`).toBeGreaterThan(crossings[0][0]);
        expect(flip, `${key} gamma_flip inside its crossing`).toBeLessThan(crossings[0][1]);
      }
    }
  });
});

// ─── Prism CONFLUENCE board ───────────────────────────────────────────────────
// ConfluenceView hard-codes SPY/QQQ/IWM and is the surface the retired matrix fallback
// damaged worst (one SPY ladder rendered three times = fabricated alignment at every level).
// These re-implement its own math against the fixture so the dev board's demo state is a
// locked property of the data, not something re-derived by hand each time it is touched.
describe("matrix fixture — the Prism confluence board renders three real ladders", () => {
  const BANDS = [2.4, 2.0, 1.6, 1.2, 0.8, 0.4, 0, -0.4, -0.8, -1.2, -1.6, -2.0, -2.4];
  const INDICES = ["SPY", "QQQ", "IWM"] as const;
  const ALIGNMENT_THRESHOLD = 0.5;
  const BAND_TOLERANCE = 0.8;

  /** ConfluenceView.nearestBucket — strict `<` means the first band wins a tie. */
  const nearestBucket = (pct: number) =>
    BANDS.reduce((best, b) => (Math.abs(pct - b) < Math.abs(pct - best) ? b : best), BANDS[0]);

  it("every band resolves to a strike with a first-expiry cell, for all three indices", async () => {
    const all = await loadJson<MatrixEntry>("matrix_fixture.json");
    for (const idx of INDICES) {
      const e = all[idx];
      for (const band of BANDS) {
        // computeBucketRows picks the strike nearest the band, then reads ONLY the first
        // expiry. A band with no strike inside 0.8%, or a strike the front expiry dropped,
        // renders a permanent "—" in that index's column.
        let best: number | null = null;
        let bestDist = Infinity;
        for (const s of e.strikes) {
          const d = Math.abs(((s - e.spot) / e.spot) * 100 - band);
          if (d < bestDist) { bestDist = d; best = s; }
        }
        expect(bestDist, `${idx} band ${band} has no strike within tolerance`).toBeLessThanOrEqual(BAND_TOLERANCE);
        const cell = e.cells.find((c) => c.strike === best && c.expiry === e.expiries[0]);
        expect(cell, `${idx} band ${band} -> strike ${best} missing a ${e.expiries[0]} cell`).toBeTruthy();
      }
    }
  });

  it("alignment is partial by construction — one 3-of-3, one 2-of-3, two deliberate misses", async () => {
    const all = await loadJson<MatrixEntry>("matrix_fixture.json");
    const chips = (["gamma_flip", "call_wall", "put_support", "hvl"] as const).map((key) => {
      const pcts = INDICES
        .filter((i) => all[i].levels[key] != null)
        .map((i) => ((all[i].levels[key] as number) - all[i].spot) / all[i].spot * 100);
      if (pcts.length < 2) return { key, chip: null as null | { count: number; band: number } };
      const spread = Math.max(...pcts) - Math.min(...pcts);
      if (spread > ALIGNMENT_THRESHOLD) return { key, chip: null };
      const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
      return { key, chip: { count: pcts.length, band: nearestBucket(avg) } };
    });
    const byKey = Object.fromEntries(chips.map((c) => [c.key, c.chip]));

    // hvl: SPY 750 / QQQ 484 / IWM 298 — a magnet at spot on all three.
    expect(byKey.hvl).toEqual({ count: 3, band: 0 });
    // gamma_flip: SPY + IWM only. QQQ's is null (its negative-gamma pocket above spot leaves
    // no single flip), and since the spread is taken over every non-null index, a null is the
    // ONLY way the 2-of-3 chip state is reachable at all.
    expect(byKey.gamma_flip).toEqual({ count: 2, band: -0.4 });
    // QQQ's wall/support sit far outside SPY's and IWM's — the board must show these as
    // unaligned. Perfect alignment everywhere was the bug #216 retired.
    expect(byKey.call_wall).toBeNull();
    expect(byKey.put_support).toBeNull();
  });
});
