"""Artifact freshness conformance — consumes the dashboard's exported manifest (audit #9).

Extends the intel-bridge freshness gate (#18) from a single hard-coded 5-day rule to the
PER-ARTIFACT, TRADING-CALENDAR cadence the dashboard now publishes in
``site/factordata/contracts/artifact_manifest.json``. For each handoff artifact the bot /
Terminal consume (stock JSONs, us/china standouts, regime timelines) the manifest declares
an ``expected_max_age_td`` in TRADING days; this module:

  * reads each artifact's ``as_of`` (or the last date of a regime timeline's ``dates``),
  * counts TRADING days (weekdays; a light US-holiday set) between as_of and today,
  * flags STALE when that exceeds the artifact's cadence → the consumer ABSTAINS on that
    input rather than silently sizing on stale bytes,
  * fails-CLOSED on genuine staleness WITHOUT halting on benign weekend/holiday lag
    (weekends/holidays are not trading days, so a Monday read of a Friday file is fresh).

FALLBACK (never silently pass): if the manifest is absent, ``check_all`` returns
``ok=None`` with a loud warning — a missing contract must not be read as "all fresh".

Usage (startup / refresh):
    from ingest.artifact_conformance import check_all
    report = check_all(macro_root)      # abstain on any report['stale']
"""
from __future__ import annotations

import json
import logging
from datetime import date, timedelta
from pathlib import Path

log = logging.getLogger(__name__)

# The manifest lives in the macro repo's exported contracts dir.
MANIFEST_REL = Path("site") / "factordata" / "contracts" / "artifact_manifest.json"

# A minimal fixed US market-holiday set (2024-2027) so a holiday isn't counted as a stale
# trading day. Deliberately small + explicit (no heavy dependency); extend as needed. The
# CN/HK artifacts carry a wider cadence in the manifest to absorb their extra holidays.
_US_HOLIDAYS = frozenset({
    "2024-01-01", "2024-01-15", "2024-02-19", "2024-03-29", "2024-05-27", "2024-06-19",
    "2024-07-04", "2024-09-02", "2024-11-28", "2024-12-25",
    "2025-01-01", "2025-01-20", "2025-02-17", "2025-04-18", "2025-05-26", "2025-06-19",
    "2025-07-04", "2025-09-01", "2025-11-27", "2025-12-25",
    "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19",
    "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
    "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18",
    "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
})


def _is_trading_day(d: date) -> bool:
    return d.weekday() < 5 and d.isoformat() not in _US_HOLIDAYS


def trading_days_between(src: date, today: date) -> int:
    """Count TRADING days strictly after ``src`` up to and including ``today``.

    A file dated Friday read on the following Monday → 1 trading day (Monday), so a
    2-trading-day cadence is still fresh. A weekend/holiday adds 0. Genuine multi-session
    staleness accumulates."""
    if today <= src:
        return 0
    n, cur = 0, src + timedelta(days=1)
    while cur <= today:
        if _is_trading_day(cur):
            n += 1
        cur += timedelta(days=1)
    return n


def _artifact_asof(path: Path, spec: dict) -> str | None:
    """Extract the as_of from an artifact. Regime timelines carry it as the last entry of
    the ``dates`` array; everything else in an ``as_of``/``asof`` field."""
    if not path.exists():
        return None
    try:
        d = json.loads(path.read_text())
    except Exception as e:  # noqa: BLE001
        log.error("artifact unreadable %s: %s", path, e)
        return None
    field = spec.get("as_of_field")
    if field:
        v = d.get(field)
        return str(v)[:10] if v else None
    # regime timeline: last date of the dates array
    dates = d.get("dates")
    if isinstance(dates, list) and dates:
        return str(dates[-1])[:10]
    return None


def load_manifest(macro_root: Path) -> dict | None:
    p = macro_root / MANIFEST_REL
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except Exception as e:  # noqa: BLE001
        log.error("manifest unreadable %s: %s", p, e)
        return None


def check_artifact(macro_root: Path, spec: dict, today: date | None = None) -> dict:
    """Freshness verdict for one artifact. ``stale`` True ⇒ consumer must abstain."""
    today = today or date.today()
    rel = spec["artifact"]
    max_td = int(spec.get("expected_max_age_td", 2))

    # per-stock templates (<SYM>.json) are checked at the directory level: sample presence
    # only — individual symbol freshness is the bridge's job. Report present/absent.
    if "<SYM>" in rel:
        d = (macro_root / rel).parent
        return {"artifact": rel, "kind": spec.get("kind"), "stale": None,
                "reason": "per_symbol_template", "dir_exists": d.exists()}

    path = macro_root / rel
    asof = _artifact_asof(path, spec)
    if asof is None:
        # a missing/unreadable file is treated as STALE (fail-closed): the consumer abstains
        return {"artifact": rel, "kind": spec.get("kind"), "stale": True,
                "reason": "missing_or_no_asof", "asof": None,
                "expected_max_age_td": max_td, "consumers": spec.get("consumers", [])}
    try:
        src = date.fromisoformat(asof)
    except (ValueError, TypeError):
        return {"artifact": rel, "kind": spec.get("kind"), "stale": True,
                "reason": "bad_asof", "asof": asof, "expected_max_age_td": max_td}
    age = trading_days_between(src, today)
    stale = age > max_td
    return {"artifact": rel, "kind": spec.get("kind"), "stale": stale,
            "asof": asof, "age_td": age, "expected_max_age_td": max_td,
            "reason": ("stale" if stale else "fresh"),
            "consumers": spec.get("consumers", [])}


def check_all(macro_root: Path | str, today: date | None = None) -> dict:
    """Run the freshness check over every artifact in the manifest.

    ``ok`` is True only if NO consumable artifact is stale; None if the manifest is absent
    (never a silent True). Stale artifacts are listed so the caller can abstain per-consumer.
    """
    macro_root = Path(macro_root)
    manifest = load_manifest(macro_root)
    if not manifest:
        log.warning("artifact manifest absent under %s — conformance SKIPPED, NOT passed",
                    macro_root / MANIFEST_REL)
        return {"ok": None, "reason": "no_manifest", "results": []}
    today = today or date.today()
    results = [check_artifact(macro_root, s, today) for s in manifest.get("artifacts", [])]
    stale = [r for r in results if r.get("stale") is True]
    return {
        "ok": len(stale) == 0,
        "cadence_basis": manifest.get("cadence_basis"),
        "n_artifacts": len(results),
        "n_stale": len(stale),
        "stale_artifacts": [r["artifact"] for r in stale],
        "results": results,
    }


def _fmt(report: dict) -> str:
    if report.get("ok") is None:
        return f"artifact conformance: SKIPPED ({report.get('reason')})"
    lines = [f"artifact conformance: {'OK' if report['ok'] else 'STALE'} "
             f"({report['n_stale']}/{report['n_artifacts']} stale, "
             f"basis={report.get('cadence_basis')})"]
    for r in report["results"]:
        if r.get("stale") is True:
            lines.append(f"  STALE  {r['artifact']} (asof={r.get('asof')}, "
                         f"age={r.get('age_td')}td > {r.get('expected_max_age_td')}td) "
                         f"→ abstain: {r.get('consumers')}")
    return "\n".join(lines)


def main() -> None:
    import os
    import sys
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    root = Path(os.environ.get(
        "MACRO_REPO",
        Path(__file__).resolve().parents[2] / "Macro Dashboard"))
    report = check_all(root)
    print(_fmt(report))
    # non-zero exit on genuine staleness so a refresh script can gate on it
    sys.exit(0 if report.get("ok") in (True, None) else 2)


if __name__ == "__main__":
    main()
