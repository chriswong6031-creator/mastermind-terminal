"""Generate the authoritative HKEX universe cache from Tushare hk_basic.

Runs on the MAC (the Tushare token lives in the Macro Dashboard .env, deliberately
NOT on the VPS). Emits the exact shape expand_universe.hk_top() consumes:

    { "<NNNN>.HK": {"name": <English>, "mkt": "HKEX"}, ... }

so a full-universe cache can be rsync'd to /opt/terminal/ingest/hk_universe_cache.json
and the (modified) hk_top() treats it as the authoritative floor for the manifest.

hk_basic gives all ~2,751 listed HK names with English (enname) + Chinese (name)
labels + listing board + IPO date. We prefer English names for the manifest (enrich_zh
adds Chinese separately), and we MERGE OVER an existing cache so previously-curated
short names (e.g. "CK Hutchison" vs "CK Hutchison Holdings Ltd.") are preserved.

Usage:
    python ingest/gen_hk_universe.py                         # -> ingest/hk_universe_cache.json
    python ingest/gen_hk_universe.py --merge existing.json   # preserve existing curated names
    python ingest/gen_hk_universe.py --out /path/cache.json
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

MACRO = Path(os.environ.get("MACRO_REPO") or "/Users/chriswong/Documents/Cluade/Macro Dashboard")
DEFAULT_OUT = Path(__file__).resolve().parent / "hk_universe_cache.json"

# Corporate suffixes trimmed for display brevity (mirrors the curated-name style).
_SUFFIX_RE = re.compile(
    r",?\s+(Company\s+Limited|Co\.,?\s*Ltd\.?|Holdings?\s+Ltd\.?|Group\s+Ltd\.?|Limited|Ltd\.?|Inc\.?|Corp\.?)$",
    re.IGNORECASE,
)


def _token() -> str:
    t = (os.environ.get("TUSHARE_TOKEN") or "").strip()
    if not t:
        env = MACRO / ".env"
        if env.exists():
            for line in env.read_text().splitlines():
                if line.startswith("TUSHARE_TOKEN="):
                    t = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not t:
        sys.exit("no TUSHARE_TOKEN (env or Macro Dashboard/.env)")
    return t


def _clean(name: str, tk: str) -> str:
    """Light display cleanup: trim one trailing corporate suffix, collapse spaces."""
    s = (name or "").strip()
    if not s:
        return tk
    s2 = _SUFFIX_RE.sub("", s).strip()
    s = s2 or s  # never blank out
    return re.sub(r"\s+", " ", s)


def build() -> dict[str, dict]:
    import tushare as ts

    ts.set_token(_token())
    pro = ts.pro_api()
    hb = pro.hk_basic()
    if "list_status" in hb.columns:
        hb = hb[hb["list_status"] == "L"]
    out: dict[str, dict] = {}
    for _, row in hb.iterrows():
        raw = str(row.get("ts_code") or "")
        digits = "".join(ch for ch in raw if ch.isdigit())
        if not digits:
            continue
        tk = f"{int(digits):04d}.HK"
        en = str(row.get("enname") or "").strip()
        zh = str(row.get("name") or "").strip()
        name = _clean(en, tk) if en else (zh or tk)
        out[tk] = {"name": name, "mkt": "HKEX"}
    return out


def main(argv: list[str]) -> None:
    out_path = DEFAULT_OUT
    merge_path: Path | None = None
    if "--out" in argv:
        out_path = Path(argv[argv.index("--out") + 1])
    if "--merge" in argv:
        merge_path = Path(argv[argv.index("--merge") + 1])

    uni = build()
    print(f"[hk_basic] {len(uni)} listed HK names")

    if merge_path and merge_path.exists():
        try:
            existing = json.loads(merge_path.read_text())
            existing = {
                k: v for k, v in existing.items()
                if isinstance(v, dict) and v.get("name") and v.get("mkt")
            }
            # Existing curated names WIN (preserve short labels); new names fill the tail.
            merged = {**uni, **existing}
            new_only = len(set(uni) - set(existing))
            print(f"[merge] existing={len(existing)} preserved | +{new_only} new from hk_basic")
            uni = merged
        except Exception as e:
            print(f"[merge] skipped ({e})")

    out_path.write_text(json.dumps(uni, ensure_ascii=False, separators=(",", ":")))
    print(f"[write] {len(uni)} entries -> {out_path}")


if __name__ == "__main__":
    main(sys.argv[1:])
