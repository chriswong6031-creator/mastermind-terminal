#!/usr/bin/env python3
"""Pull the reference-composition payload out of the R0-D golden corpus.

Every claim rendered in `terminal/docs/refs/company_intelligence_v2/*.html` is
produced by this script from a NAMED `case_id` in
`research/company_intelligence/GOLDEN_CORPUS_MANIFEST.json` and the committed
`mastermind.tx/v1` bodies in
`tests/fixtures/company_intelligence/golden_corpus_documents.v1.json`.

Nothing here invents a ticker, a figure, or a quotation.  Each quoted claim is
located inside the real committed segment body, and its byte offsets and
sha256 are computed the same way `engine.earnings_narrative` computes a span
receipt.  The script FAILS if any quote is not found byte-for-byte, so a
composition can never drift away from the corpus it claims to render.

Usage (from a checkout that can see the Macro corpus worktree):

    python3 extract_payload.py --corpus <path-to-macro-worktree> --out payload.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

# --------------------------------------------------------------------------
# The composition set.  (state, case_id) is the contract with the reviewer:
# seven release-law states, each bound to one difficult corpus case.
# --------------------------------------------------------------------------

COMPOSITIONS: list[dict] = [
    {
        "slug": "01-populated",
        "state": "populated",
        "case_id": "CIE-GC-0113",
        "surface": "brief",
        "claims": [
            {"id": "stance", "seg": 1, "quote": "closed Q1 2024 with demand broadly in line with the plan we laid out ninety days ago"},
            {"id": "nii", "seg": 2, "quote": "Net interest income was $24.9 billion for the quarter"},
            {"id": "nim", "seg": 2, "quote": "the net interest margin was 2.0%"},
            {"id": "provision", "seg": 2, "quote": "Provision for credit losses was $1,123 million"},
            {"id": "cet1", "seg": 2, "quote": "our CET1 ratio ended the period at 12.7%"},
            {"id": "qa", "seg": 3, "quote": "how much of the 2.0% move is mix versus pricing"},
        ],
    },
    {
        "slug": "02-partial",
        "state": "partial",
        "case_id": "CIE-GC-0147",
        "surface": "brief",
        "claims": [],  # no document exists for this case at all
    },
    {
        "slug": "03-stale",
        "state": "stale",
        "case_id": "CIE-GC-0063",
        "surface": "brief",
        "claims": [
            {"id": "stance", "seg": 1, "quote": "closed Q2 2024 with demand broadly in line with the plan we laid out ninety days ago"},
            {"id": "revenue", "seg": 2, "quote": "Total revenue was $148.1 billion for the quarter"},
            {"id": "eps", "seg": 2, "quote": "non-GAAP diluted earnings per share were $8.51"},
            {"id": "margin", "seg": 2, "quote": "Operating margin finished at 31.1%"},
            {"id": "guidance", "seg": 2, "quote": "We are guiding next quarter to a range of $139.2 billion to $142.0 billion."},
        ],
    },
    {
        "slug": "04-corrected",
        "state": "corrected",
        "case_id": "CIE-GC-0018",
        "surface": "brief",
        "claims": [
            {"id": "stance", "seg": 1, "quote": "we exited the quarter with the cost base we committed to"},
            {"id": "revenue", "seg": 2, "quote": "Total revenue was $171.1 billion for the quarter"},
            {"id": "eps", "seg": 2, "quote": "non-GAAP diluted earnings per share were $11.46"},
            {"id": "guidance", "seg": 2, "quote": "We are guiding next quarter to a range of $157.4 billion to $163.7 billion."},
        ],
    },
    {
        "slug": "05-blocked",
        "state": "blocked",
        "case_id": "CIE-GC-0211",
        "surface": "event",
        "claims": [],  # quarantined: nothing may be published
    },
    {
        "slug": "06-empty",
        "state": "empty",
        "case_id": "CIE-GC-0187",
        "surface": "slides",
        "claims": [],  # the prior slide series does not carry forward
    },
    {
        "slug": "07-provider-down",
        "state": "provider_down",
        "case_id": "CIE-GC-0221",
        "surface": "search",
        "claims": [
            {"id": "hit", "seg": 2, "quote": "Net interest income was $19.4 billion for the quarter and the net interest margin was 2.5%"},
        ],
    },
]

# One extra case is referenced by the spec's state table but deliberately not
# given its own composition (see the spec, "Combinations deliberately not
# composed").  It is still extracted so the reviewer can see its real shape.
REFERENCED_ONLY = ["CIE-GC-0033"]


def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def locate(segments: list[dict], seg_index: int, quote: str) -> dict:
    """Return a byte-exact span receipt for `quote` inside `segments[seg_index]`."""
    segment = segments[seg_index]
    body = segment["text"].encode("utf-8")
    needle = quote.encode("utf-8")
    start = body.find(needle)
    if start < 0:
        raise SystemExit(
            f"quote not present in segment {seg_index}: {quote!r}\n  segment: {segment['text']!r}"
        )
    end = start + len(needle)
    return {
        "segment_index": seg_index,
        "paragraph": seg_index + 1,  # 1-based, human-facing
        "speaker": segment["speaker"],
        "role": segment["role"],
        "span_start_byte": start,
        "span_end_byte": end,
        "segment_sha256": sha(body),
        "text_sha256": sha(needle),
        "text": quote,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", required=True, help="path to the Macro worktree holding the R0-D corpus")
    ap.add_argument("--out", default=str(Path(__file__).with_name("payload.json")))
    args = ap.parse_args()

    root = Path(args.corpus)
    manifest_path = root / "research/company_intelligence/GOLDEN_CORPUS_MANIFEST.json"
    documents_path = root / "tests/fixtures/company_intelligence/golden_corpus_documents.v1.json"
    issuers_path = root / "tests/fixtures/company_intelligence/golden_corpus_issuers.v1.json"
    edgar_path = root / "tests/fixtures/company_intelligence/golden_corpus_edgar_identity.v1.json"

    manifest = json.loads(manifest_path.read_text())
    documents = json.loads(documents_path.read_text())["documents"]
    issuers = json.loads(issuers_path.read_text())["issuers"]
    edgar_pairs = json.loads(edgar_path.read_text())["pairs"]

    cases = {c["case_id"]: c for c in manifest["cases"]}
    docs_by_id = {d["document_id"]: d for d in documents}
    issuers_by_id = {i["issuer_id"]: i for i in issuers}
    edgar_by_case = {p["case_ref"]: p for p in edgar_pairs}

    out: dict = {
        "generated_from": {
            "manifest": "research/company_intelligence/GOLDEN_CORPUS_MANIFEST.json",
            "manifest_sha256": sha(manifest_path.read_bytes()),
            "documents_sha256": sha(documents_path.read_bytes()),
            "corpus_generated_utc": manifest["generated_utc"],
            "observation_time": manifest["observation_time"],
            "counts": manifest["counts"],
        },
        "provenance_note": manifest["note"],
        "compositions": [],
        "referenced_only": [],
    }

    for spec in COMPOSITIONS + [{"slug": None, "case_id": cid} for cid in REFERENCED_ONLY]:
        case = cases[spec["case_id"]]
        doc = docs_by_id.get(case["excerpt_document_id"]) if case["excerpt_document_id"] else None
        entry: dict = {
            "slug": spec.get("slug"),
            "state": spec.get("state"),
            "surface": spec.get("surface"),
            "case_id": case["case_id"],
            "case": case,
            "issuer": issuers_by_id.get(case["issuer_id"]),
            "edgar": edgar_by_case.get(case["case_id"]),
            "document": None,
            "claims": [],
            "committed_receipt_verified": None,
        }

        if doc:
            entry["document"] = {k: v for k, v in doc.items() if k != "body"}
            entry["document"]["title"] = doc["body"]["title"]
            entry["document"]["period"] = doc["body"]["period"]
            entry["document"]["date"] = doc["body"]["date"]
            entry["document"]["segment_count"] = len(doc["body"]["segments"])
            entry["segments"] = doc["body"]["segments"]

            # Replay the corpus's OWN committed receipt first.  If this ever
            # stops matching, the composition set is stale and must be rebuilt.
            r = case.get("receipt")
            if r:
                seg_bytes = doc["body"]["segments"][r["segment_index"]]["text"].encode("utf-8")
                span = seg_bytes[r["span_start_byte"]:r["span_end_byte"]]
                entry["committed_receipt_verified"] = (
                    sha(seg_bytes) == r["segment_sha256"] and sha(span) == r["text_sha256"]
                )
                entry["committed_receipt_text"] = span.decode("utf-8")
                if not entry["committed_receipt_verified"]:
                    raise SystemExit(f"committed receipt failed to replay for {case['case_id']}")

            for claim in spec.get("claims", []):
                receipt = locate(doc["body"]["segments"], claim["seg"], claim["quote"])
                receipt["claim_id"] = claim["id"]
                # Does this claim fall inside the corpus's own committed span?
                if r and r["segment_index"] == claim["seg"]:
                    receipt["inside_committed_span"] = (
                        receipt["span_start_byte"] >= r["span_start_byte"]
                        and receipt["span_end_byte"] <= r["span_end_byte"]
                    )
                else:
                    receipt["inside_committed_span"] = False
                entry["claims"].append(receipt)

        if spec.get("slug"):
            out["compositions"].append(entry)
        else:
            out["referenced_only"].append(entry)

    Path(args.out).write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    total = sum(len(c["claims"]) for c in out["compositions"])
    print(f"wrote {args.out}: {len(out['compositions'])} compositions, {total} byte-verified claim spans")
    for c in out["compositions"]:
        print(
            f"  {c['slug']:<17} {c['case_id']}  {c['case']['ticker']:<6} "
            f"{c['case']['difficulty_class']:<24} {c['case']['expected_v2_outcome']:<20} "
            f"claims={len(c['claims'])} committed_receipt={c['committed_receipt_verified']}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
