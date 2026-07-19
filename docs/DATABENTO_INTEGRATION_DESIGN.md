# Databento Intraday Integration — Engineering Design

Status: **design only** (Wave 1 ships this doc + deletes `lib/live.ts`; implementation is a later wave).
Audience: the engineer building the Databento intraday plane next wave. Every claim below is
anchored to `file:line` in the current tree — trust the anchors over your memory of the code.

## 0. TL;DR / why this is not a drop-in

The intraday plane is architecturally hostile to a true-UTC licensed feed:

1. **Every intraday bar is a "display epoch"** — market-local wall-clock reinterpreted as a UTC
   instant (`lib/intradaySources.ts:8-11`, `etDisplay` `:25-31`, Tencent `:90`, HK `:117`; store
   backfill mirrors it, `lib/intradayStore.ts:9-10`). This fiction is **load-bearing** across the
   whole client math layer (§4). A Databento adapter that emits real UTC would silently break
   `minOfDay`/`dayKey`/session boundaries/VWAP resets/ORB windows for every consumer.
2. **`Bar6` is a bare 6-tuple** `[epoch,o,h,l,c,v]` (`lib/intradayShared.ts:10`) — no venue, no
   session flag, no source provenance, no adjusted/synthesized markers. It cannot represent a
   licensed feed's metadata.
3. **The browser opens a vendor socket with an inlined key** (`lib/live.ts:14-21`,
   `wss://socket.polygon.io/stocks`, `NEXT_PUBLIC_POLYGON_KEY`) — a redistribution-license +
   key-exposure liability. This must be **deleted, not adapted** (INFRA lane owns the deletion in
   Wave 1).
4. **No 1s resolution exists anywhere** — `INTRADAY_TFS` floors at `1m`, `tfMinutes` only parses
   `m|h` (`lib/intradayShared.ts:12,16-21`).
5. **Historical bars are hard-coupled to Polygon in the app layer** (`fetchIntraday` `:153-167`,
   `intradayStore` reads only Polygon `<SYM>.<base>.json`) — no provider seam.

The correct partition: **hub owns streaming/quotes** (already a normalized `{SYM:{…}}` contract with
venue-agnostic `classify()`), **app owns historical bars** (`intradaySources` + `intradayStore`).
Databento gets a seam on each side. Do **not** merge the two planes.

---

## 1. Canonical UTC bar/event schema

Introduce a canonical record for the UTC plane. Keep `Bar6` alive for legacy display-epoch sources
until each is cut over (§5); add `CanonicalBar` alongside it in `lib/intradayShared.ts`.

```ts
// lib/intradayShared.ts (new, parallel to Bar6)
export type Session = "PRE" | "RTH" | "AH" | "CLOSED";
export type BarBasis = "display" | "utc";          // §5 discriminator
export type BarSource = "databento" | "polygon" | "tencent";

export interface CanonicalBar {
  t_utc_ms: number;     // TRUE UTC epoch ms (NOT a display epoch)
  o: number; h: number; l: number; c: number; v: number;
  venue: string;        // Databento publisher/venue id (e.g. "XNAS", "ARCX"); "" when unknown
  session: Session;     // server-populated; NEVER re-derived from a mutated epoch client-side
  source: BarSource;
  synthesized: boolean; // true = fabricated OHLC (today: HK, lib/intradaySources.ts:107-125)
  adjusted: boolean;    // split/div adjusted (Polygon uses adjusted=true, intradaySources.ts:45)
}
```

Rules:
- `session` and `synthesized` are **producer-populated server-side**. Databento carries venue +
  session natively; do not infer them from a display-epoch `minOfDay` (that inference only works
  because today's epoch is already local — see §4).
- **Event vs bar**: a raw Databento *event* (1s bar or trade tick) folds into the *forming*
  1m/1h `CanonicalBar` server-side (§3, §6). The client never sees raw trade events; it sees bars
  plus a single "forming bar" update.
- **Corrections**: Databento can emit late corrections. Carry an optional `revision?: number`; a
  higher revision for the same `(t_utc_ms, venue)` replaces the prior bar. Legacy epoch-equality
  merge (`intradayStore.ts:47-49`) has no such concept — the Databento store path must dedupe on
  `(t_utc_ms, venue, revision)`, not bare epoch.

**Wire format**: keep the response compact but versioned. Add `schema:2` + `basis` to the
`/api/intraday` payload (`app/api/intraday/route.ts:70`). Emit parallel arrays or a versioned tuple
(`[t_utc_ms,o,h,l,c,v,venueIdx,sessionIdx,flags]`) rather than fat objects per bar — the chart maps
`b[0]→time` today (`ChartPanel.tsx:3029`); keep index 0 the time axis so the mapping stays trivial,
and branch on the payload's top-level `basis`/`schema`, not per-bar.

---

## 2. Two seams: hub (streaming/quotes) vs app (historical bars)

### 2a. Hub seam — `hub/lib/databento.js` (streaming + live quotes)

Model on `hub/lib/polygon.js`. Server-only key, writes normalized quotes into the existing `Store`
via the `{SYM:{…}}` contract (`hub/hub.js:145-178`, `store.getQuotes`). `classify()`
(`hub/hub.js:77-83`) already venue-routes; add a `databento` branch or a provider-select env
(mirror `HUB_POLYGON_CLUSTER`, `hub/hub.js:11-13`).

- Databento live 1s/trade events stream **into the hub**; the hub folds the forming 1m/1h bar
  (§3) and exposes both the top-of-book quote (existing `/quotes`) and, new this wave's successor,
  a streamed **forming-bar** channel.
- The browser reaches the hub **only through a Next server route** (SSE or WS proxy) — never a
  direct browser→Databento socket. The hub already refuses non-loopback Hosts (`hub/hub.js:180-192`),
  so a new `app/api/stream/route.ts` proxy is the only public door.
- `useLive`'s `onTick` consumer in `TerminalShell` (`components/TerminalShell.tsx:732` `onTick`,
  `:733` `useLive(active,onTick)`, header update `:876-879`) is re-pointed at that server-mediated
  stream when `live.ts` is deleted.

### 2b. App seam — provider router in `lib/intradaySources.ts`

`fetchIntraday` (`:153-167`) hardcodes `us|crypto→Polygon`, `hk→Tencent-HK`, `cn→Tencent`,
`ca→[]`. Replace the inline switch with a provider table keyed by `(market, tf, entitlement)`:

```ts
interface IntradayProvider {
  fetchBars(sym: string, tf: string, ext: boolean): Promise<CanonicalBar[]>;
  caps: { seconds: boolean; venues: string[] };
}
```

Register `databento` for the licensed asset classes; keep `polygon`/`tencent` as fallback
providers selected by config/entitlement, **not** the market string. The Databento provider emits
`CanonicalBar` (UTC + venue + session + source + synthesized + adjusted); legacy providers keep
emitting `Bar6` tagged `basis:'display'` until cut over.

---

## 3. Resolution ladder (1s / 1m / 1h / 1d)

Current state: `INTRADAY_TFS` has no `1s`; `tfMinutes` returns 0 for any `s` tf
(`lib/intradayShared.ts:12,16-21`) → `isIntradayTf('1s')` false → `fetchIntraday` returns `[]`
(`:154`) → route 400s (`app/api/intraday/route.ts:28`). `storeBase` only has `1h`/`5m`
(`intradayStore.ts:20-25`); sub-5m is "live window only".

Design:
- **Generalize the grammar to seconds.** Add `tfSeconds(tf)` (unit `s|m|h` → seconds), add `1s`
  (and any second multiples wanted) to `INTRADAY_TFS`/`INTRADAY_SET`. Make `resample`
  (`intradayShared.ts:34-47`) bucket in **seconds** not `minutes*60` — it already works in a
  `span` variable, so widen the input to a second-span and drop the `*60`.
- **1s**: served natively by Databento for a **short capped window only** (seconds bars are huge —
  cap depth, e.g. last N hours; do not backfill 1s into the deep store).
- **1m/1h**: from Databento aggregates, or server-side rollup of 1s via the generalized `resample`.
- **1d**: **stays on the existing daily path** — the string-keyed `/data/<SYM>.json` contract
  (`lib/dataCache.ts:256-259` `getOhlc`). **Do NOT route daily through the intraday plane.** Daily
  is `"YYYY-MM-DD"`; intraday is numeric epoch; the two never mix on one render
  (`intradaySources.ts:6-8`).
- **Live-bar building from 1s events**: subscribe to 1s/trade events **server-side in the hub**,
  fold into the forming 1m/1h bucket, push **one** forming-bar update to the client. Mirror the
  bucket-fold logic already in `ChartPanel.applyLiveSplice` (`:1565-1614`) — but that path is
  **daily-only and explicitly bails on intraday** (`:1567` `if (isIntradayRef.current) return`), so
  the intraday fold is new client plumbing (§6), on the numeric-epoch axis rather than the
  `"YYYY-MM-DD"` axis `spliceDaily` uses.

---

## 4. Display-epoch → UTC migration (per-source `basis`, feature-flagged — NOT a global flip)

**Do not globally flip to UTC.** A global flip offsets every `minOfDay`/`dayKey`/session boundary by
the market's UTC offset and mislabels PRE/RTH/AH, VWAP resets, ORB windows, and PDH/PDL dates —
US by −4/−5h, CN/HK by +8h. Migrate **per source** behind a per-source feature flag.

### Blast-radius consumers (all currently ASSUME the epoch is already market-local)

| Consumer | Site | Assumption |
|---|---|---|
| `minOfDay` | `lib/intradayMath.ts:47` `Math.floor(t/60)%1440` | epoch is local |
| `dayKey` | `lib/intradayMath.ts:53` `Math.floor(t/86400)` | epoch is local |
| `isoWeek` | `lib/intradayMath.ts:159-170` "treat as UTC date" | epoch is local |
| `sessionLevels` date | `lib/intradayMath.ts:724-728` `dayKey*86400*1000`→`toISOString()` | epoch is local |
| `sessionOpenMin`/session slices/VWAP/ORB/rvol | `lib/intradayMath.ts` (uses `minOfDay`/`dayKey`) | epoch is local |
| session shading | `lib/sessionShading.ts:48` `minOfDay` (RTH 570–960) | epoch is local |
| DayStats open bar | `components/DayStatsStrip.tsx:22` `minOfDay(b.time)>=openMin` | epoch is local |
| DayStats session date | `components/DayStatsStrip.tsx:26,44` `dayKey*86400*1000`→`toISOString()` | epoch is local |
| Chart session-date derivations | `components/ChartPanel.tsx:866-867, 1544` `*1000`→`toISOString()` | epoch is local |
| Chart time mapping | `components/ChartPanel.tsx:3029` `b[0]`→LWC time | axis is whatever the epoch is |
| Store RTH filter | `lib/intradayStore.ts:26` `rthOK` `((e/60)%1440)` | epoch is local |
| Live-tail RTH filter | `lib/intradaySources.ts:57` `minOfDay 570–960` | epoch is local |

### Strategy
- Add a **`basis` discriminator** (`'display'|'utc'`) + an explicit **`tzOffsetSec`** (or venue that
  resolves to one) to the payload and to `CanonicalBar`.
- Rewrite every function above to take the offset as input:
  `localSec = basis === 'utc' ? utcSec + tzOffsetSec : utcSec`, then run the existing
  `minOfDay`/`dayKey`/session math on `localSec`. Legacy display-epoch sources pass
  `tzOffsetSec = 0` and are byte-for-byte unchanged.
- **Feature-flag per source**: Databento sources emit `basis:'utc'`; Polygon/Tencent keep
  `basis:'display'` until each is individually cut over. Daily string-keyed charts are **never**
  touched (they carry no epoch).
- Tests: `spliceDaily`/`foldFinalBucket` are already exported for unit tests
  (`ChartPanel.tsx`), and fixtures live in `lib/__tests__/` (`dayStats.test.ts`,
  `intradayMath.test.ts`). Add **basis-aware fixtures** (same wall-clock bar under
  `basis:'display'` and `basis:'utc'` must yield identical `minOfDay`/session labels).

---

## 5. Cache-keying rules

Current keys omit source/basis/venue → a provider or entitlement switch can serve cross-provider
(potentially display-vs-UTC) stale bars.

| Cache | Site | Current key | New key |
|---|---|---|---|
| intraday route | `app/api/intraday/route.ts:31` | `${sym}\|${tf}\|${ext?1:0}` (45s TTL `:19`) | `${sym}\|${tf}\|${ext}\|${source}\|${basis}` |
| quote route | `app/api/quote/route.ts` (bare sym) | `sym` | add `source` |
| client dataCache | `lib/dataCache.ts:16,91` | keyed by URL | put `provider`/`basis` in the `/api/intraday` URL so identity changes on plane switch |

- A provider cutover must **invalidate the in-memory route `CACHE`** (`route.ts:18`) and the client
  cache (`invalidate()`, `dataCache.ts:166-174`) — do not rely on 45s TTL expiry to converge.
- Include a `provider`/`basis` query param in the client's `/api/intraday` URL so `dataCache`'s
  URL-keyed identity (and the `no-store` fetch) changes when the plane changes.

---

## 6. Live-fold (intraday forming bar) — client side

`applyLiveSplice` (`ChartPanel.tsx:1565-1614`) is daily-only (`:1567` bails on intraday) and
`spliceDaily`/`sessionDateOf` operate on `"YYYY-MM-DD"`. `useLive.onTick`
(`TerminalShell.tsx:732`) only sets `livePx` (header, `:876-879`) — it never touches the chart.
So a Databento 1s feed has **no client fold path** today.

Design an intraday live-fold:
- Hub maintains the forming 1m/1h bar from 1s/trade events (§3) and streams it via the
  server-mediated channel (§2a).
- Client folds it into the last epoch bucket via `series.update()` — analogous to the bucket rewrite
  at `ChartPanel.tsx:1587-1598`, but on the **numeric-epoch** axis, guarded by the `basis`
  discriminator so the forming-bar epoch matches the historical tail's convention.
- Depends on §3 (tf-seconds) and §4 (basis) landing first.

---

## 7. Auth / entitlement path

- **No browser keys.** `live.ts` (`NEXT_PUBLIC_LIVE`/`NEXT_PUBLIC_POLYGON_KEY`,
  `lib/live.ts:14-15`) is deleted this wave. Any `NEXT_PUBLIC_*` var is inlined into the client
  bundle → world-readable. Never reintroduce one for Databento.
- All vendor auth stays server-side: hub holds the Databento key (mirror `POLYGON_API_KEY`,
  `hub/hub.js:65,233`); historical fetch reads it server-only in `intradaySources` (mirror
  `process.env.POLYGON_API_KEY`, `:34`).
- **Entitlement gate**: reuse `TERMINAL_REQUIRE_AUTH` (`route.ts:37-41`, quote route) but add
  per-asset-class **license + pro/non-pro** checks server-side before serving Databento bars. A
  developer subscription is **not** a terminal redistribution license (competitive assessment
  §roadmap). Classify the viewer (pro vs non-pro) and honor exchange agreements before returning
  real-time or licensed depth.

---

## 8. What NOT to do (hard list)

- ❌ **No global display→UTC flip.** Only per-source `basis` behind a flag (§4).
- ❌ **No `NEXT_PUBLIC_*` provider keys.** Ever.
- ❌ **No browser→vendor socket.** Streaming goes hub → Next server route → browser (§2a).
- ❌ **Do not route daily (`1d`) through the intraday plane.** Daily stays string-keyed
  `/data/<SYM>.json` (§3).
- ❌ **Do not merge synthesized and real bars** once both exist. HK bars are fabricated
  (`intradaySources.ts:107-125`, `h/l = max/min(o,c)` understates range) and unflagged; the
  epoch-merge in `withStoredHistory` (`intradayStore.ts:47-49`) must never blend `synthesized:true`
  with real Databento OHLC. Route HK through Databento and drop `hkSessionBars` when licensed.
- ❌ **Do not re-derive `session`/`synthesized` client-side from a mutated epoch.** Producer
  populates them server-side.
- ❌ **Do not blend Databento and Polygon stores by bare epoch.** Key stored files by source
  (`<SYM>.<base>.<source>.json`) or carry `source` in the payload; dedupe on
  `(t_utc_ms, venue, revision)`.
- ❌ **Do not extend `live.ts`** — delete it (INFRA lane).

---

## 9. PR sequence (dependencies)

1. **PR-A — schema + grammar (no behavior change).** Add `CanonicalBar`, `Session`, `BarBasis`,
   `BarSource`, `tfSeconds`, `1s` in `INTRADAY_TFS`/`INTRADAY_SET`; make `resample` second-granular
   (`lib/intradayShared.ts`). Legacy `Bar6` sources emit `basis:'display'`, `tzOffsetSec:0`. No
   consumer rewrites yet. Unit-test `resample` at 1s. *Deps: none.*
2. **PR-B — basis-threaded math.** Rewrite §4 consumers to take `tzOffsetSec`/`basis` and compute
   `localSec`; add basis-aware fixtures in `lib/__tests__/`. Still display-only in practice
   (all sources `basis:'display'`). *Deps: PR-A.*
3. **PR-C — app provider router.** Refactor `fetchIntraday` into the `IntradayProvider` table;
   register polygon/tencent as-is; add a stub `databento` provider gated off by entitlement.
   Source-key the store reader (`<SYM>.<base>.<source>.json`) in `withStoredHistory`. *Deps: PR-A.*
4. **PR-D — cache keys + payload version.** Add `source`/`basis` to route cache key + payload
   (`schema:2`), thread `provider`/`basis` into the client `/api/intraday` URL, wire cutover
   invalidation. *Deps: PR-C.*
5. **PR-E — hub Databento provider (streaming/quotes).** `hub/lib/databento.js` writing quotes to
   `Store`; forming-bar fold from 1s; provider-select env. *Deps: none (parallel to A–D); the
   live-feed key + entitlement must exist.*
6. **PR-F — server stream proxy + client live-fold.** `app/api/stream/*` SSE/WS proxy; re-point
   `TerminalShell` `onTick` off the (already-deleted) `live.ts` onto the server stream; intraday
   `series.update()` fold in `ChartPanel`. *Deps: PR-B, PR-E.*
7. **PR-G — Databento historical + HK cutover.** Turn on the `databento` provider for licensed
   classes emitting `basis:'utc'`; badge/route synthesized HK through Databento and retire
   `hkSessionBars`. *Deps: PR-B, PR-C, PR-D; gated on the license + pro/non-pro classification.*

Wave 1 does none of these — it ships this doc and deletes `lib/live.ts` (INFRA lane).
