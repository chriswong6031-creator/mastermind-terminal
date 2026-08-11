#!/usr/bin/env python3
"""Audit the complete Hong Kong statement cache and ``mastermind.fund/v1`` corpus.

The default mode is strictly read-only.  It validates source-period provenance,
statement-family and cadence metadata, aligned arrays, structural nulls, representative
edge cases, and exact JSON bytes.  It prints one JSON receipt and exits non-zero when a
contract check fails.

``--normalize-cache-json`` is a separate, explicitly mutating maintenance mode.  It only
rewrites cache files whose sole JSON defect is a non-finite numeric token (NaN/Infinity),
converting those values to null through an atomic same-directory replace.  Duplicate keys,
malformed JSON, symlinks, and concurrently changing files fail closed.  Never use that mode
while collectors are running.

Release example::

    python3 scripts/audit_hk_statement_corpus.py \
      --expected-count 2798 --expected-gaps 35 \
      --expected-family-count industrial=2592 \
      --expected-family-count financial_services=103 \
      --expected-family-count bank=48 \
      --expected-family-count insurer=20
"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import hashlib
import json
import math
import os
import re
import stat
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CACHE_DIR = Path(
    os.environ.get(
        "HK_CACHE_DIR",
        "/Users/chriswong/Documents/Cluade/Macro Dashboard/data/hk_fund",
    )
)
DEFAULT_ARTIFACT_DIR = Path(
    os.environ.get("HK_ARTIFACT_DIR", str(REPO_ROOT / "terminal" / "public" / "data"))
)
DEFAULT_UNIVERSE_FILE = Path(
    os.environ.get("HK_UNIVERSE_FILE", str(REPO_ROOT / "ingest" / "hk_universe_cache.json"))
)

FAMILY_BY_PREFIX = {
    "001": "bank",
    "002": "insurer",
    "003": "financial_services",
    "004": "industrial",
}
FAMILIES = set(FAMILY_BY_PREFIX.values()) | {"ambiguous", "other"}
INDUSTRIAL_DEBT_COMPONENTS = (
    "004011006",  # current lease liabilities
    "004011010",  # short-term borrowings
    "004011021",  # current bonds / convertibles
    "004020001",  # long-term borrowings
    "004020005",  # non-current lease liabilities
    "004020007",  # non-current bonds / convertibles
    "004020018",  # other non-current interest-bearing debt
)
PERIOD_KINDS = {"quarter", "half_year", "full_year", "year_to_date"}
NORMALIZATION_METHODS = {
    "as_reported",
    "as_reported_ytd",
    "difference_from_prior_ytd",
    "unavailable_missing_base",
}
INCOME_FIELDS = {
    "revenue",
    "cogs",
    "gross_profit",
    "opex",
    "op_income",
    "nonop_income",
    "pretax_income",
    "taxes",
    "net_income",
    "eps_basic",
    "eps_diluted",
    "ebitda",
}
BALANCE_FIELDS = {
    "assets",
    "assets_st",
    "assets_lt",
    "liabilities",
    "liab_st",
    "liab_lt",
    "equity",
    "debt",
    "cash",
    "net_debt",
}
CASHFLOW_FIELDS = {"cfo", "cfi", "cff", "capex", "fcf"}
CORE_INCOME_FIELDS = {
    "revenue",
    "opex",
    "op_income",
    "pretax_income",
    "taxes",
    "net_income",
    "eps_basic",
}
REPRESENTATIVES = {
    "0700.HK",
    "0001.HK",
    "0005.HK",
    "1299.HK",
    "0388.HK",
    "8428.HK",
    "1973.HK",
    "0030.HK",
    "0990.HK",
    "2720.HK",
}


class NonFiniteJson(ValueError):
    """A JSON document contains NaN or Infinity."""


class DuplicateJsonKey(ValueError):
    """A JSON object contains a duplicate key."""


class UnsafeNormalization(ValueError):
    """A cache file cannot be normalized without risking unrelated data."""


@dataclass(frozen=True)
class FileSignature:
    inode: int
    size: int
    mtime_ns: int


class Problems:
    def __init__(self) -> None:
        self.counts: collections.Counter[str] = collections.Counter()
        self.samples: dict[str, list[str]] = collections.defaultdict(list)

    def add(self, code: str, message: str) -> None:
        self.counts[code] += 1
        if len(self.samples[code]) < 5:
            self.samples[code].append(message)

    def check(self, condition: bool, code: str, message: str) -> None:
        if not condition:
            self.add(code, message)

    @property
    def ok(self) -> bool:
        return not self.counts


def _reject_nonfinite(token: str) -> None:
    raise NonFiniteJson(f"non-finite JSON token {token}")


def _reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise DuplicateJsonKey(f"duplicate JSON key {key!r}")
        result[key] = value
    return result


def strict_json_loads(raw: bytes) -> Any:
    return json.loads(
        raw.decode("utf-8"),
        parse_constant=_reject_nonfinite,
        object_pairs_hook=_reject_duplicate_keys,
    )


def permissive_nonfinite_json_loads(raw: bytes) -> Any:
    """Allow non-finite constants, but continue rejecting duplicate keys."""
    return json.loads(raw.decode("utf-8"), object_pairs_hook=_reject_duplicate_keys)


def json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, bool)):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_safe(item) for item in value]
    raise UnsafeNormalization(f"unsupported JSON value {type(value).__name__}")


def strict_json_bytes(value: Any) -> bytes:
    return json.dumps(
        json_safe(value),
        ensure_ascii=False,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def _signature(path: Path) -> FileSignature:
    current = path.stat()
    return FileSignature(current.st_ino, current.st_size, current.st_mtime_ns)


def normalize_cache_json_file(path: Path) -> tuple[bool, bytes]:
    """Atomically replace non-finite JSON values with null; reject every broader repair."""
    if path.is_symlink():
        raise UnsafeNormalization("refusing to rewrite a symlink")
    before = path.stat()
    signature = FileSignature(before.st_ino, before.st_size, before.st_mtime_ns)
    raw = path.read_bytes()
    if len(raw) != before.st_size or _signature(path) != signature:
        raise UnsafeNormalization("file changed while it was read")
    try:
        strict_json_loads(raw)
        return False, raw
    except NonFiniteJson:
        parsed = permissive_nonfinite_json_loads(raw)
    normalized = strict_json_bytes(parsed)
    strict_json_loads(normalized)
    if _signature(path) != signature:
        raise UnsafeNormalization("file changed before atomic replacement")

    temp_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            dir=path.parent,
            prefix=f".{path.name}.audit-",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temp_name = handle.name
            handle.write(normalized)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temp_name, stat.S_IMODE(before.st_mode))
        # This mode is documented as post-collector only.  The second signature check narrows the
        # remaining replace race and prevents overwriting any change observed during normalization.
        if _signature(path) != signature:
            raise UnsafeNormalization("file changed immediately before atomic replacement")
        os.replace(temp_name, path)
        temp_name = None
    finally:
        if temp_name:
            try:
                Path(temp_name).unlink()
            except FileNotFoundError:
                pass
    return True, normalized


def _iso_date(value: Any) -> dt.date | None:
    try:
        return dt.date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def _valid_fiscal_year_end(value: Any) -> bool:
    try:
        parts = str(value).split("-")
        dt.date(2000, int(parts[-2]), int(parts[-1]))
        return True
    except (TypeError, ValueError, IndexError):
        return False


def _finite_number_or_none(value: Any) -> bool:
    return value is None or (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def _close(left: Any, right: Any) -> bool:
    return (
        left is not None
        and right is not None
        and math.isclose(left, right, rel_tol=1e-10, abs_tol=1e-6)
    )


def _row_family(income: dict[str, Any], balance: dict[str, Any]) -> str:
    families: set[str] = set()
    for namespace in (income or {}, balance or {}):
        for code in namespace:
            family = FAMILY_BY_PREFIX.get(str(code)[:3])
            if family:
                families.add(family)
        if families:
            break
    if len(families) == 1:
        return next(iter(families))
    return "ambiguous" if families else "other"


def source_statement_currency(record: dict[str, Any]) -> str | None:
    yf = record.get("yf")
    value = yf.get("financial_currency") if isinstance(yf, dict) else None
    return value if isinstance(value, str) and value.strip() else None


def validate_statement_currency(
    artifact: dict[str, Any],
    expected: str | None,
    symbol: str,
    problems: Problems,
) -> str | None:
    """Validate nullable source currency without inventing HKD for an unknown value."""
    value = artifact.get("stmt_currency")
    valid_shape = value is None or (isinstance(value, str) and bool(value.strip()))
    problems.check(valid_shape, "stmt_currency_shape", f"{symbol}: {value!r}")
    problems.check(
        value == expected,
        "stmt_currency_provenance",
        f"{symbol}: artifact={value!r} source={expected!r}",
    )
    return value if valid_shape else None


def expected_industrial_debt(balance_items: dict[str, Any]) -> float | None:
    present = [
        float(balance_items[code])
        for code in INDUSTRIAL_DEBT_COMPONENTS
        if balance_items.get(code) is not None
        and _finite_number_or_none(balance_items.get(code))
    ]
    return sum(present) if present else None


def _manifest_digest(rows: Iterable[tuple[str, bytes]]) -> str:
    digest = hashlib.sha256()
    for name, raw in sorted(rows):
        leaf = hashlib.sha256(raw).hexdigest()
        digest.update(f"{name}\t{len(raw)}\t{leaf}\n".encode("utf-8"))
    return digest.hexdigest()


def _expected_cadence(kinds: list[Any]) -> str:
    unique = set(kinds)
    if unique and unique <= {"quarter"}:
        return "quarterly"
    if unique and unique <= {"half_year"}:
        return "semiannual"
    if unique and unique <= {"full_year"}:
        return "annual"
    return "mixed"


def completed_cycle_facts(income_rows: list[dict[str, Any]]) -> collections.Counter[str]:
    """Describe source cycles closed by a DATE_TYPE_CODE=001 annual boundary.

    A cycle starts immediately after the preceding annual row and closes on the next annual row.
    This is independent of calendar month and therefore remains valid for March/June/September
    fiscal year ends.  An unfinished newest cycle is intentionally excluded.
    """
    facts: collections.Counter[str] = collections.Counter()
    current: list[str] = []
    for row in sorted(income_rows, key=lambda item: str(item.get("end") or "")):
        date_type = str(row.get("date_type") or "")
        if date_type not in {"001", "002", "003", "004"}:
            continue
        current.append(date_type)
        if date_type != "001":
            continue
        facts["completed"] += 1
        if len(current) == 1:
            facts["annual_only"] += 1
        else:
            facts["with_interim"] += 1
            facts[f"with_interim_rows_{len(current)}"] += 1
            if current == ["002", "001"]:
                facts["exact_h1_fy"] += 1
        current = []
    return facts


def legacy_month_labels_have_duplicate(period_ends: Iterable[str]) -> bool:
    """Reproduce the retired month-to-quarter labeler on the old 12-row window."""
    labels: list[str] = []
    for end in sorted(set(period_ends))[-12:]:
        quarter = {"03": 1, "06": 2, "09": 3, "12": 4}.get(end[5:7])
        labels.append(f"Q{quarter} {end[:4]}" if quarter else end[:4])
    return len(labels) != len(set(labels))


def _aligned_list(
    statement: dict[str, Any], key: str, size: int, problems: Problems, receipt: str
) -> list[Any]:
    value = statement.get(key)
    if not isinstance(value, list) or len(value) != size:
        problems.add("array_alignment", f"{receipt}/{key}: expected {size}")
        return [None] * size
    return value


def _series(
    statement: dict[str, Any],
    block: str,
    field: str,
    size: int,
    problems: Problems,
    receipt: str,
) -> list[Any]:
    values = statement.get(block)
    if not isinstance(values, dict):
        problems.add("statement_block", f"{receipt}/{block}")
        return [None] * size
    result = values.get(field)
    if not isinstance(result, list) or len(result) != size:
        problems.add("array_alignment", f"{receipt}/{block}.{field}: expected {size}")
        return [None] * size
    if not all(_finite_number_or_none(value) for value in result):
        problems.add("statement_number", f"{receipt}/{block}.{field}")
    return result


def _validate_statement_set(
    symbol: str,
    set_name: str,
    statement: Any,
    fact: dict[str, Any],
    problems: Problems,
    contract_counts: collections.Counter[str],
) -> dict[str, Any] | None:
    if statement is None:
        return None
    receipt = f"{symbol}/{set_name}"
    if not isinstance(statement, dict):
        problems.add("statement_set_shape", receipt)
        return None
    periods = statement.get("periods")
    if not isinstance(periods, list) or not periods:
        problems.add("statement_periods", receipt)
        return None
    size = len(periods)
    problems.check(size <= (6 if set_name == "annual" else 12), "period_window", receipt)
    period_start = _aligned_list(statement, "period_start", size, problems, receipt)
    source_start = _aligned_list(statement, "source_period_start", size, problems, receipt)
    ends = _aligned_list(statement, "period_end", size, problems, receipt)
    years = _aligned_list(statement, "fiscal_year", size, problems, receipt)
    kinds = _aligned_list(statement, "period_kind", size, problems, receipt)
    numbers = _aligned_list(statement, "period_number", size, problems, receipt)
    source_labels = _aligned_list(statement, "source_period_label", size, problems, receipt)
    cumulative = _aligned_list(statement, "is_cumulative", size, problems, receipt)
    methods = _aligned_list(statement, "normalization_method", size, problems, receipt)
    families = _aligned_list(statement, "source_family_by_period", size, problems, receipt)
    income = {
        field: _series(statement, "income", field, size, problems, receipt)
        for field in INCOME_FIELDS
    }
    balance = {
        field: _series(statement, "balance", field, size, problems, receipt)
        for field in BALANCE_FIELDS
    }
    cashflow = {
        field: _series(statement, "cashflow", field, size, problems, receipt)
        for field in CASHFLOW_FIELDS
    }

    problems.check(
        all(isinstance(period, str) and period for period in periods),
        "period_label_shape",
        receipt,
    )
    problems.check(len(periods) == len(set(periods)), "duplicate_period_label", receipt)
    problems.check(
        all(isinstance(end, str) for end in ends)
        and ends == sorted(ends)
        and len(ends) == len(set(ends)),
        "period_end_order",
        receipt,
    )
    problems.check(set(kinds) <= PERIOD_KINDS, "period_kind_enum", receipt)
    problems.check(
        set(methods) <= NORMALIZATION_METHODS, "normalization_method_enum", receipt
    )
    problems.check(set(families) <= FAMILIES, "source_family_enum", receipt)
    cadence = statement.get("reporting_cadence")
    problems.check(cadence == _expected_cadence(kinds), "cadence_derived", receipt)
    expected_basis = (
        "as_reported"
        if set_name == "annual"
        else "discrete_period"
        if set(kinds) <= {"quarter", "half_year"}
        else "mixed_period"
    )
    problems.check(statement.get("flow_basis") == expected_basis, "flow_basis", receipt)
    problems.check(statement.get("source_market") == "hk", "source_market", receipt)
    expected_family = next(
        (family for family in reversed(families) if family != "other"), fact["dominant"]
    )
    problems.check(
        statement.get("source_family") == expected_family, "source_family_scalar", receipt
    )
    if cadence == "semiannual":
        problems.check(set(kinds) <= {"half_year"}, "semiannual_kind", receipt)
        problems.check(
            not any(re.search(r"\bQ[1-4]\b", period) for period in periods),
            "semiannual_q_fiction",
            receipt,
        )

    identities: dict[tuple[Any, Any, Any], list[int]] = collections.defaultdict(list)
    for index in range(size):
        end = ends[index]
        year = str(years[index])
        kind = kinds[index]
        number = numbers[index]
        family = families[index]
        identities[(year, kind, number)].append(index)
        source = fact["merged"].get(end)
        problems.check(source is not None, "source_end_missing", f"{receipt}/{end}")
        if source:
            problems.check(family == source["family"], "family_provenance", f"{receipt}/{end}")
            problems.check(
                source_start[index] == source["start"],
                "source_start_provenance",
                f"{receipt}/{end}",
            )
            slot = {"001": "FY", "002": "H1", "003": "Q1", "004": "9M"}.get(
                str(source["date_type"] or "")
            )
            problems.check(
                source_labels[index] == f"{slot} {year}",
                "source_label_provenance",
                f"{receipt}/{end}",
            )
        label = periods[index]
        if kind == "quarter":
            valid_label = number in {1, 2, 3, 4} and label.startswith(f"Q{number} {year}")
        elif kind == "half_year":
            valid_label = number in {1, 2} and label.startswith(f"H{number} {year}")
        elif kind == "year_to_date":
            valid_label = number is None and label.startswith(f"9M {year}")
        elif kind == "full_year":
            valid_label = number is None and (
                label.startswith(year) if set_name == "annual" else label.startswith(f"FY {year}")
            )
        else:
            valid_label = False
        problems.check(valid_label, "period_identity", f"{receipt}/{label}")
        problems.check(
            isinstance(cumulative[index], bool)
            and cumulative[index] == (set_name != "annual"),
            "cumulative_semantics",
            f"{receipt}/{end}",
        )
        method = methods[index]
        if method == "difference_from_prior_ytd":
            problems.check(_iso_date(period_start[index]) is not None, "derived_start", f"{receipt}/{end}")
            problems.check(
                (kind == "quarter" and number in {2, 3, 4})
                or (kind == "half_year" and number == 2),
                "derived_kind",
                f"{receipt}/{end}",
            )
            problems.check(
                income["eps_basic"][index] is None
                and income["eps_diluted"][index] is None,
                "derived_eps_nonnull",
                f"{receipt}/{end}",
            )
        elif method in {"as_reported", "as_reported_ytd"}:
            problems.check(
                period_start[index] == source_start[index],
                "as_reported_start",
                f"{receipt}/{end}",
            )
        elif method == "unavailable_missing_base":
            problems.check(period_start[index] is None, "missing_base_start", f"{receipt}/{end}")

        if family in {"bank", "insurer", "financial_services"}:
            for field in ("cogs", "gross_profit", "ebitda"):
                problems.check(
                    income[field][index] is None,
                    "structural_null",
                    f"{receipt}/{end}/{family}/{field}",
                )
        if family == "ambiguous":
            contract_counts["ambiguous_emitted_periods"] += 1
            for block_name, block in (("income", income), ("balance", balance)):
                for field, values in block.items():
                    problems.check(
                        values[index] is None,
                        "ambiguous_family_value",
                        f"{receipt}/{end}/{block_name}.{field}",
                    )
        if family in {"bank", "insurer", "ambiguous"}:
            problems.check(
                cashflow["fcf"][index] is None,
                "structural_null",
                f"{receipt}/{end}/{family}/fcf",
            )
        structural_balance = {
            "bank": ("assets_st", "assets_lt", "liab_st", "liab_lt", "debt", "net_debt"),
            "insurer": ("assets_st", "assets_lt", "liab_st", "liab_lt"),
            "financial_services": ("debt", "net_debt"),
        }.get(family, ())
        for field in structural_balance:
            problems.check(
                balance[field][index] is None,
                "structural_null",
                f"{receipt}/{end}/{family}/{field}",
            )
        capex = cashflow["capex"][index]
        problems.check(capex is None or capex <= 0, "capex_sign", f"{receipt}/{end}")
        if family not in {"bank", "insurer", "ambiguous"}:
            expected_fcf = (
                cashflow["cfo"][index] + capex
                if cashflow["cfo"][index] is not None and capex is not None
                else None
            )
            fcf_matches = (
                cashflow["fcf"][index] is None
                if expected_fcf is None
                else _close(cashflow["fcf"][index], expected_fcf)
            )
            problems.check(fcf_matches, "fcf_bridge", f"{receipt}/{end}")
        expected_cogs = (
            income["revenue"][index] - income["gross_profit"][index]
            if income["revenue"][index] is not None
            and income["gross_profit"][index] is not None
            else None
        )
        cogs_matches = (
            income["cogs"][index] is None
            if expected_cogs is None
            else _close(income["cogs"][index], expected_cogs)
        )
        problems.check(cogs_matches, "gross_bridge", f"{receipt}/{end}")
        expected_net_debt = (
            balance["debt"][index] - balance["cash"][index]
            if balance["debt"][index] is not None and balance["cash"][index] is not None
            else None
        )
        net_debt_matches = (
            balance["net_debt"][index] is None
            if expected_net_debt is None
            else _close(balance["net_debt"][index], expected_net_debt)
        )
        problems.check(net_debt_matches, "net_debt_bridge", f"{receipt}/{end}")
        if family == "industrial" and source:
            contract_counts["industrial_debt_emitted_periods"] += 1
            source_balance = source.get("bal") or {}
            expected_debt = expected_industrial_debt(source_balance)
            populated_components = sum(
                source_balance.get(code) is not None for code in INDUSTRIAL_DEBT_COMPONENTS
            )
            if expected_debt is not None:
                contract_counts["industrial_debt_populated_periods"] += 1
            if populated_components > 1:
                contract_counts["industrial_debt_multi_component_periods"] += 1
            debt_matches = (
                balance["debt"][index] is None
                if expected_debt is None
                else _close(balance["debt"][index], expected_debt)
            )
            problems.check(debt_matches, "industrial_debt_mapping", f"{receipt}/{end}")

    for identity, indexes in identities.items():
        if len(indexes) > 1:
            for index in indexes:
                problems.check(
                    ends[index] in periods[index],
                    "duplicate_identity_receipt",
                    f"{receipt}/{identity}/{periods[index]}",
                )
    return statement


def _read_for_audit(
    path: Path,
    problems: Problems,
    snapshots: dict[Path, FileSignature],
) -> tuple[Any, bytes]:
    before = _signature(path)
    raw = path.read_bytes()
    after = _signature(path)
    snapshots[path] = after
    if before != after or len(raw) != after.size:
        problems.add("concurrent_mutation", str(path))
    try:
        return strict_json_loads(raw), raw
    except (UnicodeDecodeError, json.JSONDecodeError, NonFiniteJson, DuplicateJsonKey) as exc:
        problems.add("strict_json", f"{path.name}: {exc}")
        try:
            return permissive_nonfinite_json_loads(raw), raw
        except (UnicodeDecodeError, json.JSONDecodeError, DuplicateJsonKey):
            return None, raw


def _parse_expected_family_counts(values: list[str]) -> dict[str, int]:
    result: dict[str, int] = {}
    for value in values:
        try:
            family, count = value.split("=", 1)
            parsed = int(count)
        except (ValueError, TypeError) as exc:
            raise argparse.ArgumentTypeError(
                f"expected FAMILY=COUNT, received {value!r}"
            ) from exc
        if family not in (set(FAMILY_BY_PREFIX.values()) | {"ambiguous"}) or parsed < 0:
            raise argparse.ArgumentTypeError(f"invalid family count {value!r}")
        result[family] = parsed
    return result


def _validate_representatives(
    artifacts: dict[str, dict[str, Any]], problems: Problems
) -> None:
    def statement(symbol: str, key: str) -> dict[str, Any]:
        return ((artifacts.get(symbol) or {}).get("statements") or {}).get(key) or {}

    def index_of(value: dict[str, Any], label: str) -> int | None:
        try:
            return value["periods"].index(label)
        except (KeyError, ValueError, AttributeError):
            return None

    for symbol in REPRESENTATIVES:
        problems.check(symbol in artifacts, "representative", f"{symbol}: artifact missing")
    tencent = statement("0700.HK", "quarterly")
    problems.check(
        tencent.get("reporting_cadence") == "quarterly",
        "representative",
        "0700.HK: not quarterly",
    )
    for label in ("Q1 2025", "Q2 2025", "Q3 2025", "Q4 2025"):
        index = index_of(tencent, label)
        problems.check(index is not None, "representative", f"0700.HK: {label} missing")
        if index is not None:
            income = tencent.get("income") or {}
            revenue = income.get("revenue") or []
            basic = income.get("eps_basic") or []
            diluted = income.get("eps_diluted") or []
            problems.check(index < len(revenue) and revenue[index] is not None, "representative", f"0700.HK: {label} revenue null")
            if label != "Q1 2025":
                problems.check(
                    index < len(basic)
                    and index < len(diluted)
                    and basic[index] is None
                    and diluted[index] is None,
                    "representative",
                    f"0700.HK: {label} derived EPS nonnull",
                )
    for symbol, labels in {
        "0001.HK": ("H1 2025", "H2 2025"),
        "8428.HK": ("H1 2026", "H2 2026"),
    }.items():
        periodic = statement(symbol, "quarterly")
        problems.check(
            periodic.get("reporting_cadence") == "semiannual",
            "representative",
            f"{symbol}: not semiannual",
        )
        for label in labels:
            problems.check(
                index_of(periodic, label) is not None,
                "representative",
                f"{symbol}: {label} missing",
            )
    for symbol, family in {
        "0005.HK": "bank",
        "1299.HK": "insurer",
        "0388.HK": "financial_services",
    }.items():
        periodic = statement(symbol, "quarterly") or statement(symbol, "annual")
        problems.check(
            periodic.get("source_family") == family,
            "representative",
            f"{symbol}: family={periodic.get('source_family')}",
        )
        income = periodic.get("income") or {}
        problems.check(
            any(value is not None for value in income.get("revenue") or []),
            "representative",
            f"{symbol}: revenue all null",
        )
        problems.check(
            any(value is not None for value in income.get("opex") or []),
            "representative",
            f"{symbol}: opex all null",
        )
    transition = statement("1973.HK", "quarterly")
    q1 = index_of(transition, "Q1 2025")
    h1 = index_of(transition, "H1 2025")
    problems.check(
        q1 is not None and h1 is not None,
        "representative",
        "1973.HK: Q1/H1 2025 missing",
    )
    if q1 is not None and h1 is not None:
        families = transition.get("source_family_by_period") or []
        methods = transition.get("normalization_method") or []
        problems.check(
            q1 < len(families)
            and h1 < len(families)
            and families[q1] == "industrial"
            and families[h1] == "financial_services",
            "representative",
            "1973.HK: family transition lost",
        )
        problems.check(
            h1 < len(methods) and methods[h1] == "as_reported_ytd",
            "representative",
            "1973.HK: cross-family H1 was differenced",
        )
    duplicate_h1 = statement("0030.HK", "quarterly")
    for label in ("H1 2024 · 2023-09-30", "H1 2024 · 2024-06-30"):
        problems.check(
            index_of(duplicate_h1, label) is not None,
            "representative",
            f"0030.HK: {label} missing",
        )
    decreasing_capex = statement("0990.HK", "quarterly")
    index = index_of(decreasing_capex, "H2 2025")
    problems.check(index is not None, "representative", "0990.HK: H2 2025 missing")
    if index is not None:
        cashflow = decreasing_capex.get("cashflow") or {}
        capex = cashflow.get("capex") or []
        fcf = cashflow.get("fcf") or []
        problems.check(
            index < len(capex)
            and index < len(fcf)
            and capex[index] is None
            and fcf[index] is None,
            "representative",
            "0990.HK: decreasing capex fabricated",
        )
    duplicate_annual = statement("2720.HK", "annual")
    for label in ("2022 · 2022-06-30", "2022 · 2022-12-31"):
        problems.check(
            index_of(duplicate_annual, label) is not None,
            "representative",
            f"2720.HK: {label} missing",
        )


def run_normalization(args: argparse.Namespace) -> int:
    problems = Problems()
    paths = sorted(args.cache_dir.glob("*.HK.json"))
    selected = {item.strip() for item in (args.only or "").split(",") if item.strip()}
    selected = {item if item.endswith(".HK") else f"{item}.HK" for item in selected}
    if selected:
        available = {path.name[:-5] for path in paths}
        for missing in sorted(selected - available):
            problems.add("normalization_target_missing", missing)
        paths = [path for path in paths if path.name[:-5] in selected]
    if args.expected_count is not None and not selected:
        problems.check(
            len(paths) == args.expected_count,
            "cache_count",
            f"{len(paths)} != {args.expected_count}",
        )
    normalized: list[str] = []
    unchanged = 0
    manifest_rows: list[tuple[str, bytes]] = []
    for path in paths:
        try:
            changed, raw = normalize_cache_json_file(path)
            if changed:
                normalized.append(path.name)
            else:
                unchanged += 1
            manifest_rows.append((path.name, raw))
        except (
            OSError,
            UnicodeDecodeError,
            json.JSONDecodeError,
            DuplicateJsonKey,
            UnsafeNormalization,
        ) as exc:
            problems.add("normalization_failed", f"{path.name}: {exc}")
    receipt = {
        "mode": "normalize_cache_json",
        "ok": problems.ok,
        "cache_dir": str(args.cache_dir),
        "files_scanned": len(paths),
        "files_normalized": len(normalized),
        "normalized": normalized,
        "files_unchanged": unchanged,
        "cache_manifest_sha256": _manifest_digest(manifest_rows),
        "errors": dict(problems.counts),
        "error_samples": dict(problems.samples),
    }
    print(json.dumps(receipt, ensure_ascii=False, sort_keys=True, indent=2 if args.pretty else None, separators=None if args.pretty else (",", ":")))
    return 0 if problems.ok else 1


def run_audit(args: argparse.Namespace) -> int:
    problems = Problems()
    snapshots: dict[Path, FileSignature] = {}
    cache_manifest: list[tuple[str, bytes]] = []
    artifact_manifest: list[tuple[str, bytes]] = []
    universe, _ = _read_for_audit(args.universe_file, problems, snapshots)
    universe_symbols = set(universe or {}) if isinstance(universe, dict) else set()
    problems.check(isinstance(universe, dict), "universe_shape", str(args.universe_file))
    cache_paths = sorted(args.cache_dir.glob("*.HK.json"))
    artifact_paths = sorted(args.artifact_dir.glob("*.HK.fund.json"))
    cache_symbols = {path.name[:-5] for path in cache_paths}
    artifact_symbols = {path.name[:-10] for path in artifact_paths}
    if args.expected_count is not None:
        problems.check(
            len(cache_paths) == args.expected_count,
            "cache_count",
            f"{len(cache_paths)} != {args.expected_count}",
        )
        problems.check(
            len(artifact_paths) == args.expected_count,
            "artifact_count",
            f"{len(artifact_paths)} != {args.expected_count}",
        )
    problems.check(
        cache_symbols == universe_symbols,
        "cache_universe_set",
        f"missing={len(universe_symbols - cache_symbols)} extra={len(cache_symbols - universe_symbols)}",
    )
    problems.check(
        artifact_symbols == cache_symbols,
        "artifact_cache_set",
        f"missing={len(cache_symbols - artifact_symbols)} extra={len(artifact_symbols - cache_symbols)}",
    )

    endpoint_status = {
        kind: collections.Counter() for kind in ("income", "balance", "cashflow")
    }
    source_family_counts: collections.Counter[str] = collections.Counter()
    source_cycle_facts: collections.Counter[str] = collections.Counter()
    facts: dict[str, dict[str, Any]] = {}
    source_gaps = 0
    latest_non_december = 0
    ever_non_december = 0
    legacy_duplicate_label_issuers = 0
    for path in cache_paths:
        symbol = path.name[:-5]
        record, raw = _read_for_audit(path, problems, snapshots)
        cache_manifest.append((path.name, raw))
        if not isinstance(record, dict):
            continue
        problems.check(record.get("ticker") == symbol, "cache_ticker", symbol)
        financials = record.get("financials")
        problems.check(isinstance(financials, dict), "cache_financials", symbol)
        financials = financials if isinstance(financials, dict) else {}
        endpoint_rows: dict[str, list[dict[str, Any]]] = {}
        for kind in ("income", "balance", "cashflow"):
            rows = financials.get(kind)
            if not isinstance(rows, list) or not rows:
                endpoint_status[kind]["empty"] += 1
                endpoint_rows[kind] = []
                continue
            endpoint_rows[kind] = rows
            defects: collections.Counter[str] = collections.Counter()
            ends: list[str] = []
            for row in rows:
                if not isinstance(row, dict):
                    defects["row_object"] += 1
                    continue
                ends.append(str(row.get("end") or ""))
                if _iso_date(row.get("end")) is None:
                    defects["end"] += 1
                # Balance sheets are point-in-time snapshots; the vendor leaves START_DATE empty.
                if kind != "balance" and _iso_date(row.get("start")) is None:
                    defects["start"] += 1
                if str(row.get("date_type") or "") not in {"001", "002", "003", "004"}:
                    defects["date_type"] += 1
                if not _valid_fiscal_year_end(row.get("fiscal_year_end")):
                    defects["fiscal_year_end"] += 1
                items = row.get("items")
                names = row.get("item_names")
                if not isinstance(items, dict) or not items:
                    defects["items"] += 1
                    items = {}
                if not isinstance(names, dict) or not names:
                    defects["item_names"] += 1
                    names = {}
                if set(items) != set(names):
                    defects["item_name_coverage"] += 1
                width = 6 if kind == "cashflow" else 9
                if any(not re.fullmatch(rf"\d{{{width}}}", str(code)) for code in items):
                    defects["item_code"] += 1
                if any(not _finite_number_or_none(value) for value in items.values()):
                    defects["item_value"] += 1
                if any(
                    not isinstance(value, str) or not value.strip() for value in names.values()
                ):
                    defects["item_name_value"] += 1
            if ends != sorted(ends) or len(ends) != len(set(ends)):
                defects["end_order_or_duplicate"] += 1
            if defects:
                endpoint_status[kind]["stale_or_invalid"] += 1
                problems.add(
                    "source_endpoint_freshness", f"{symbol}/{kind}: {dict(defects)}"
                )
            else:
                endpoint_status[kind]["fresh"] += 1
        empty = {kind for kind, rows in endpoint_rows.items() if not rows}
        if empty and len(empty) != 3:
            problems.add("partial_empty_endpoint", f"{symbol}: {sorted(empty)}")
        has_income = bool(endpoint_rows["income"])
        if not has_income:
            source_gaps += 1
        else:
            source_cycle_facts.update(completed_cycle_facts(endpoint_rows["income"]))
            annual_rows = [
                row
                for row in endpoint_rows["income"]
                if str(row.get("date_type") or "") == "001" and row.get("end")
            ]
            if annual_rows:
                annual_rows.sort(key=lambda row: str(row["end"]))
                if str(annual_rows[-1]["end"])[5:10] != "12-31":
                    latest_non_december += 1
                if any(str(row["end"])[5:10] != "12-31" for row in annual_rows):
                    ever_non_december += 1
        merged: dict[str, dict[str, Any]] = {}
        namespace = {"income": "inc", "balance": "bal", "cashflow": "cf"}
        for kind in ("income", "balance", "cashflow"):
            for row in endpoint_rows[kind]:
                if not isinstance(row, dict) or not row.get("end"):
                    continue
                end = str(row["end"])[:10]
                target = merged.setdefault(
                    end,
                    {
                        "inc": {},
                        "bal": {},
                        "cf": {},
                        "start": None,
                        "date_type": None,
                    },
                )
                target[namespace[kind]] = row.get("items") or {}
                if target["date_type"] is None or kind == "income":
                    target["date_type"] = row.get("date_type")
                if target["start"] is None or (kind == "income" and row.get("start")):
                    target["start"] = row.get("start")
        weighted: collections.Counter[str] = collections.Counter()
        for target in merged.values():
            family = _row_family(target["inc"], target["bal"])
            target["raw_family"] = family
            if family in FAMILY_BY_PREFIX.values():
                weighted[family] += len(target["inc"]) or len(target["bal"]) or 1
        dominant = weighted.most_common(1)[0][0] if weighted else "other"
        for target in merged.values():
            target["family"] = (
                target["raw_family"] if target["raw_family"] != "other" else dominant
            )
        if legacy_month_labels_have_duplicate(merged):
            legacy_duplicate_label_issuers += 1
        latest_family = "other"
        for row in reversed(endpoint_rows["income"]):
            latest_family = _row_family(row.get("items") or {}, {})
            if latest_family != "other":
                break
        if has_income:
            source_family_counts[latest_family] += 1
            problems.check(
                latest_family != "other", "unknown_source_family", symbol
            )
        facts[symbol] = {
            "has_income": has_income,
            "merged": merged,
            "dominant": dominant,
            "stmt_currency": source_statement_currency(record),
        }

    if args.expected_gaps is not None:
        problems.check(
            source_gaps == args.expected_gaps,
            "source_gap_count",
            f"{source_gaps} != {args.expected_gaps}",
        )
        for kind, status in endpoint_status.items():
            problems.check(
                status["empty"] == args.expected_gaps,
                "empty_endpoint_count",
                f"{kind}: {dict(status)}",
            )
    for kind, status in endpoint_status.items():
        problems.check(
            status["stale_or_invalid"] == 0,
            "stale_endpoint_count",
            f"{kind}: {dict(status)}",
        )
    if args.expected_family_counts:
        problems.check(
            dict(source_family_counts) == args.expected_family_counts,
            "source_family_baseline",
            f"{dict(source_family_counts)} != {args.expected_family_counts}",
        )

    artifact_family_counts: collections.Counter[str] = collections.Counter()
    cadence_counts: collections.Counter[str] = collections.Counter()
    contract_counts: collections.Counter[str] = collections.Counter()
    statement_currency_counts: collections.Counter[str] = collections.Counter()
    source_covered_fully_null = 0
    representative_artifacts: dict[str, dict[str, Any]] = {}
    for path in artifact_paths:
        symbol = path.name[:-10]
        fund, raw = _read_for_audit(path, problems, snapshots)
        artifact_manifest.append((path.name, raw))
        if not isinstance(fund, dict):
            continue
        fact = facts.get(symbol)
        if fact is None:
            problems.add("orphan_artifact", symbol)
            continue
        problems.check(fund.get("schema") == "mastermind.fund/v1", "schema", symbol)
        problems.check(fund.get("ticker") == symbol, "artifact_ticker", symbol)
        problems.check(fund.get("asof") == args.expected_asof, "artifact_asof", symbol)
        statement_currency = validate_statement_currency(
            fund, fact["stmt_currency"], symbol, problems
        )
        statement_currency_counts[statement_currency or "unknown"] += 1
        problems.check(
            (fund.get("src") or {}).get("statements") == "akshare",
            "statement_source",
            symbol,
        )
        statements = fund.get("statements") or {}
        annual = _validate_statement_set(
            symbol,
            "annual",
            statements.get("annual"),
            fact,
            problems,
            contract_counts,
        )
        periodic = _validate_statement_set(
            symbol,
            "quarterly",
            statements.get("quarterly"),
            fact,
            problems,
            contract_counts,
        )
        primary = periodic or annual
        if primary:
            artifact_family_counts[primary.get("source_family")] += 1
            cadence_counts[primary.get("reporting_cadence")] += 1
        core_values: list[Any] = []
        for statement in (annual, periodic):
            if statement:
                income = statement.get("income") or {}
                for field in CORE_INCOME_FIELDS:
                    values = income.get(field)
                    if isinstance(values, list):
                        core_values.extend(values)
        if fact["has_income"] and not any(value is not None for value in core_values):
            source_covered_fully_null += 1
        if not fact["has_income"] and any(value is not None for value in core_values):
            problems.add("source_gap_fabrication", symbol)
        ratios = fund.get("ratios") or {}
        ratio_periods = ratios.get("periods") or []
        problems.check(
            ratio_periods == ((annual or {}).get("periods") or []),
            "ratio_periods",
            symbol,
        )
        for field in ("pe", "ps", "pb", "pcf", "ev", "ev_ebitda"):
            values = ratios.get(field)
            problems.check(
                isinstance(values, list) and len(values) == len(ratio_periods),
                "ratio_alignment",
                f"{symbol}/{field}",
            )
        estimates = fund.get("estimates")
        if estimates is not None:
            for block in ("eps_fy", "rev_fy", "eps_q"):
                values = estimates.get(block) or {}
                size = len(values.get("periods") or [])
                for field in ("avg", "high", "low", "n"):
                    series = values.get(field)
                    problems.check(
                        isinstance(series, list) and len(series) == size,
                        "estimate_alignment",
                        f"{symbol}/{block}/{field}",
                    )
        if symbol in REPRESENTATIVES:
            representative_artifacts[symbol] = fund

    problems.check(
        dict(artifact_family_counts) == dict(source_family_counts),
        "artifact_source_family_counts",
        f"{dict(artifact_family_counts)} != {dict(source_family_counts)}",
    )
    problems.check(
        source_covered_fully_null == 0,
        "source_covered_fully_null",
        str(source_covered_fully_null),
    )
    _validate_representatives(representative_artifacts, problems)
    for path, expected in snapshots.items():
        try:
            if _signature(path) != expected:
                problems.add("concurrent_mutation", str(path))
        except FileNotFoundError:
            problems.add("concurrent_mutation", f"{path} disappeared")

    cache_digest = _manifest_digest(cache_manifest)
    artifact_digest = _manifest_digest(artifact_manifest)
    combined_digest = hashlib.sha256(
        f"hk-cache/v1\n{cache_digest}\nhk-artifact/v1\n{artifact_digest}\n".encode()
    ).hexdigest()
    row_buckets = {
        str(size): count
        for key, count in sorted(source_cycle_facts.items())
        if key.startswith("with_interim_rows_")
        for size in [int(key.rsplit("_", 1)[1])]
    }
    common_row_count = sum(row_buckets.get(str(size), 0) for size in (2, 3, 4))
    receipt = {
        "mode": "audit",
        "ok": problems.ok,
        "cache_dir": str(args.cache_dir),
        "artifact_dir": str(args.artifact_dir),
        "cache_count": len(cache_paths),
        "artifact_count": len(artifact_paths),
        "source_gaps": source_gaps,
        "source_covered_fully_null": source_covered_fully_null,
        "source_family_counts": dict(source_family_counts),
        "artifact_family_counts": dict(artifact_family_counts),
        "cadence_counts": dict(cadence_counts),
        "statement_currency_counts": dict(statement_currency_counts),
        "stmt_currency_unknown": statement_currency_counts["unknown"],
        "contract_counts": dict(contract_counts),
        "completed_fiscal_cycles": {
            "total": source_cycle_facts["completed"],
            "annual_only": source_cycle_facts["annual_only"],
            "with_interim": source_cycle_facts["with_interim"],
            "with_interim_row_count": row_buckets,
            "with_interim_other_row_count": (
                source_cycle_facts["with_interim"] - common_row_count
            ),
            "exact_h1_fy": source_cycle_facts["exact_h1_fy"],
        },
        "fiscal_year_end": {
            "latest_non_december_issuers": latest_non_december,
            "ever_non_december_issuers": ever_non_december,
        },
        "legacy_month_label_duplicate_issuers": legacy_duplicate_label_issuers,
        "endpoint_status": {kind: dict(status) for kind, status in endpoint_status.items()},
        "cache_manifest_sha256": cache_digest,
        "artifact_manifest_sha256": artifact_digest,
        "combined_manifest_sha256": combined_digest,
        "errors": dict(problems.counts),
        "error_samples": dict(problems.samples),
    }
    print(json.dumps(receipt, ensure_ascii=False, sort_keys=True, indent=2 if args.pretty else None, separators=None if args.pretty else (",", ":")))
    return 0 if problems.ok else 1


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE_DIR)
    parser.add_argument("--artifact-dir", type=Path, default=DEFAULT_ARTIFACT_DIR)
    parser.add_argument("--universe-file", type=Path, default=DEFAULT_UNIVERSE_FILE)
    parser.add_argument(
        "--expected-count",
        type=int,
        default=int(os.environ["HK_EXPECTED_COUNT"]) if os.environ.get("HK_EXPECTED_COUNT") else None,
        help="optional exact cache and artifact count",
    )
    parser.add_argument(
        "--expected-gaps",
        type=int,
        default=int(os.environ["HK_EXPECTED_GAPS"]) if os.environ.get("HK_EXPECTED_GAPS") else None,
        help="optional exact all-three-endpoint source-gap count",
    )
    parser.add_argument(
        "--expected-family-count",
        action="append",
        default=[],
        metavar="FAMILY=COUNT",
        help="optional repeatable source-family baseline",
    )
    parser.add_argument(
        "--expected-asof",
        default=os.environ.get("HK_EXPECTED_ASOF", dt.date.today().isoformat()),
        help="required artifact asof date (default: today)",
    )
    parser.add_argument(
        "--normalize-cache-json",
        action="store_true",
        help="separate mutating mode: atomically replace cache NaN/Infinity with null",
    )
    parser.add_argument(
        "--only",
        help="normalization mode only: comma-separated symbols such as 0778.HK,0823.HK",
    )
    parser.add_argument("--pretty", action="store_true", help="pretty-print the JSON receipt")
    args = parser.parse_args(argv)
    try:
        args.expected_family_counts = _parse_expected_family_counts(
            args.expected_family_count
        )
    except argparse.ArgumentTypeError as exc:
        parser.error(str(exc))
    if args.only and not args.normalize_cache_json:
        parser.error("--only is valid only with --normalize-cache-json")
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.normalize_cache_json:
        return run_normalization(args)
    return run_audit(args)


if __name__ == "__main__":
    raise SystemExit(main())
