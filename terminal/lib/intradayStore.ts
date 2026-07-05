// Server-only intraday HISTORY store reader. Imported ONLY by app/api/intraday/route.ts.
//
// This module holds ALL node:fs access. It imports only `type Bar6` (type-only, fully erased at
// build) from intradaySources — never a runtime value — so it does NOT join intradaySources'
// module graph. That matters because components/TerminalShell.tsx imports intradaySources
// (client), making it client-shared; if node:fs reaches that graph, Turbopack merges it into the
// client bundle and the build fails ("chunking context does not support external modules: node:fs").
// Keeping fs in this route-only module (never imported by a client component) keeps it server-side.
//
// Store: public/data/intraday/<SYM>.<base>.json (ingest/backfill_intraday.py, Polygon 2021→now,
// 1h all US + 5m top-500), display-epoch bars matching intradaySources.fetchPolygon's live tail.
import { promises as fsp } from "node:fs";
import path from "node:path";
import type { Bar6 } from "./intradaySources";

const STORE_DIR = path.join(process.cwd(), "public", "data", "intraday");
const HIST_CAP = 20000;                              // bound the response (~1MB); chart shows a window + scrolls back
const RTH_START = 9 * 60 + 30, RTH_END = 16 * 60;    // ET minutes-of-day for regular hours

// self-contained helpers (mirrors of the intradaySources pure fns) so this module has NO runtime
// import from the client-shared intradaySources module.
function tfMin(tf: string): number {
  const m = /^(\d+)(m|h)$/.exec(tf);
  if (!m) return 0;
  const n = parseInt(m[1], 10) || 1;
  return m[2] === "h" ? n * 60 : n;
}
const isUS = (sym: string) => !/\.(SS|SZ|HK|TO)$/i.test(sym) && !/-USD$/i.test(sym);
function storeBase(tf: string): "1h" | "5m" | null {
  const mins = tfMin(tf);
  if (mins >= 60) return "1h";   // 1h/2h/3h/4h resample from the 1h store
  if (mins >= 5) return "5m";    // 5m–45m from the 5m store
  return null;                   // 1m/2m/3m — no pre-store, live window only
}
const rthOK = (e: number) => { const m = (((e / 60) % 1440) + 1440) % 1440; return m >= RTH_START && m < RTH_END; };

function resample(bars: Bar6[], minutes: number): Bar6[] {
  if (minutes <= 0 || bars.length === 0) return bars;
  const span = minutes * 60;
  const out: Bar6[] = [];
  let cur: Bar6 | null = null, key = NaN;
  for (const b of bars) {
    const k = Math.floor(b[0] / span);
    if (k !== key) { if (cur) out.push(cur); key = k; cur = [k * span, b[1], b[2], b[3], b[4], b[5]]; }
    else { cur![2] = Math.max(cur![2], b[2]); cur![3] = Math.min(cur![3], b[3]); cur![4] = b[4]; cur![5] += b[5]; }
  }
  if (cur) out.push(cur);
  return out;
}

async function readStore(sym: string, base: "1h" | "5m"): Promise<Bar6[]> {
  try {
    const raw = await fsp.readFile(path.join(STORE_DIR, `${sym.toUpperCase()}.${base}.json`), "utf8");
    const j = JSON.parse(raw);
    return Array.isArray(j?.bars) ? (j.bars as Bar6[]) : [];
  } catch { return []; }          // no store for this symbol/tf → history absent, live tail still serves
}

// Prepend deep stored history to the live tail (US only). live wins on epoch overlap (fresher;
// carries the forming bar). Non-US / no-store / sub-5m → live unchanged.
export async function withStoredHistory(sym: string, tf: string, ext: boolean, live: Bar6[]): Promise<Bar6[]> {
  if (!isUS(sym)) return live;
  const base = storeBase(tf);
  if (!base) return live;
  const stored = await readStore(sym, base);
  if (!stored.length) return live;
  const baseMin = base === "1h" ? 60 : 5;
  let hb = tfMin(tf) === baseMin ? stored : resample(stored, tfMin(tf));
  if (!ext && tf.endsWith("m")) hb = hb.filter((b) => rthOK(b[0])); // match live leg's RTH filter (minute units)
  const liveEp = new Set<number>(live.map((b) => b[0]));
  const merged: Bar6[] = [];
  for (const b of hb) if (!liveEp.has(b[0])) merged.push(b);
  for (const b of live) merged.push(b);
  merged.sort((a, b) => a[0] - b[0]);
  const out: Bar6[] = [];
  let last = -1;
  for (const b of merged) { if (b[0] !== last) { out.push(b); last = b[0]; } } // ascending + unique
  return out.slice(-HIST_CAP);
}
