#!/usr/bin/env python3
"""
build_data_coverage.py — generate public/data/coverage.json listing which
per-symbol data files exist in public/data/.

Run after any ingest job that writes .fund.json / .intel.json / .opts.json
files, or on a cron schedule. The client consults coverage.json before the
first fetch so it never 404s on a symbol that simply isn't in the
deep-coverage universe.

Output shape:
  {
    "as_of": "2026-07-09T12:00:00Z",
    "intel": ["AAPL", "NVDA", ...],
    "fund":  ["AAPL", "NVDA", ...],
    "opts":  ["AAPL", ...],
    "ohlc":  ["AAPL", "BTC-USD", ...]    // .json (OHLC bars)
  }

Usage:
  python scripts/build_data_coverage.py [--data-dir terminal/public/data]
"""

import argparse
import datetime
import json
import os
import re
import sys
from pathlib import Path

SUFFIXES = {
    "intel": ".intel.json",
    "fund":  ".fund.json",
    "opts":  ".opts.json",
    "ohlc":  ".json",          # plain <SYM>.json = OHLC bars
}

# Files in public/data/ that are NOT symbol files (fixtures, manifests, …)
NON_SYMBOL_FILES = {
    "manifest.json",
    "coverage.json",
    "chain_heat_fixture.json",
    "ctx_fixture.json",
    "dte_fixture.json",
    "enrich_fixture.json",
    "flow_fixture.json",
    "gex_fixture.json",
    "gexstate_fixture.json",
    "matrix_fixture.json",
    "oiconf_fixture.json",
    "prophet_fixture.json",
    "prophet_marks_fixture.json",
    "screener_fixture.json",
    "tctx_fixture.json",
    "ticker_fixture.json",
    "tide_fixture.json",
    "vol_fixture.json",
    "seed.js",
}


def collect(data_dir: Path) -> dict:
    result: dict[str, list[str]] = {k: [] for k in SUFFIXES}

    if not data_dir.is_dir():
        print(f"[warn] data directory not found: {data_dir}", file=sys.stderr)
        return result

    for path in sorted(data_dir.iterdir()):
        name = path.name
        if name in NON_SYMBOL_FILES:
            continue

        for key, suffix in SUFFIXES.items():
            if key == "ohlc":
                # plain .json but not insider/slice/fund/intel/opts
                if (
                    name.endswith(".json")
                    and not name.endswith(".insider.json")
                    and not name.endswith(".slice.json")
                    and not name.endswith(".fund.json")
                    and not name.endswith(".intel.json")
                    and not name.endswith(".opts.json")
                ):
                    sym = name[:-5]
                    result["ohlc"].append(sym)
            else:
                if name.endswith(suffix):
                    sym = name[: -len(suffix)]
                    result[key].append(sym)

    return result


def main():
    parser = argparse.ArgumentParser(description="Build data/coverage.json")
    parser.add_argument(
        "--data-dir",
        default=os.path.join(
            os.path.dirname(__file__), "..", "terminal", "public", "data"
        ),
        help="Path to public/data directory (default: terminal/public/data relative to repo root)",
    )
    args = parser.parse_args()

    data_dir = Path(args.data_dir).resolve()
    coverage = collect(data_dir)
    coverage["as_of"] = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

    out_path = data_dir / "coverage.json"
    out_path.write_text(json.dumps(coverage, indent=2))
    print(
        f"[coverage] wrote {out_path} — "
        f"intel:{len(coverage['intel'])} fund:{len(coverage['fund'])} "
        f"opts:{len(coverage['opts'])} ohlc:{len(coverage['ohlc'])}"
    )


if __name__ == "__main__":
    main()
