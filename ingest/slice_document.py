"""Safe read/modify/write helpers for Terminal ``*.slice.json`` documents.

Slice files are shared envelopes. Individual producers own named top-level fields,
not the whole document, so a refresh must preserve every sibling it does not own.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Iterable


def merge_owned_fields(
    existing: object,
    replacements: dict,
    *,
    owned_fields: Iterable[str],
) -> dict:
    """Replace a producer's fields while preserving every other sibling value."""
    owned = set(owned_fields)
    merged = ({key: value for key, value in existing.items() if key not in owned}
              if isinstance(existing, dict) else {})
    merged.update(replacements)
    return merged


def write_slice_preserving_siblings(
    path: Path,
    replacements: dict,
    *,
    owned_fields: Iterable[str],
    indent: int | None = None,
) -> dict:
    """Atomically replace owned fields in *path* and return the written document.

    An unreadable/non-object prior file cannot supply trustworthy siblings, so the
    producer still publishes its owned replacement fields. A valid prior document is
    otherwise preserved value-for-value for every top-level key outside ``owned_fields``.
    """
    try:
        existing = json.loads(path.read_text()) if path.is_file() else {}
    except Exception:  # noqa: BLE001 - malformed prior slice cannot block its owner
        existing = {}
    payload = merge_owned_fields(existing, replacements, owned_fields=owned_fields)
    encoded = json.dumps(
        payload,
        indent=indent,
        separators=None if indent is not None else (",", ":"),
        ensure_ascii=False,
    )
    tmp = path.with_name(f".{path.name}.slice.{os.getpid()}.tmp")
    try:
        tmp.write_text(encoded)
        os.replace(tmp, path)
    finally:
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass
    return payload
