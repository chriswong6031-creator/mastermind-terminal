"""Pure-function + fake-transport tests for scripts/supabase_apply.py.

No network. Fixtures reproduce the 0013 (ruler-style) and 0014 (indented-style)
`-- readback:` / `-- down:` house conventions inline, since those files are not
on master yet.
"""
from __future__ import annotations

import glob
import json
from pathlib import Path

import pytest

from scripts.supabase_apply import (
    ApiError,
    CurlRunner,
    ExpectedObject,
    LEGACY_VERSIONS,
    MigrationError,
    apply_mode,
    build_receipt,
    expected_objects,
    extract_block,
    has_transaction_wrapper,
    idempotency_findings,
    load_dotenv_values,
    migration_version,
    missing_after,
    readback_statements,
    run_apply,
    run_dry,
    split_statements,
    strip_sql_comments,
)


FIXTURE_0013 = """
create table if not exists public.alert_runs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);
create unique index if not exists alert_runs_id_key on public.alert_runs (id);
do $$ begin
  create policy alert_runs_read on public.alert_runs for select using (true);
exception when duplicate_object then null;
end $$;

-- down:
-- drop table if exists public.alert_runs;

-- readback:
-- ----------------------------------------------------------------
-- select c.relname from pg_class c where c.relname = 'alert_runs';
-- select c.relname from pg_class c where c.relname = 'alert_runs_id_key';
-- select polname from pg_policy where polname = 'alert_runs_read';
"""

FIXTURE_0014 = """
begin;
create table if not exists public.tenants (
  id bigint generated always as identity primary key
);
create index if not exists tenants_id_idx on public.tenants (id);
create or replace function public.tenants_touch() returns trigger as $$
begin
  return new;
end;
$$ language plpgsql;
drop trigger if exists tenants_touch_trg on public.tenants;
create trigger tenants_touch_trg before update on public.tenants
  for each row execute function public.tenants_touch();
drop policy if exists tenants_read on public.tenants;
create policy tenants_read on public.tenants for select using (true);
commit;

-- down:
-- drop table if exists public.tenants cascade;

-- readback:
--   select c.relname, c.relrowsecurity
--   -- expected: one row, relrowsecurity = true
--   from pg_class c where c.relname = 'tenants';
"""

FIXTURE_NO_READBACK = """
create table if not exists public.foo (id int);
-- down:
-- drop table if exists public.foo;
"""

FIXTURE_NOT_IDEMPOTENT = """
create table public.bar (id int);
-- down:
-- drop table if exists public.bar;
-- readback:
-- select 1;
"""

FIXTURE_BARE_POLICY = """
create table if not exists public.baz (id int);
create policy baz_read on public.baz for select using (true);
-- down:
-- drop table if exists public.baz;
-- readback:
-- select 1;
"""

FIXTURE_TRIGGER_NO_DROP = """
create table if not exists public.qux (id int);
create trigger qux_trg before update on public.qux
  for each row execute function public.noop();
-- down:
-- drop table if exists public.qux;
-- readback:
-- select 1;
"""


class FakeApi:
    def __init__(self, responses=None, fail_on=None):
        self.calls: list[str] = []
        self.responses = responses or {}
        self.fail_on = fail_on or set()

    def __call__(self, sql: str):
        self.calls.append(sql)
        idx = len(self.calls)
        if idx in self.fail_on:
            raise ApiError(500, "boom")
        return self.responses.get(idx, [])


def test_strip_comments_removes_line_and_block_comments():
    sql = "select 1; -- a comment\nselect /* block */ 2;"
    out = strip_sql_comments(sql)
    assert "comment" not in out
    assert "block" not in out
    assert "select 1;" in out
    assert "select" in out and "2;" in out


def test_strip_comments_keeps_a_double_dash_inside_a_string_literal():
    sql = "select 'a -- not a comment';"
    out = strip_sql_comments(sql)
    assert "-- not a comment" in out


def test_strip_comments_keeps_a_dollar_quoted_body_intact():
    sql = "create function f() returns void as $$ begin -- keep me\n end $$ language plpgsql;"
    out = strip_sql_comments(sql)
    assert "-- keep me" in out


def test_split_statements_ignores_semicolons_inside_dollar_quotes():
    sql = "create function f() returns void as $$ select 1; select 2; $$ language plpgsql; select 3;"
    stmts = split_statements(sql)
    assert len(stmts) == 2
    assert "select 1; select 2;" in stmts[0]


def test_split_statements_ignores_semicolons_inside_string_literals():
    sql = "insert into t values ('a;b'); select 1;"
    stmts = split_statements(sql)
    assert len(stmts) == 2
    assert "'a;b'" in stmts[0]


def test_split_statements_keeps_a_do_block_as_one_statement():
    stmts = split_statements(FIXTURE_0013)
    do_stmts = [s for s in stmts if s.strip().lower().startswith("do")]
    assert len(do_stmts) == 1
    assert "exception when duplicate_object" in do_stmts[0]


def test_split_statements_drops_the_empty_trailing_fragment():
    stmts = split_statements("select 1;\n")
    assert stmts == ["select 1"]


def test_extract_readback_block_parses_the_ruler_style():
    block = extract_block(FIXTURE_0013, "readback")
    assert block is not None
    assert "alert_runs_read" in block


def test_extract_readback_block_parses_the_indented_style_and_drops_the_expected_annotation():
    block = extract_block(FIXTURE_0014, "readback")
    assert block is not None
    assert "relrowsecurity" in block
    stmts = readback_statements(FIXTURE_0014)
    joined = " ".join(stmts)
    assert "expected:" not in joined


def test_extract_block_stops_at_the_first_non_comment_line():
    text = "-- readback:\n-- select 1;\ncreate table x();\n-- select 2;\n"
    block = extract_block(text, "readback")
    assert "select 2" not in block
    assert "select 1" in block


def test_missing_readback_block_returns_none_and_is_refused():
    assert extract_block(FIXTURE_NO_READBACK, "readback") is None
    with pytest.raises(MigrationError):
        readback_statements(FIXTURE_NO_READBACK)


def test_extract_down_block_found_in_both_house_styles():
    assert extract_block(FIXTURE_0013, "down") is not None
    assert extract_block(FIXTURE_0014, "down") is not None


def test_readback_statements_splits_multi_statement_readbacks():
    stmts = readback_statements(FIXTURE_0013)
    assert len(stmts) == 3


def test_expected_objects_parses_tables_indexes_policies_triggers_functions():
    stmts = split_statements(FIXTURE_0014)
    objs = expected_objects(stmts)
    kinds = {o.kind for o in objs}
    assert kinds == {"table", "index", "policy", "trigger", "function"}


def test_expected_objects_strips_schema_quotes_and_function_arguments():
    stmts = split_statements(FIXTURE_0014)
    objs = expected_objects(stmts)
    names = {o.name for o in objs}
    assert "tenants" in names
    assert all("public." not in n and "(" not in n for n in names)


def test_idempotency_findings_empty_for_the_0013_shape():
    stmts = split_statements(FIXTURE_0013)
    assert idempotency_findings(FIXTURE_0013, stmts) == []


def test_idempotency_findings_empty_for_the_0014_shape():
    stmts = split_statements(FIXTURE_0014)
    assert idempotency_findings(FIXTURE_0014, stmts) == []


def test_idempotency_findings_flags_create_table_without_if_not_exists():
    stmts = split_statements(FIXTURE_NOT_IDEMPOTENT)
    findings = idempotency_findings(FIXTURE_NOT_IDEMPOTENT, stmts)
    assert any("if not exists" in f for f in findings)


def test_idempotency_findings_flags_a_bare_create_policy():
    stmts = split_statements(FIXTURE_BARE_POLICY)
    findings = idempotency_findings(FIXTURE_BARE_POLICY, stmts)
    assert any("create policy" in f for f in findings)


def test_idempotency_findings_accepts_a_policy_in_a_duplicate_object_block():
    stmts = split_statements(FIXTURE_0013)
    findings = idempotency_findings(FIXTURE_0013, stmts)
    assert not any("create policy" in f for f in findings)


def test_idempotency_findings_accepts_a_policy_preceded_by_drop_policy_if_exists():
    stmts = split_statements(FIXTURE_0014)
    findings = idempotency_findings(FIXTURE_0014, stmts)
    assert not any("create policy" in f for f in findings)


def test_idempotency_findings_flags_a_trigger_without_drop_trigger_if_exists():
    stmts = split_statements(FIXTURE_TRIGGER_NO_DROP)
    findings = idempotency_findings(FIXTURE_TRIGGER_NO_DROP, stmts)
    assert any("create trigger" in f for f in findings)


def test_idempotency_findings_flags_a_missing_down_block():
    text = "create table if not exists public.x (id int);\n-- readback:\n-- select 1;\n"
    stmts = split_statements(text)
    findings = idempotency_findings(text, stmts)
    assert any("down" in f for f in findings)


def test_allow_legacy_waives_only_versions_0001_to_0010():
    assert migration_version("0001_init.sql") in LEGACY_VERSIONS
    assert migration_version("0013_alert_runs_outbox.sql") not in LEGACY_VERSIONS
    assert migration_version("no_version_prefix.sql") is None


def test_transaction_wrapper_is_detected_and_selects_single_transaction_mode():
    stmts_wrapped = split_statements(FIXTURE_0014)
    stmts_unwrapped = split_statements(FIXTURE_0013)
    assert has_transaction_wrapper(stmts_wrapped) is True
    assert has_transaction_wrapper(stmts_unwrapped) is False
    assert apply_mode(stmts_wrapped) == "single-transaction"
    assert apply_mode(stmts_unwrapped) == "statement-at-a-time"


def test_apply_sends_one_post_per_statement_when_unwrapped(tmp_path):
    f = tmp_path / "0013_alert_runs_outbox.sql"
    f.write_text(FIXTURE_0013)
    fake = FakeApi()
    receipt_path = tmp_path / "receipt.json"
    rc = run_apply(f, runner=fake, receipt_path=receipt_path, project_ref="ref123",
                    accept_unverifiable=True)
    assert rc == 0
    stmts = split_statements(FIXTURE_0013)
    rb = readback_statements(FIXTURE_0013)
    expected_calls = len(rb) + len(stmts) + len(rb)
    assert len(fake.calls) == expected_calls


def test_apply_sends_exactly_one_post_when_wrapped_and_keeps_begin_and_commit(tmp_path):
    f = tmp_path / "0014_tenancy_foundation.sql"
    f.write_text(FIXTURE_0014)
    fake = FakeApi()
    receipt_path = tmp_path / "receipt.json"
    # This fixture's own readback query only asserts the `tenants` table, so a
    # fake catalog that never echoes the other expected names (index/trigger/
    # function/policy) correctly reports failed_readback -- the point of the
    # test is the POST count and the preserved begin/commit wrapper, not a
    # full pass.
    rc = run_apply(f, runner=fake, receipt_path=receipt_path, project_ref="ref123",
                    accept_unverifiable=False)
    assert rc == 6
    rb = readback_statements(FIXTURE_0014)
    apply_calls = [c for c in fake.calls if "begin" in c.lower() and "commit" in c.lower()]
    assert len(apply_calls) == 1
    assert len(fake.calls) == len(rb) + 1 + len(rb)


def test_receipt_carries_every_required_key_and_no_token(tmp_path):
    f = tmp_path / "0013_alert_runs_outbox.sql"
    f.write_text(FIXTURE_0013)
    fake = FakeApi()
    receipt_path = tmp_path / "receipt.json"
    run_apply(f, runner=fake, receipt_path=receipt_path, project_ref="ref123",
              accept_unverifiable=True)
    receipt = json.loads(receipt_path.read_text())
    for key in ("file", "sha256", "pre", "post", "applied_at", "statements_n",
                "status", "project_ref", "apply_mode", "expected_objects",
                "missing_after", "failed_statement_index", "error", "tool_version"):
        assert key in receipt
    assert "sbp_" not in json.dumps(receipt)


def test_receipt_status_is_failed_and_names_the_index_when_a_statement_errors(tmp_path):
    f = tmp_path / "0013_alert_runs_outbox.sql"
    f.write_text(FIXTURE_0013)
    stmts = split_statements(FIXTURE_0013)
    rb = readback_statements(FIXTURE_0013)
    fail_at = len(rb) + 1
    fake = FakeApi(fail_on={fail_at})
    receipt_path = tmp_path / "receipt.json"
    rc = run_apply(f, runner=fake, receipt_path=receipt_path, project_ref="ref123",
                    accept_unverifiable=True)
    assert rc == 5
    receipt = json.loads(receipt_path.read_text())
    assert receipt["status"] == "failed"
    assert receipt["error"]


FIXTURE_READBACK_DOES_NOT_NAME_THE_OBJECT = """
create table if not exists public.widget (id int);
-- down:
-- drop table if exists public.widget;
-- readback:
-- select count(*) from information_schema.tables;
"""


def test_missing_objects_after_apply_exit_6_and_names_them_in_plain_words(tmp_path):
    f = tmp_path / "0013_widget.sql"
    f.write_text(FIXTURE_READBACK_DOES_NOT_NAME_THE_OBJECT)
    fake = FakeApi()
    receipt_path = tmp_path / "receipt.json"
    rc = run_apply(f, runner=fake, receipt_path=receipt_path, project_ref="ref123")
    assert rc == 6
    receipt = json.loads(receipt_path.read_text())
    assert receipt["status"] == "failed_readback"
    assert receipt["missing_after"]
    assert any("widget" in m for m in receipt["missing_after"])


def test_unverifiable_expected_objects_exit_6_unless_accept_unverifiable(tmp_path):
    text = (
        "alter table public.x add column y int;\n"
        "-- down:\n-- alter table public.x drop column y;\n"
        "-- readback:\n-- select 1;\n"
    )
    f = tmp_path / "0013_x.sql"
    f.write_text(text)
    fake = FakeApi()
    receipt_path = tmp_path / "receipt.json"
    rc = run_apply(f, runner=fake, receipt_path=receipt_path, project_ref="ref123",
                    accept_unverifiable=False)
    assert rc == 6
    receipt = json.loads(receipt_path.read_text())
    assert receipt["status"] == "unverified"

    fake2 = FakeApi()
    receipt_path2 = tmp_path / "receipt2.json"
    rc2 = run_apply(f, runner=fake2, receipt_path=receipt_path2, project_ref="ref123",
                     accept_unverifiable=True)
    assert rc2 == 0


def test_dotenv_parser_reads_quoted_and_exported_values_and_ignores_comments(tmp_path):
    env = tmp_path / ".env"
    env.write_text(
        "# a comment\n"
        "export SUPABASE_ACCESS_TOKEN=\"sbp_abc123\"\n"
        "SUPABASE_PROJECT_REF='ref999'\n"
        "\n"
        "OTHER=plain\n"
    )
    values = load_dotenv_values(env)
    assert values["SUPABASE_ACCESS_TOKEN"] == "sbp_abc123"
    assert values["SUPABASE_PROJECT_REF"] == "ref999"
    assert values["OTHER"] == "plain"


def test_pat_never_appears_in_curl_argv_or_in_stdout(tmp_path, capsys):
    calls = []

    def fake_subprocess_run(argv, input=None, capture_output=True, text=True):
        calls.append((argv, input))
        class R:
            stdout = "[]\n200"
            stderr = ""
            returncode = 0
        return R()

    runner = CurlRunner("ref123", "sbp_super_secret_token", runner=fake_subprocess_run)
    runner("select 1")
    argv, stdin = calls[0]
    assert "sbp_super_secret_token" not in argv
    assert "sbp_super_secret_token" in stdin
    captured = capsys.readouterr()
    assert "sbp_super_secret_token" not in captured.out


def test_transport_is_curl_not_urllib():
    calls = []

    def fake_subprocess_run(argv, input=None, capture_output=True, text=True):
        calls.append(argv)
        class R:
            stdout = "[]\n200"
            stderr = ""
            returncode = 0
        return R()

    runner = CurlRunner("ref123", "tok", runner=fake_subprocess_run)
    runner("select 1")
    assert calls[0][0] == "curl"
    src = Path("scripts/supabase_apply.py").read_text()
    assert "urllib.request" not in src


def test_dry_run_makes_zero_calls(tmp_path, capsys):
    f = tmp_path / "0013_alert_runs_outbox.sql"
    f.write_text(FIXTURE_0013)
    rc = run_dry(f)
    assert rc == 0
    captured = capsys.readouterr()
    assert "no network call was made." in captured.out


def test_every_migration_on_disk_passes_the_guard_or_is_legacy():
    seen_versions = []
    for fp in sorted(glob.glob("supabase/migrations/*.sql")):
        version = migration_version(fp)
        seen_versions.append(version)
        if version is None:
            continue
        text = Path(fp).read_text()
        stmts = split_statements(text)
        findings = idempotency_findings(text, stmts)
        if version in LEGACY_VERSIONS:
            continue
        assert findings == [], f"{fp} is not idempotent without --allow-legacy: {findings}"
    print(f"migration versions seen on disk: {seen_versions}")
