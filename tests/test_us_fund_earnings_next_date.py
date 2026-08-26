"""Regression coverage for the US fund emitter's next-earnings date contract."""

import datetime as dt

import pytest

from ingest import gen_fund_us


class FrozenUtcDateTime(dt.datetime):
    """Freeze the emitter's UTC observation day without using the wall clock."""

    @classmethod
    def now(cls, tz=None):
        return cls(2026, 8, 26, tzinfo=tz)


@pytest.mark.parametrize(
    ("calendar_dates", "expected_next_date"),
    [
        (["2026-08-25"], None),
        (["2026-08-25", "2026-10-01", "2026-09-15"], "2026-09-15"),
        (["2026-08-26"], "2026-08-26"),
        (["not-a-date", "2026-09-20"], "2026-09-20"),
    ],
    ids=("past-only", "past-plus-future", "today", "malformed-plus-future"),
)
def test_build_earnings_emits_only_the_earliest_known_non_past_calendar_date(
    monkeypatch,
    calendar_dates,
    expected_next_date,
):
    """A blind first-item calendar selection must never escape as ``next_date``."""

    monkeypatch.setattr(gen_fund_us.dt, "datetime", FrozenUtcDateTime)

    earnings = gen_fund_us.build_earnings(
        {"calendar": {"Earnings Date": calendar_dates}},
        fy_end_m=12,
        tx_ids=None,
    )

    assert earnings["next_date"] == expected_next_date
