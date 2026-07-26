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
type MatrixEntry = {
  schema: string;
  root: string;
  spot: number;
  expiries: string[];
  strikes: number[];
  cells: { strike: number; expiry: string; gex: number }[];
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

  it("returns an honest empty for a root the matrix store does not carry — never SPY's", async () => {
    // QQQ is a Prism confluence-board root (SPY/QQQ/IWM); the old `all["SPY"]` fallback made
    // the board's three indices identical in dev. Absent must mean absent.
    expect(await fixtureFor("matrix:QQQ")).toEqual({});
    expect(await fixtureFor("matrix:IWM")).toEqual({});
    const spy = (await fixtureFor("matrix:SPY")) as MatrixEntry;
    expect(spy.root).toBe("SPY");
    expect(Array.isArray(spy.cells) && spy.cells.length > 0).toBe(true);
  });

  it("every root-keyed feed refuses an unknown root with {} — the whole family, one convention", async () => {
    for (const f of ["ticker:ZZZT", "vol:ZZZT", "gex:ZZZT", "moves:ZZZT", "tctx:ZZZT", "gexstate:ZZZT", "matrix:ZZZT"]) {
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
});
