"""gc_orphans.py — Reconcile disk vs manifest; archive or adopt stray OHLC files.

Orphan = base <SYM>.json in the data output directory where <SYM> is NOT a manifest
key, excluding the following guarded categories:

  * manifest*.json / _gc_manifest.json                  (manifest files themselves)
  * sibling artifacts: *.slice.json, *.intel.json,
    *.backtest.json                                      (carried with their base)
  * _-prefixed index files (_HSI, _SPX, etc.)           (internal index markers)
  * Flagship symbols from build_polygon_universe.DEFAULT (always protected)
  * Any symbol already in the manifest                  (not an orphan)

Default action: ARCHIVE — move base + existing siblings as a unit to
  /opt/terminal/_backups/orphans-<UTC-ts>/
and write a _gc_manifest.json reversal record (reversible restore).

Optional --adopt: instead of archiving, add a manifest row if the orphan has
>=120 good bars AND a name resolves.  Name resolution:
  - US   : from CS+ADRC Polygon reference cache (.polygon_us_ref.json)
  - HK   : from hk_universe_cache.json
  - CN   : from macro members parquets (data/china_search/members.parquet)
  Unresolvable names -> archive anyway (never invent a name).
  Adoption uses staging->atomic-write pattern (never writes live manifest in place).

CLI:
  python ingest/gc_orphans.py [--adopt] [--min-bars 120] [--dry-run]
                              [--limit N] [--market US|HK|CN|all]

Report (always printed): disk/manifest/orphans/archived/adopted/guarded-skips by market.

Nightly hook (manual-first per BUILD-SPEC §Part B):
  Run --dry-run first and verify the expected ~540 orphan count before wiring into
  terminal-data.  The signals agent owns terminal-data; supply the single line:
    run "$PY" ingest/gc_orphans.py
  inside the swap-OK branch only (archive-only default, never touches manifest.json).
"""
from __future__ import annotations

import json
import os
import sys
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "terminal" / "public" / "data"
MANIFEST = Path(os.environ.get("TERMINAL_MANIFEST") or (OUT / "manifest.json"))
BACKUPS = Path("/opt/terminal/_backups")
MACRO = Path(os.environ.get("MACRO_REPO", "/Users/chriswong/Documents/Cluade/Macro Dashboard"))

# Sibling suffixes that travel with the base <SYM>.json
_SIBLING_SUFFIXES = (".slice.json", ".intel.json", ".backtest.json")

# Exclusion guards — these patterns are NEVER moved, even if not in the manifest
_MANIFEST_PATTERNS = ("manifest", "_gc_manifest")  # filename contains one of these

# Market classifiers for orphan tickers
def _classify_market(sym: str) -> str:
    """Best-effort market classification from the ticker suffix."""
    if sym.endswith("-USD"):
        return "crypto"
    if sym.endswith(".HK"):
        return "HK"
    if sym.endswith(".SS") or sym.endswith(".SZ"):
        return "CN"
    # Canada (TSX)
    if sym.endswith(".TO"):
        return "CA"
    # Default: US (plain alpha)
    return "US"


def _load_flagship() -> set[str]:
    """Load the flagship DEFAULT set from build_polygon_universe."""
    try:
        # Import relative to ROOT so we don't depend on sys.path tricks
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "build_polygon_universe",
            ROOT / "ingest" / "build_polygon_universe.py"
        )
        mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
        spec.loader.exec_module(mod)  # type: ignore[union-attr]
        return set(mod.DEFAULT)
    except Exception as e:
        print(f"  [gc] WARNING: could not import DEFAULT from build_polygon_universe ({e})")
        return set()


def _load_manifest_symbols() -> set[str]:
    try:
        return set(json.loads(MANIFEST.read_text()).get("symbols", {}).keys())
    except Exception as e:
        print(f"  [gc] ERROR: cannot read manifest ({e}) — aborting")
        sys.exit(1)


def _load_manifest_full() -> dict[str, Any]:
    return json.loads(MANIFEST.read_text())


def _count_good_bars(ohlc_path: Path) -> int:
    """Return the number of bars with a non-null close in the OHLC file."""
    try:
        data = json.loads(ohlc_path.read_text())
        bars = data.get("bars", [])
        return sum(1 for b in bars if b and len(b) >= 5 and b[4] is not None)
    except Exception:
        return 0


# ---------------------------------------------------------------- name resolution for --adopt
def _load_us_ref_cache() -> dict[str, dict]:
    """Load the CS+ADRC Polygon reference cache (expand_universe's cache file)."""
    cache = ROOT / "ingest" / ".polygon_us_ref.json"
    if not cache.exists():
        return {}
    try:
        raw = json.loads(cache.read_text())
        # Strip sentinel
        return {k: v for k, v in raw.items() if k != "__schema__"}
    except Exception:
        return {}


def _load_hk_cache() -> dict[str, dict]:
    cache = ROOT / "ingest" / "hk_universe_cache.json"
    if not cache.exists():
        return {}
    try:
        return json.loads(cache.read_text())
    except Exception:
        return {}


def _load_cn_members() -> dict[str, str]:
    """ticker -> name_en from china_search/members.parquet."""
    try:
        import pandas as pd
        p = MACRO / "data" / "china_search" / "members.parquet"
        if not p.exists():
            return {}
        df = pd.read_parquet(p)
        if "name_en" in df.columns:
            return {str(idx): str(row["name_en"]) for idx, row in df.iterrows()
                    if row.get("name_en") and str(row["name_en"]) != "nan"}
        if "name" in df.columns:
            return {str(idx): str(row["name"]) for idx, row in df.iterrows()
                    if row.get("name") and str(row["name"]) != "nan"}
    except Exception:
        pass
    return {}


def _resolve_name(sym: str, market: str, us_ref: dict, hk_cache: dict, cn_members: dict) -> str | None:
    """Return a resolved display name or None if unresolvable."""
    if market == "US":
        rec = us_ref.get(sym)
        if rec and rec.get("name"):
            return rec["name"]
        return None
    if market == "HK":
        rec = hk_cache.get(sym)
        if rec and rec.get("name"):
            return rec["name"]
        return None
    if market == "CN":
        return cn_members.get(sym)
    return None


def _resolve_mkt_label(sym: str, market: str, us_ref: dict) -> str:
    """Return the display market label for adoption row."""
    if market == "US":
        rec = us_ref.get(sym)
        if rec and rec.get("mkt"):
            return rec["mkt"]
        return "US"
    if market == "HK":
        return "HKEX"
    if market == "CN":
        if sym.endswith(".SS"):
            return "SSE"
        if sym.endswith(".SZ"):
            return "SZSE"
        return "CN"
    if market == "CA":
        return "TSX"
    if market == "crypto":
        return "Crypto"
    return "US"


def _color_for(sym: str) -> str:
    """Stable icon colour (same algorithm as build_universe.color_for)."""
    def _hsl_to_hex(h: float, s: float, l: float) -> str:
        def f(n):
            k = (n + h / 30) % 12
            a = s * min(l, 1 - l)
            return l - a * max(-1, min(k - 3, 9 - k, 1))
        return "#%02x%02x%02x" % tuple(round(255 * f(n)) for n in (0, 8, 4))
    h = sum((i + 1) * ord(c) for i, c in enumerate(sym)) % 360
    return _hsl_to_hex(h, 0.55, 0.60)


# ---------------------------------------------------------------- archive helpers
def _archive_unit(sym: str, ohlc_path: Path, siblings: list[Path], dest_dir: Path,
                  dry_run: bool) -> dict[str, str]:
    """Move base + siblings into dest_dir. Returns reversal record entry."""
    reversal: dict[str, str] = {}
    files = [ohlc_path] + siblings
    for f in files:
        if not f.exists():
            continue
        dst = dest_dir / f.name
        if not dry_run:
            shutil.move(str(f), str(dst))
        reversal[str(dst)] = str(f)
    return reversal


# ---------------------------------------------------------------- main logic
def main(argv: list[str]) -> None:
    # Parse CLI
    adopt = "--adopt" in argv
    dry_run = "--dry-run" in argv
    min_bars = 120
    limit: int | None = None
    market_filter = "ALL"

    if "--min-bars" in argv:
        idx = argv.index("--min-bars")
        min_bars = int(argv[idx + 1])
    if "--limit" in argv:
        idx = argv.index("--limit")
        limit = int(argv[idx + 1])
    if "--market" in argv:
        idx = argv.index("--market")
        market_filter = argv[idx + 1].upper()

    print(f"gc_orphans: adopt={adopt} dry_run={dry_run} min_bars={min_bars} "
          f"limit={limit} market={market_filter}")

    # Load guards
    manifest_syms = _load_manifest_symbols()
    flagship = _load_flagship()
    print(f"  guards: {len(manifest_syms)} manifest keys, {len(flagship)} flagship symbols")

    # Scan data directory for base OHLC files
    if not OUT.exists():
        print(f"  [gc] OUT dir not found: {OUT}")
        sys.exit(1)

    all_json = sorted(OUT.glob("*.json"))

    # Split into base files vs siblings vs manifest/guarded files
    base_files: list[Path] = []
    for f in all_json:
        name = f.name
        # Guard: manifest*.json files and _gc_manifest.json
        if any(pat in name for pat in _MANIFEST_PATTERNS):
            continue
        # Guard: sibling artifacts (not base OHLC)
        if any(name.endswith(sfx) for sfx in _SIBLING_SUFFIXES):
            continue
        base_files.append(f)

    # Counters by market
    markets_seen = ["US", "HK", "CN", "CA", "crypto", "other"]
    stats: dict[str, dict[str, int]] = {
        m: {"disk": 0, "orphans": 0, "guarded": 0, "archived": 0, "adopted": 0}
        for m in markets_seen
    }

    orphans: list[tuple[str, str, Path]] = []  # (sym, market, ohlc_path)

    for ohlc_path in base_files:
        # Derive symbol from filename (strip .json)
        sym = ohlc_path.stem  # e.g. "AAPL" from "AAPL.json"

        market = _classify_market(sym)
        mkt_key = market if market in stats else "other"
        stats[mkt_key]["disk"] += 1

        # Guard: manifest members (not orphans)
        if sym in manifest_syms:
            continue

        # Guard: flagship symbols
        if sym in flagship:
            stats[mkt_key]["guarded"] += 1
            continue

        # Guard: _-prefixed index files
        if sym.startswith("_"):
            stats[mkt_key]["guarded"] += 1
            continue

        # Apply --market filter
        if market_filter != "ALL" and market_filter != market.upper():
            continue

        stats[mkt_key]["orphans"] += 1
        orphans.append((sym, market, ohlc_path))

    total_orphans = sum(v["orphans"] for v in stats.values())
    print(f"  found {len(base_files)} base OHLC files; {total_orphans} orphans")

    if not orphans:
        print("  nothing to do.")
        _print_report(stats, None, dry_run)
        return

    # Apply --limit
    if limit is not None:
        orphans = orphans[:limit]
        print(f"  --limit {limit}: processing {len(orphans)} orphans")

    # Prepare archive directory (created even in dry-run for reporting clarity)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dest_dir = BACKUPS / f"orphans-{ts}"
    reversal_records: list[dict[str, Any]] = []  # list of per-symbol reversal entries

    # Load name resolution caches (only needed for --adopt)
    us_ref: dict = {}
    hk_cache: dict = {}
    cn_members: dict = {}
    if adopt:
        us_ref = _load_us_ref_cache()
        hk_cache = _load_hk_cache()
        cn_members = _load_cn_members()
        print(f"  name caches: US={len(us_ref)} HK={len(hk_cache)} CN={len(cn_members)}")

    # For --adopt: accumulate new manifest rows; write atomically at the end
    adoption_rows: dict[str, dict] = {}

    if not dry_run and orphans:
        dest_dir.mkdir(parents=True, exist_ok=True)

    for sym, market, ohlc_path in orphans:
        mkt_key = market if market in stats else "other"

        # Collect siblings
        siblings = [
            OUT / f"{sym}{sfx}"
            for sfx in _SIBLING_SUFFIXES
            if (OUT / f"{sym}{sfx}").exists()
        ]

        # Count bars
        n_bars = _count_good_bars(ohlc_path)

        adopted = False
        if adopt and n_bars >= min_bars:
            # Try to resolve name
            name = _resolve_name(sym, market, us_ref, hk_cache, cn_members)
            if name:
                mkt_label = _resolve_mkt_label(sym, market, us_ref)
                adoption_rows[sym] = {
                    "name": name,
                    "sec": "Equities" if market != "crypto" else "Crypto",
                    "col": _color_for(sym),
                    "mkt": mkt_label,
                }
                adopted = True
                stats[mkt_key]["adopted"] += 1
                if dry_run:
                    print(f"  [dry-run] would adopt {sym} ({market}) bars={n_bars} name={name!r}")

        if not adopted:
            # Archive the unit
            reversal = _archive_unit(sym, ohlc_path, siblings, dest_dir, dry_run)
            if reversal:
                reversal_records.append({
                    "sym": sym,
                    "market": market,
                    "bars": n_bars,
                    "files": reversal,
                })
            stats[mkt_key]["archived"] += 1
            if dry_run:
                sib_names = [s.name for s in siblings]
                print(f"  [dry-run] would archive {sym} ({market}) bars={n_bars} siblings={sib_names}")

    # Write _gc_manifest.json reversal record (real run only)
    if not dry_run and reversal_records:
        gc_manifest = {
            "ts": ts,
            "dest_dir": str(dest_dir),
            "dry_run": False,
            "records": reversal_records,
        }
        gc_path = dest_dir / "_gc_manifest.json"
        gc_path.write_text(json.dumps(gc_manifest, indent=2))
        print(f"  reversal record: {gc_path}")

    # Write adoption rows atomically (staging -> atomic rename)
    if adoption_rows and not dry_run:
        mf = _load_manifest_full()
        mf_syms: dict = mf.get("symbols", {})
        added = 0
        for sym, row in adoption_rows.items():
            if sym not in mf_syms:  # double-check: additive only
                mf_syms[sym] = row
                added += 1
        mf["symbols"] = mf_syms
        import tempfile
        tmp = Path(str(MANIFEST) + f".gc_adopt.{os.getpid()}")
        tmp.write_text(json.dumps(mf, separators=(",", ":")))
        os.replace(tmp, MANIFEST)
        print(f"  adopted {added} symbols into manifest (atomic write)")

    _print_report(stats, dest_dir if not dry_run and reversal_records else None, dry_run)


def _print_report(stats: dict, dest_dir: Path | None, dry_run: bool) -> None:
    print("\n--- gc_orphans report ---")
    print(f"{'market':<8}  {'disk':>6}  {'orphans':>8}  {'guarded':>8}  {'archived':>9}  {'adopted':>8}")
    total = {k: 0 for k in ("disk", "orphans", "guarded", "archived", "adopted")}
    for mkt, s in stats.items():
        if s["disk"] == 0 and s["orphans"] == 0:
            continue
        print(f"  {mkt:<6}  {s['disk']:>6}  {s['orphans']:>8}  {s['guarded']:>8}  "
              f"{s['archived']:>9}  {s['adopted']:>8}")
        for k in total:
            total[k] += s[k]
    print(f"  {'TOTAL':<6}  {total['disk']:>6}  {total['orphans']:>8}  {total['guarded']:>8}  "
          f"{total['archived']:>9}  {total['adopted']:>8}")
    if dest_dir:
        print(f"  archive dir: {dest_dir}")
    if dry_run:
        print("  (dry-run — no files moved, no manifest written)")
    print("--- end report ---")


if __name__ == "__main__":
    main(sys.argv[1:])
