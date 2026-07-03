"""Collect earnings-call transcripts for US/ADR symbols via defeatbeta-api.

MANDATORY pattern (BUILD-SPEC §2 D5):
  Download defeatbeta's full stock_earning_call_transcripts.parquet ONCE per run to a
  local cache dir, then filter LOCALLY — never issue per-symbol remote queries in a loop
  (429s observed after ~5-6 remote DuckDB queries).

Output per symbol × fiscal quarter:
  terminal/public/data/tx/<SYM>/<YYYYQn>.json.gz  — gzipped JSON per §1.3 schema
  Macro Dashboard/data/us_fund/_tx_index.json      — SYM → sorted [ids] for D-US emitter join

ID format: defeatbeta's fiscal year + quarter labels, e.g. "2026Q3"
Incremental: existing .gz files are skipped.

Venv: /tmp/dbeta-venv (defeatbeta-api 0.0.60 + duckdb 1.5.3)
      Falls back to creating ~/.mm-dbeta-venv if /tmp/dbeta-venv is absent.

Usage:
  /tmp/dbeta-venv/bin/python ingest/collect_transcripts.py --only ZS,AAPL,NVDA,NIO --quarters 4
  /tmp/dbeta-venv/bin/python ingest/collect_transcripts.py --limit 50 --quarters 8
  /tmp/dbeta-venv/bin/python ingest/collect_transcripts.py  # full backfill, 8 quarters

Flags:
  --only SYM[,SYM,...]  comma-separated symbols to process (overrides full universe)
  --quarters N          number of most-recent quarters per symbol (default 8)
  --limit N             cap the symbol universe (for testing)
"""
from __future__ import annotations

import argparse
import gzip
import json
import os
import re
import signal
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
CA_ROOT   = Path(__file__).resolve().parents[1]
MACRO_DIR = Path("/Users/chriswong/Documents/Cluade/Macro Dashboard")
DATA_DIR  = MACRO_DIR / "data"
TX_CACHE  = DATA_DIR / "transcripts"
US_FUND   = DATA_DIR / "us_fund"
TX_OUT    = CA_ROOT / "terminal" / "public" / "data" / "tx"
TX_INDEX  = US_FUND / "_tx_index.json"
MANIFEST  = CA_ROOT / "terminal" / "public" / "data" / "manifest.json"

PARQUET_URL   = "https://huggingface.co/datasets/defeatbeta/yahoo-finance-data/resolve/main/data/stock_earning_call_transcripts.parquet"
LOCAL_PARQUET = TX_CACHE / "stock_earning_call_transcripts.parquet"

# Minimum parquet size sanity check (2 GB download is expected ~2.1 GB)
MIN_PARQUET_BYTES = 1_000_000_000  # 1 GB — clearly incomplete if below this

# ---------------------------------------------------------------------------
# Ctrl-C safety
# ---------------------------------------------------------------------------
_stop = False

def _handle_sigint(sig, frame):
    global _stop
    print("\n[interrupt] finishing current symbol then exiting …", flush=True)
    _stop = True

signal.signal(signal.SIGINT, _handle_sigint)

# ---------------------------------------------------------------------------
# Venv bootstrap
# ---------------------------------------------------------------------------
DBETA_VENV = Path("/tmp/dbeta-venv")
FALLBACK_VENV = Path.home() / ".mm-dbeta-venv"

def _ensure_venv() -> Path:
    """Return path to a venv that has defeatbeta-api installed; create if needed."""
    for v in (DBETA_VENV, FALLBACK_VENV):
        py = v / "bin" / "python"
        if py.exists():
            try:
                subprocess.run([str(py), "-c", "import defeatbeta_api"], check=True,
                               capture_output=True)
                return v
            except subprocess.CalledProcessError:
                pass

    print(f"[bootstrap] creating venv at {FALLBACK_VENV} …", flush=True)
    subprocess.run([sys.executable, "-m", "venv", str(FALLBACK_VENV)], check=True)
    pip = FALLBACK_VENV / "bin" / "pip"
    subprocess.run([str(pip), "install", "defeatbeta-api", "duckdb"], check=True)
    return FALLBACK_VENV


def _is_running_in_dbeta_venv() -> bool:
    for v in (DBETA_VENV, FALLBACK_VENV):
        if sys.executable.startswith(str(v)):
            return True
    return False


# ---------------------------------------------------------------------------
# Download helper
# ---------------------------------------------------------------------------
def _need_download() -> bool:
    if not LOCAL_PARQUET.exists():
        return True
    if LOCAL_PARQUET.stat().st_size < MIN_PARQUET_BYTES:
        print(f"[warn] parquet too small ({LOCAL_PARQUET.stat().st_size} B) — re-downloading", flush=True)
        LOCAL_PARQUET.unlink()
        return True
    return False


def _download_parquet():
    TX_CACHE.mkdir(parents=True, exist_ok=True)
    tmp = LOCAL_PARQUET.with_suffix(".parquet.tmp")
    print(f"[download] {PARQUET_URL}", flush=True)
    print(f"  → {LOCAL_PARQUET} (~2.1 GB, may take 3–5 min)", flush=True)

    try:
        req = urllib.request.Request(
            PARQUET_URL,
            headers={"User-Agent": "Mozilla/5.0 collect_transcripts/1.0"}
        )
        with urllib.request.urlopen(req, timeout=600) as resp, open(tmp, "wb") as fout:
            total = int(resp.headers.get("Content-Length", 0))
            done  = 0
            chunk = 1 << 20  # 1 MB
            t0 = time.time()
            while True:
                buf = resp.read(chunk)
                if not buf:
                    break
                fout.write(buf)
                done += len(buf)
                if total:
                    pct = done / total * 100
                    mb  = done / 1e6
                    el  = time.time() - t0
                    eta = (total - done) / (done / el) if done else 0
                    print(f"\r  {pct:5.1f}%  {mb:6.0f} MB  ETA {eta:.0f}s   ", end="", flush=True)
        print()
    except Exception as exc:
        if tmp.exists():
            tmp.unlink()
        raise RuntimeError(f"download failed: {exc}") from exc

    tmp.rename(LOCAL_PARQUET)
    print(f"[download] done: {LOCAL_PARQUET.stat().st_size // 1_000_000} MB", flush=True)


# ---------------------------------------------------------------------------
# Universe
# ---------------------------------------------------------------------------
def _load_universe() -> list[str]:
    """All 'us' equity symbols from manifest, excluding .TO."""
    if not MANIFEST.exists():
        return []
    with open(MANIFEST) as f:
        mf = json.load(f)
    syms: list[str] = []
    rows = mf if isinstance(mf, list) else mf.get("symbols", [])
    for row in rows:
        mkt = row.get("mkt", "")
        sym = row.get("sym") or row.get("name", "")
        if not sym:
            continue
        if mkt in ("us", "crypto"):
            if not sym.endswith(".TO") and "-" not in sym:
                syms.append(sym)
        # include crypto excluded above; ADRs are mkt='us' from expand_universe
    return sorted(set(syms))


# ---------------------------------------------------------------------------
# Role inference from first-paragraph text
# ---------------------------------------------------------------------------
_ROLE_PATTERNS = [
    (r"(?i)\bchief executive\b",            "CEO"),
    (r"(?i)\bpresident and ceo\b",          "CEO"),
    (r"(?i)\bceo\b",                        "CEO"),
    (r"(?i)\bchief financial\b",            "CFO"),
    (r"(?i)\bcfo\b",                        "CFO"),
    (r"(?i)\bchief operating\b",            "COO"),
    (r"(?i)\bchief revenue\b",              "CRO"),
    (r"(?i)\bchief technology\b",           "CTO"),
    (r"(?i)\bchief product\b",              "CPO"),
    (r"(?i)\binvestor relations\b",         "IR"),
    (r"(?i)\bvice president.*investor\b",   "IR"),
    (r"(?i)\banalyst\b",                    "Analyst"),
    (r"(?i)\boperator\b",                   "Operator"),
    (r"(?i)\bmanaging director\b",          "Managing Director"),
]

def _infer_role(speaker: str, text: str) -> str:
    """Best-effort role from speaker name + first ~300 chars of paragraph."""
    # Speaker name takes precedence (most reliable)
    if re.search(r"(?i)^operator$", speaker.strip()):
        return "Operator"
    snippet = speaker + " " + text[:250]
    for pattern, role in _ROLE_PATTERNS:
        if re.search(pattern, snippet):
            return role
    return ""


# ---------------------------------------------------------------------------
# Main processing
# ---------------------------------------------------------------------------
def process_symbol(sym: str, parquet: str, quarters: int, duckdb_mod) -> tuple[int, list[str]]:
    """Fetch rows for sym from local parquet, write .json.gz files.

    Returns (n_written, ids_written).
    """
    con = duckdb_mod.connect(":memory:")
    try:
        rows = con.execute(f"""
            SELECT symbol, fiscal_year, fiscal_quarter, report_date, transcripts
            FROM read_parquet('{parquet}')
            WHERE symbol = '{sym}'
            ORDER BY fiscal_year DESC, fiscal_quarter DESC
            LIMIT {quarters}
        """).fetchall()
    finally:
        con.close()

    if not rows:
        return 0, []

    out_dir = TX_OUT / sym
    out_dir.mkdir(parents=True, exist_ok=True)

    written   = 0
    ids_out   = []

    for row in rows:
        _, fy, fq, report_date, segments_raw = row
        tx_id = f"{fy}Q{fq}"
        ids_out.append(tx_id)

        gz_path = out_dir / f"{tx_id}.json.gz"
        if gz_path.exists():
            continue  # incremental skip

        # Build segments list
        segs = []
        if segments_raw:
            for seg in segments_raw:
                # DuckDB struct → dict-like; attributes differ by version
                if hasattr(seg, "_asdict"):
                    d = seg._asdict()
                elif isinstance(seg, dict):
                    d = seg
                else:
                    # tuple: (paragraph_number, speaker, content)
                    try:
                        d = {"paragraph_number": seg[0], "speaker": seg[1], "content": seg[2]}
                    except Exception:
                        d = {}

                speaker = (d.get("speaker") or "").strip()
                text    = (d.get("content") or "").strip()
                if not text:
                    continue

                segs.append({
                    "speaker": speaker,
                    "role":    _infer_role(speaker, text) if speaker else "",
                    "text":    text,
                })

        payload = {
            "schema":   "mastermind.tx/v1",
            "ticker":   sym,
            "id":       tx_id,
            "period":   f"Q{fq} FY{fy}",
            "date":     str(report_date) if report_date else None,
            "title":    f"{sym} Earnings Call Q{fq} FY{fy}",
            "segments": segs,
        }

        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        with gzip.open(gz_path, "wb", compresslevel=6) as f:
            f.write(raw)
        written += 1

    return written, ids_out


def _update_tx_index(sym: str, ids: list[str]):
    """Merge ids into _tx_index.json for sym (additive, sorted)."""
    US_FUND.mkdir(parents=True, exist_ok=True)
    idx: dict = {}
    if TX_INDEX.exists():
        try:
            idx = json.loads(TX_INDEX.read_text())
        except Exception:
            idx = {}

    existing = set(idx.get(sym, []))
    existing.update(ids)
    idx[sym] = sorted(existing)

    TX_INDEX.write_text(json.dumps(idx, indent=2, sort_keys=True))


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="Collect earnings-call transcripts (defeatbeta-api)")
    ap.add_argument("--only",     default="",  help="comma-separated symbols (ZS,AAPL,…)")
    ap.add_argument("--quarters", type=int, default=8, help="most-recent quarters per symbol (default 8)")
    ap.add_argument("--limit",    type=int, default=0, help="cap symbol count (0 = no limit)")
    args = ap.parse_args()

    # Re-exec in the defeatbeta venv if not already there
    if not _is_running_in_dbeta_venv():
        venv = _ensure_venv()
        py   = str(venv / "bin" / "python")
        print(f"[re-exec] using {py}", flush=True)
        os.execv(py, [py] + sys.argv)
        # unreachable

    # Now import duckdb (available in the dbeta venv)
    import duckdb  # noqa: F811

    # Build universe
    if args.only:
        universe = [s.strip().upper() for s in args.only.split(",") if s.strip()]
    else:
        universe = _load_universe()
        if not universe:
            print("[warn] empty universe from manifest; use --only SYM,…", flush=True)
            sys.exit(1)

    if args.limit and args.limit < len(universe):
        universe = universe[:args.limit]

    print(f"[info] {len(universe)} symbols | {args.quarters} quarters each", flush=True)

    # Ensure parquet is available
    if _need_download():
        _download_parquet()
    else:
        sz_mb = LOCAL_PARQUET.stat().st_size // 1_000_000
        print(f"[info] using cached parquet: {LOCAL_PARQUET} ({sz_mb} MB)", flush=True)

    parquet_str = str(LOCAL_PARQUET)
    TX_OUT.mkdir(parents=True, exist_ok=True)

    total_written = 0
    total_skipped = 0
    missing_syms  = []

    for i, sym in enumerate(universe, 1):
        if _stop:
            break

        n_written, ids = process_symbol(sym, parquet_str, args.quarters, duckdb)

        if not ids:
            missing_syms.append(sym)
        else:
            if n_written > 0:
                _update_tx_index(sym, ids)
                total_written += n_written
            else:
                # All already existed — still update index
                _update_tx_index(sym, ids)
                total_skipped += len(ids)

        if i % 50 == 0 or i == len(universe):
            print(f"  [{i}/{len(universe)}] written={total_written} skipped={total_skipped} "
                  f"missing={len(missing_syms)}", flush=True)

    print(f"\n[done] written={total_written} skipped={total_skipped} "
          f"missing={len(missing_syms)}", flush=True)
    if missing_syms and len(missing_syms) <= 20:
        print(f"  missing syms: {missing_syms}", flush=True)


if __name__ == "__main__":
    main()
