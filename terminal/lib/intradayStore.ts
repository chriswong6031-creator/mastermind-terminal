// Server-only intraday HISTORY store reader. Imported ONLY by app/api/intraday/route.ts.
//
// This module holds ALL node:fs access. Pure bar/timeframe helpers are imported from
// intradayShared — a dep-free module safe on both sides of the client/server boundary. We must NOT
// import runtime values from intradaySources (client-shared, pulls node:fs through this file into
// the client bundle → Turbopack "chunking context does not support external modules: node:fs").
// intradayShared has no node imports, so the import here is safe.
//
// Store: public/data/intraday/<SYM>.<base>.json (ingest/backfill_intraday.py, Polygon 2021→now,
// 1h all US + 5m top-500), display-epoch bars matching intradaySources.fetchPolygon's live tail.
import { promises as fsp } from "node:fs";
import path from "node:path";
import {
  type Bar6, tfMinutes,
  filterUsEquitySession, resampleUsEquitySession,
} from "./intradayShared";

const STORE_DIR = path.join(process.cwd(), "public", "data", "intraday");
const HIST_CAP = 20000;                              // bound the response (~1MB); chart shows a window + scrolls back
const isUS = (sym: string) => !/\.(SS|SZ|HK|TO)$/i.test(sym) && !/-USD$/i.test(sym);
function storeBase(tf: string): "1h" | "5m" | null {
  const mins = tfMinutes(tf);
  if (mins >= 60) return "1h";   // 1h/2h/3h/4h resample from the 1h store
  if (mins >= 5) return "5m";    // 5m–45m from the 5m store
  return null;                   // 1m/2m/3m — no pre-store, live window only
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
  let base = storeBase(tf);
  if (!base) return live;
  // For regular hourly charts prefer the 5m store when available. It can be
  // cleanly filtered at 09:30 before resampling; a provider-built 09:00 hourly
  // bar has already mixed 30 minutes of premarket data and cannot be repaired.
  let stored: Bar6[] = [];
  if (!ext && tfMinutes(tf) >= 60) {
    stored = await readStore(sym, "5m");
    if (stored.length) base = "5m";
  }
  if (!stored.length) stored = await readStore(sym, base);
  if (!stored.length) return live;
  const baseMin = base === "1h" ? 60 : 5;
  const session = ext ? "extended" : "regular";
  const selected = filterUsEquitySession(stored, session);
  const targetMin = tfMinutes(tf);
  const hb = targetMin === baseMin
    ? selected
    : resampleUsEquitySession(selected, targetMin, session);
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
