"""Pure-function + fake-transport tests for scripts/supabase_apply.py.

No network. Fixtures reproduce the 0013 (ruler-style) and 0014 (indented-style)
`-- readback:` / `-- down:` house conventions inline, since those files are not
on master yet.
"""
from __future__ import annotations

import glob
import json
import subprocess
from pathlib import Path

import pytest

import scripts.supabase_apply as supabase_apply_module
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
    main,
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


def test_strip_sql_comments_is_byte_exact_around_dollar_quotes_and_escaped_quotes():
    # Regression for the review-#516 blocker: the scanner used to yield only
    # the FIRST character of every multi-character delimiter (dollar-quote
    # open/close, "/*", and the "''"/'""' escaped-quote pairs) and advance
    # past the rest, so callers that rebuild text from yielded characters
    # (strip_sql_comments, split_statements) silently dropped a character at
    # every one of those boundaries. None of the cases below contain a
    # comment, so a byte-exact scanner must return the input unchanged.
    cases = [
        "do $$ begin exception when duplicate_object then null; end $$;",
        "create function f() returns void as $tag$ begin end $tag$ language plpgsql;",
        "select 'it''s' as x;",
        'select "a""b" as y;',
    ]
    for sql in cases:
        assert strip_sql_comments(sql) == sql


def test_split_statements_preserves_block_comments_across_the_pipeline():
    # The corruption above was invisible when strip_sql_comments was called
    # directly on the original text (one clean pass over an intact "/*"),
    # but run_apply calls split_statements(text) FIRST and then
    # strip_sql_comments on each returned statement -- exactly this order --
    # and the dropped "*" meant the corrupted statement no longer contained
    # a recognizable "/*", so the second pass left "/ note */" as literal,
    # unstripped SQL text sent to the API.
    sql = "create table if not exists public.t2 /* note */ (id int);"
    stmts = split_statements(sql)
    assert stmts == ["create table if not exists public.t2 /* note */ (id int)"]
    cleaned = strip_sql_comments(stmts[0])
    assert "/*" not in cleaned
    assert "*/" not in cleaned
    assert "public.t2" in cleaned and "(id int)" in cleaned


def test_transaction_wrapper_is_detected_but_apply_mode_never_claims_single_transaction():
    # apply_mode used to return "single-transaction" for a begin;/commit;
    # wrapped file even though run_apply always sends one POST per
    # statement -- a false atomicity label on the receipt that is the PR's
    # own proof artifact (review-#516 MAJOR 2). has_transaction_wrapper still
    # reports the file's own shape; apply_mode must describe what the tool
    # actually does, which is statement-at-a-time regardless of wrapper.
    stmts_wrapped = split_statements(FIXTURE_0014)
    stmts_unwrapped = split_statements(FIXTURE_0013)
    assert has_transaction_wrapper(stmts_wrapped) is True
    assert has_transaction_wrapper(stmts_unwrapped) is False
    assert apply_mode(stmts_wrapped) == "statement-at-a-time"
    assert apply_mode(stmts_unwrapped) == "statement-at-a-time"


def test_apply_sends_one_post_per_statement_when_unwrapped(tmp_path):
    f = tmp_path / "0013_alert_runs_outbox.sql"
    f.write_text(FIXTURE_0013)
    rb = readback_statements(FIXTURE_0013)
    stmts = split_statements(FIXTURE_0013)
    # Only the POST-readback rows (not the echoed statement text) count as
    # evidence an object exists -- feed the fake catalog rows that actually
    # name the three objects this migration creates.
    post_start = len(rb) + len(stmts) + 1
    responses = {
        post_start: [{"relname": "alert_runs"}],
        post_start + 1: [{"relname": "alert_runs_id_key"}],
        post_start + 2: [{"polname": "alert_runs_read"}],
    }
    fake = FakeApi(responses=responses)
    receipt_path = tmp_path / "receipt.json"
    rc = run_apply(f, runner=fake, receipt_path=receipt_path, project_ref="ref123",
                    accept_unverifiable=True)
    assert rc == 0
    expected_calls = len(rb) + len(stmts) + len(rb)
    assert len(fake.calls) == expected_calls


def test_wrapped_migrations_still_apply_one_statement_per_post(tmp_path):
    f = tmp_path / "0014_tenancy_foundation.sql"
    f.write_text(FIXTURE_0014)
    fake = FakeApi()
    receipt_path = tmp_path / "receipt.json"
    # has_transaction_wrapper() is True for this fixture, but the tool never
    # POSTs the whole file as one query: the Management API splits on ';'
    # server-side (supabase/migrations/README.md), so a single POST was
    # never actually one transaction, and it also made a mid-file failure
    # unreportable (failed_statement_index forced to None). Every migration
    # -- wrapped or not -- applies one statement per POST, and apply_mode()
    # says so in the receipt (never the false "single-transaction" label --
    # review-#516 MAJOR 2).
    #
    # This fixture's own readback query only asserts the `tenants` table, so
    # a fake catalog that never echoes the other expected names (index/
    # trigger/function/policy) correctly reports failed_readback -- the
    # point of this test is the per-statement POST behaviour, not a full
    # pass.
    rc = run_apply(f, runner=fake, receipt_path=receipt_path, project_ref="ref123",
                    accept_unverifiable=False)
    assert rc == 6
    rb = readback_statements(FIXTURE_0014)
    stmts = split_statements(FIXTURE_0014)
    assert len(fake.calls) == len(rb) + len(stmts) + len(rb)
    combined = [c for c in fake.calls if "begin" in c.lower() and "commit" in c.lower()]
    assert combined == []
    begin_calls = [c for c in fake.calls if c.strip().lower() == "begin"]
    assert len(begin_calls) == 1
    receipt = json.loads(receipt_path.read_text())
    assert receipt["apply_mode"] == "statement-at-a-time"
    assert receipt["failed_statement_index"] is None


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


def test_unverifiable_expected_objects_exit_6_unless_accept_unverifiable(tmp_path, capsys):
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
    # review-#516 MAJOR 3: --accept-unverifiable used to fall through to the
    # plain "applied" status with nothing printed, making the receipt --
    # this PR's own proof artifact -- indistinguishable from a checked pass.
    # It must carry a distinct status and the null must still be printed.
    receipt2 = json.loads(receipt_path2.read_text())
    assert receipt2["status"] == "applied_unverified"
    assert receipt2["status"] != "applied"
    printed = capsys.readouterr().out
    assert "null:" in printed
    assert "accept-unverifiable" in printed


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

    def fake_subprocess_run(argv, **kwargs):
        calls.append((argv, kwargs))
        class R:
            stdout = "[]\n200"
            stderr = ""
            returncode = 0
        return R()

    token = "sbp_super_secret_token"
    runner = CurlRunner("ref123", token, runner=fake_subprocess_run)
    runner("select 1")
    argv, kwargs = calls[0]
    # review-#516 round-3 MAJOR 2: `token not in argv` is ELEMENT-WISE list
    # membership -- it can never fail for a leak embedded INSIDE one longer
    # argv element (e.g. an extra "-H X-Leak: Bearer <token>" header).
    # MEASURED: adding that header to CurlRunner's own argv left the old
    # assertion `1 passed`. A substring check over every element is required.
    assert not any(token in a for a in argv)
    # The token IS expected in kwargs["input"] -- that is the `--config -`
    # stdin channel curl reads its Authorization header from, precisely so
    # the token never has to appear in argv. Every OTHER string-valued kwarg
    # passed to the runner must not carry it either.
    assert token in kwargs["input"]
    for key, value in kwargs.items():
        if key == "input":
            continue
        if isinstance(value, str):
            assert token not in value
    captured = capsys.readouterr()
    assert token not in captured.out


def test_pat_element_wise_argv_check_would_have_missed_a_leaked_header_substring_check_catches_it():
    # Positive control for the fix above: reproduce the reviewer's mutation
    # (an extra "-H X-Leak: Bearer <token>" argv element) directly against a
    # captured argv list. The OLD check (`token not in argv`) still "passes"
    # against it -- the NEW check (`not any(token in a for a in argv)`)
    # correctly fails, proving the fix actually catches the leak the old
    # check could not.
    token = "sbp_super_secret_token"
    argv = ["curl", "-H", f"X-Leak: Bearer {token}", "--data-binary", "@x.json"]
    assert token not in argv  # the OLD (broken) check: still "passes" here
    with pytest.raises(AssertionError):
        assert not any(token in a for a in argv)  # the NEW check: correctly fails


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


def test_dry_run_makes_zero_calls(tmp_path, capsys, monkeypatch):
    # review-#516 round-2 MAJOR 3 / round-3 MAJOR 1: the frozen rule ((b)
    # "--dry-run makes NO network call") names the acceptance test explicitly
    # ("test asserts subprocess/curl is never invoked"). Patching
    # `subprocess.run` alone used to be INERT: CurlRunner bound
    # `runner=subprocess.run` as a default argument evaluated once at import
    # time, so a CurlRunner built with no explicit `runner=` (the real
    # code path -- see main()) never picked up the patch. MEASURED (mutation):
    # a `CurlRunner(...)("select 1")` call inserted at the top of run_dry made
    # a LIVE call to api.supabase.com instead of raising here. The source fix
    # (CurlRunner.__call__ now resolves `self.runner or subprocess.run` at
    # CALL time) makes the patch reach an unmodified CurlRunner; this test
    # both exercises the dry-run contract AND proves, with a positive
    # control in the same test, that the patch is actually live.
    def _boom(*_a, **_kw):
        raise AssertionError("--dry-run must never invoke subprocess/curl")

    monkeypatch.setattr(subprocess, "run", _boom)
    f = tmp_path / "0013_alert_runs_outbox.sql"
    f.write_text(FIXTURE_0013)
    rc = run_dry(f)
    assert rc == 0
    captured = capsys.readouterr()
    assert "no network call was made." in captured.out

    # Positive control: the SAME patch must fire when run_apply is invoked
    # with a real CurlRunner -- constructed with NO runner= override, i.e.
    # exactly the code path that used to be inert. If the source fix above
    # were reverted (or absent), run_apply's first pre-readback call would
    # instead reach the real api.supabase.com and this assertion would never
    # see the AssertionError -- proving the spy is live, not decorative.
    live_runner = CurlRunner("ref123", "tok")
    with pytest.raises(AssertionError, match="dry-run must never invoke subprocess/curl"):
        run_apply(
            f,
            runner=live_runner,
            receipt_path=tmp_path / "positive_control_receipt.json",
            project_ref="ref123",
        )


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


# --- Regression tests: review findings on PR #516 -------------------------

def test_missing_after_ignores_the_echoed_readback_statement_text():
    # The readback statement text names the very object it is checking for
    # ("select ... where relname = 'alerts'"), and a naive substring search
    # over json.dumps(post) matched on that echoed text even when the
    # returned ROWS were empty -- i.e. a partial/absent apply reported as
    # applied. Real evidence has to come from the rows, never the statement.
    expected = [ExpectedObject("table", "alerts")]
    post = [{"statement": "select relname from pg_class where relname = 'alerts';", "rows": []}]
    assert missing_after(expected, post) == ["table alerts"]


def test_missing_after_does_not_let_a_prefix_collide():
    # expected index "idx_alerts" must not be satisfied by a returned row
    # value of "idx_alerts_user" -- exact identifier match, not substring.
    expected = [ExpectedObject("index", "idx_alerts")]
    post = [{"statement": "select indexname from pg_indexes;", "rows": [{"indexname": "idx_alerts_user"}]}]
    assert missing_after(expected, post) == ["index idx_alerts"]


def test_missing_after_matches_an_exact_row_value():
    expected = [ExpectedObject("index", "idx_alerts")]
    post = [{"statement": "select indexname from pg_indexes;", "rows": [{"indexname": "idx_alerts"}]}]
    assert missing_after(expected, post) == []


def test_pre_readback_swallows_only_a_missing_relation_error(tmp_path):
    # A 401/404/429/5xx before the create must fail the run, not be treated
    # as "expected before a create" -- only a genuine 42P01 / "does not
    # exist" undefined-relation error is expected there.
    f = tmp_path / "0013_widget.sql"
    f.write_text(FIXTURE_READBACK_DOES_NOT_NAME_THE_OBJECT)
    rb = readback_statements(FIXTURE_READBACK_DOES_NOT_NAME_THE_OBJECT)

    class UnauthorizedApi:
        def __init__(self):
            self.calls = []

        def __call__(self, sql):
            self.calls.append(sql)
            raise ApiError(401, '{"message": "Invalid API key"}')

    fake = UnauthorizedApi()
    receipt_path = tmp_path / "receipt.json"
    rc = run_apply(f, runner=fake, receipt_path=receipt_path, project_ref="ref123")
    assert rc == 5
    assert len(fake.calls) == 1  # never proceeded past the first pre-readback call
    receipt = json.loads(receipt_path.read_text())
    assert receipt["status"] == "failed"
    assert "401" in receipt["error"] or "Invalid API key" in receipt["error"]


def test_pre_readback_undefined_table_error_is_still_swallowed(tmp_path):
    f = tmp_path / "0013_widget.sql"
    f.write_text(FIXTURE_READBACK_DOES_NOT_NAME_THE_OBJECT)

    class NotFoundOnceApi:
        def __init__(self):
            self.calls = []

        def __call__(self, sql):
            self.calls.append(sql)
            if len(self.calls) == 1:
                raise ApiError(400, '{"code": "42P01", "message": "relation does not exist"}')
            return []

    fake = NotFoundOnceApi()
    receipt_path = tmp_path / "receipt.json"
    rc = run_apply(f, runner=fake, receipt_path=receipt_path, project_ref="ref123")
    # still runs to completion (missing readback afterwards -> exit 6, not 5)
    assert rc == 6
    receipt = json.loads(receipt_path.read_text())
    assert receipt["status"] == "failed_readback"


def test_pre_readback_stale_project_ref_404_is_not_swallowed_as_missing_relation(tmp_path):
    # review-#516 round-3 MINOR 1: a stale/wrong --project-ref 404s on the
    # very first pre-readback call with a message like "Project ref123 does
    # not exist" -- the old bare "does not exist" substring match swallowed
    # that as "expected before a create" and let the apply proceed against
    # the wrong project. _is_missing_relation_error must require the
    # SQLSTATE (42P01) or actual relation/table/index/policy wording.
    f = tmp_path / "0013_widget.sql"
    f.write_text(FIXTURE_READBACK_DOES_NOT_NAME_THE_OBJECT)

    class StaleProjectRefApi:
        def __init__(self):
            self.calls = []

        def __call__(self, sql):
            self.calls.append(sql)
            raise ApiError(404, '{"message": "Project ref123 does not exist"}')

    fake = StaleProjectRefApi()
    receipt_path = tmp_path / "receipt.json"
    rc = run_apply(f, runner=fake, receipt_path=receipt_path, project_ref="ref123")
    assert rc == 5
    assert len(fake.calls) == 1  # never proceeded past the first pre-readback call
    receipt = json.loads(receipt_path.read_text())
    assert receipt["status"] == "failed"
    assert "does not exist" in receipt["error"]


def test_dry_run_honours_an_explicit_project_ref_override_like_apply_does(monkeypatch, tmp_path, capsys):
    # review-#516 round-3 MINOR 3: main() used to call
    # `run_dry(args.path, allow_legacy=...)` with no --project-ref at all, so
    # the dry-run "project:" line ignored an explicit operator override even
    # though --apply validates the same override via resolve_credentials()
    # (main():867). run_dry now honours it the same way: a matching override
    # is shown, a conflicting one is refused (same stale-.env guard as
    # --apply), never silently ignored.
    monkeypatch.setenv("SUPABASE_ACCESS_TOKEN", "sbp_test_token")
    monkeypatch.setenv("SUPABASE_PROJECT_REF", "realref")
    f = tmp_path / "0013_alert_runs_outbox.sql"
    f.write_text(FIXTURE_0013)

    rc = run_dry(f, project_ref="realref")
    assert rc == 0
    out = capsys.readouterr().out
    assert "project: realref" in out

    rc2 = run_dry(f, project_ref="wrongref")
    assert rc2 == 3
    out2 = capsys.readouterr().out
    assert "does not match the resolved ref" in out2
    assert "no network call was made." in out2


FIXTURE_LEGACY_NO_READBACK = """
create table if not exists public.legacy_thing (id int);
"""


def test_allow_legacy_waives_a_missing_readback_block_instead_of_crashing(tmp_path, capsys):
    f = tmp_path / "0003_legacy_thing.sql"
    f.write_text(FIXTURE_LEGACY_NO_READBACK)

    rc = run_dry(f, allow_legacy=True)
    assert rc == 0
    out = capsys.readouterr().out
    assert "waived (legacy 0001-0010)" in out
    assert "readback: none" in out

    fake = FakeApi()
    receipt_path = tmp_path / "receipt.json"
    rc2 = run_apply(f, runner=fake, receipt_path=receipt_path, project_ref="ref123",
                     allow_legacy=True)
    assert rc2 == 6  # unverified: no readback to check against, and --accept-unverifiable was not passed
    receipt = json.loads(receipt_path.read_text())
    assert receipt["status"] == "unverified"
    assert receipt["pre"] == []
    assert receipt["post"] == []

    rc3 = run_apply(f, runner=FakeApi(), receipt_path=tmp_path / "receipt3.json",
                     project_ref="ref123", allow_legacy=True, accept_unverifiable=True)
    assert rc3 == 0


def test_pat_never_appears_in_receipt_or_in_curl_stderr_on_api_error(tmp_path, capsys):
    # review-#516 round-2 MAJOR 4: frozen rule (a) says the PAT must never
    # appear in "argv, logs, receipts, or error text", and names the
    # acceptance test explicitly ("test greps the receipt and captured
    # stderr for the token"). The prior test only grepped argv and stdout --
    # supabase_apply.py's ApiError(status, payload or (proc.stderr or ""))
    # fed curl's STDERR straight into the receipt's "error" field with no
    # redaction. This simulates a curl failure whose stderr happens to
    # contain the token text (e.g. a config-parse error echoing its input)
    # and greps both the raised error text and the on-disk receipt for it.
    token = "sbp_super_secret_token_for_stderr_leak_test"

    def fake_subprocess_run(argv, input=None, capture_output=True, text=True):
        class R:
            stdout = ""
            stderr = f"curl: (3) URL rejected: bad header near token {token}"
            returncode = 3

        return R()

    runner = CurlRunner("ref123", token, runner=fake_subprocess_run)
    with pytest.raises(ApiError) as exc_info:
        runner("select 1")
    assert token not in str(exc_info.value)
    assert token not in exc_info.value.body

    f = tmp_path / "0013_widget.sql"
    f.write_text(FIXTURE_READBACK_DOES_NOT_NAME_THE_OBJECT)
    receipt_path = tmp_path / "receipt.json"
    runner2 = CurlRunner("ref123", token, runner=fake_subprocess_run)
    rc = run_apply(f, runner=runner2, receipt_path=receipt_path, project_ref="ref123")
    assert rc == 5
    receipt_text = receipt_path.read_text()
    assert token not in receipt_text
    captured = capsys.readouterr()
    assert token not in captured.out
    # review-#516 round-3 MINOR 2: frozen rule (a) names a stderr grep
    # explicitly ("test greps the receipt and captured stderr for the
    # token"); no test previously read captured.err at all.
    assert token not in captured.err


def test_allow_legacy_still_refuses_a_non_idempotent_non_legacy_file(tmp_path):
    # review-#516 round-2 MINOR 4: the existing
    # test_allow_legacy_waives_only_versions_0001_to_0010 only calls
    # migration_version() and never exercises _guard()'s own refusal path for
    # a non-legacy version passed with --allow-legacy -- it asserted a name,
    # not the behavior the name promised. Drive it through run_dry (the real
    # CLI path) instead of the private _guard helper.
    f = tmp_path / "0013_not_idempotent.sql"
    f.write_text(FIXTURE_NOT_IDEMPOTENT)
    rc = run_dry(f, allow_legacy=True)
    assert rc == 3


def test_main_refuses_a_missing_path_with_a_plain_message_not_a_traceback(tmp_path, capsys):
    missing = tmp_path / "does_not_exist.sql"
    rc = main([str(missing), "--dry-run"])
    assert rc == 2
    err = capsys.readouterr().err
    assert "no such file" in err
    assert "Traceback" not in err


def test_apply_receipt_write_failure_prints_a_plain_message_not_a_traceback(tmp_path, capsys):
    f = tmp_path / "0013_alert_runs_outbox.sql"
    f.write_text(FIXTURE_0013)
    fake = FakeApi()
    unwritable_receipt = tmp_path / "no_such_dir" / "receipt.json"
    with pytest.raises(SystemExit) as exc_info:
        run_apply(f, runner=fake, receipt_path=unwritable_receipt, project_ref="ref123",
                   accept_unverifiable=True)
    assert exc_info.value.code == 2
    out = capsys.readouterr().out
    assert "could not write the receipt" in out
    assert "Traceback" not in out


def test_dry_run_prints_comments_stripped_not_the_raw_statement(tmp_path, capsys):
    text = (
        "create table if not exists public.thing (id int); "
        "-- this comment must not appear in the dry-run output\n"
        "-- down:\n-- drop table if exists public.thing;\n"
        "-- readback:\n-- select 1;\n"
    )
    f = tmp_path / "0013_thing.sql"
    f.write_text(text)
    rc = run_dry(f)
    assert rc == 0
    out = capsys.readouterr().out
    assert "this comment must not appear" not in out
    assert "create table if not exists public.thing" in out


# --- Regression tests: Meta-CEO B ruling r2 (2026-09-06, review-#516) ------
#
# A production --apply of supabase/migrations/0012_thesis_objects.sql
# aborted at the PRE-readback with `HTTP 400 ... syntax error at or near
# "Post" LINE 1: Post-apply verification (run manually against the target
# database):` -- extract_block() only stripped the readback block's OWN
# single layer of "-- " comment marking, which left the block's descriptive
# header line glued onto the first `select` as bare prose (no comment
# marker survived the one-level strip), and the nested "--   -- expect ..."
# annotations under each query only happened to get neutralized downstream
# by strip_sql_comments() rather than being excluded by the block parser
# itself.

# Copied byte-for-byte from the `-- readback:` block of
# supabase/migrations/0012_thesis_objects.sql on origin/master (verified
# against `git show origin/master:supabase/migrations/0012_thesis_objects.sql`).
# The surrounding create-table/down-block scaffolding is NOT from that file
# -- it exists only to make this a syntactically valid, idempotent fixture
# so run_dry's guard passes and reaches the readback listing.
FIXTURE_0012_READBACK_BLOCK = """
create table if not exists public.theses (id bigint generated always as identity primary key);

-- down:
-- drop table if exists public.theses;

-- readback:
-- Post-apply verification (run manually against the target database):
--
-- select relname, relrowsecurity from pg_class
--   where relname in ('theses','thesis_versions') and relnamespace = 'public'::regnamespace;
--   -- expect relrowsecurity = true for both rows
--
-- select schemaname, tablename, policyname from pg_policies
--   where schemaname = 'public' and tablename in ('theses','thesis_versions')
--   order by tablename, policyname;
--   -- expect exactly: theses/theses_select_own, thesis_versions/thesis_versions_select_own
--
-- select table_name, grantee, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public' and table_name in ('theses','thesis_versions')
--   order by table_name, grantee, privilege_type;
--   -- expect select-only grants to authenticated (no insert/update/delete/public/anon)
--
-- select p.proname, p.prosecdef, p.proconfig from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('apply_thesis_version_v1','read_current_thesis_versions_v1');
--   -- expect prosecdef = true for both; proconfig carries the function's search_path pin
"""


def test_readback_statements_for_0012_thesis_objects_yields_four_select_statements(tmp_path):
    # Meta-CEO B ruling r2, acceptance test (2): feed the LITERAL readback
    # block of 0012_thesis_objects.sql and assert exactly 4 parsed
    # statements, each beginning with `select`.
    text = FIXTURE_0012_READBACK_BLOCK
    stmts = readback_statements(text)
    assert len(stmts) == 4
    for s in stmts:
        assert s.strip().lower().startswith("select"), repr(s)
    # The prose header must be gone entirely, not merely off the front of
    # the first statement.
    assert not any("post-apply verification" in s.lower() for s in stmts)


def test_dry_run_for_0012_readback_lists_clean_statements_with_prose_excluded(tmp_path, capsys):
    # Meta-CEO B ruling r2, requirement (3): --dry-run output must list the
    # parsed readback statements so an operator can see prose was excluded.
    f = tmp_path / "0012_thesis_objects.sql"
    f.write_text(FIXTURE_0012_READBACK_BLOCK)
    rc = run_dry(f)
    assert rc == 0
    out = capsys.readouterr().out
    assert "readback query that WOULD run (4 statements):" in out
    assert "post-apply verification" not in out.lower()
    assert "select relname, relrowsecurity" in out


def test_is_missing_relation_error_recognizes_more_object_kinds_without_reopening_the_project_ref_hole():
    # review-#516 round-4 MINOR: "_is_missing_relation_error over-narrowed".
    # Round-3's message-only fallback matched only relation/table/index/
    # policy wording -- a pre-readback query against a not-yet-created
    # sequence, view, trigger, function, type, schema, column, or constraint
    # is just as "expected before a create" as a missing table, but none of
    # those wordings matched, so the FIRST --apply of a file whose readback
    # checks one of those object kinds would fail the run instead of
    # proceeding. RED-FIRST: this fails against the pre-fix (round-3) regex.
    for word in ("sequence", "view", "trigger", "function", "type", "schema", "column", "constraint"):
        exc = ApiError(400, '{"message":"%s \\"foo\\" does not exist"}' % word)
        assert supabase_apply_module._is_missing_relation_error(exc), word

    # The round-3 fix this must not reopen: a stale/wrong --project-ref 404
    # never names any of these object-kind words, so it must still fail the
    # run rather than being swallowed.
    stale = ApiError(404, '{"message":"Project ref123 does not exist"}')
    assert not supabase_apply_module._is_missing_relation_error(stale)


def test_pat_string_kwarg_leak_loop_would_catch_a_leaked_token_in_a_non_input_kwarg():
    # review-#516 round-4 MINOR: "vacuous kwargs loop". The loop in
    # test_pat_never_appears_in_curl_argv_or_in_stdout --
    #   for key, value in kwargs.items():
    #       if key == "input": continue
    #       if isinstance(value, str): assert token not in value
    # -- never actually executes its assertion against CurlRunner's real
    # call: the only kwargs __call__ passes besides "input" today are
    # capture_output=True and text=True, both bools, so `isinstance(value,
    # str)` is False for both and the loop body never runs a single
    # assertion. This is that loop's positive control: a fabricated kwargs
    # dict carrying a leaked token in a THIRD string-valued kwarg proves the
    # mechanism actually catches a leak when one exists, rather than passing
    # vacuously because nothing was ever there to check.
    token = "sbp_super_secret_token"
    leaking_kwargs = {
        "input": "safe stdin, token belongs here",
        "capture_output": True,
        "text": True,
        "extra_header": f"-H X-Leak: Bearer {token}",
    }
    checked = 0
    found_leak = False
    for key, value in leaking_kwargs.items():
        if key == "input":
            continue
        if isinstance(value, str):
            checked += 1
            if token in value:
                found_leak = True
    assert checked >= 1, "the loop never inspected any non-input string kwarg"
    assert found_leak, "the loop failed to notice the token in a leaked string kwarg"


def test_dry_run_notes_the_project_ref_guard_did_not_run_when_credentials_are_incomplete(
    monkeypatch, tmp_path, capsys
):
    # review-#516 round-4 MINOR: "dry-run guard bypass when creds
    # incomplete". run_dry's except-SystemExit4 branch used to silently fall
    # through to `ref = project_ref or "<unresolved...>"` for ANY
    # resolve_credentials() failure, including the case where
    # SUPABASE_ACCESS_TOKEN/SUPABASE_PROJECT_REF are simply not set at all --
    # a different failure than "the override conflicts with a resolved
    # ref". In that case the stale-.env guard never even ran against the
    # override, but the printed "project: <override>" line looked identical
    # to a validated pass. The operator must be told the override was not
    # checked. RED-FIRST: fails against the pre-fix run_dry (no such note is
    # printed).
    monkeypatch.delenv("SUPABASE_ACCESS_TOKEN", raising=False)
    monkeypatch.delenv("SUPABASE_PROJECT_REF", raising=False)
    f = tmp_path / "0013_alert_runs_outbox.sql"
    f.write_text(FIXTURE_0013)

    rc = run_dry(f, project_ref="someref")
    assert rc == 0
    out = capsys.readouterr().out
    assert "project: someref" in out
    assert "could not be checked against stored credentials" in out


def test_main_wires_project_ref_through_dry_run_and_apply(monkeypatch, tmp_path, capsys):
    # review-#516 round-4 MINOR: "main() --project-ref wiring unpinned" --
    # every existing --project-ref test drives run_dry()/run_apply()
    # directly, never main() itself, so a regression in main()'s own
    # argv-to-function wiring for --project-ref (dry-run and apply alike)
    # would not be caught by any test. Drive the real CLI entry point
    # end-to-end for both modes.
    monkeypatch.setenv("SUPABASE_ACCESS_TOKEN", "sbp_test_token")
    monkeypatch.setenv("SUPABASE_PROJECT_REF", "realref")
    f = tmp_path / "0013_alert_runs_outbox.sql"
    f.write_text(FIXTURE_0013)

    rc = main([str(f), "--dry-run", "--project-ref", "realref"])
    assert rc == 0
    out = capsys.readouterr().out
    assert "project: realref" in out

    rc2 = main([str(f), "--dry-run", "--project-ref", "wrongref"])
    assert rc2 == 3

    calls = []
    response = json.dumps([
        {"relname": "alert_runs"},
        {"indexname": "alert_runs_id_key"},
        {"polname": "alert_runs_read"},
    ])

    def fake_subprocess_run(argv, **kwargs):
        calls.append((argv, kwargs))

        class R:
            stdout = f"{response}\n200"
            stderr = ""
            returncode = 0

        return R()

    monkeypatch.setattr(subprocess, "run", fake_subprocess_run)
    receipt_path = tmp_path / "receipt.json"
    rc3 = main([
        str(f), "--apply", "--receipt", str(receipt_path), "--project-ref", "realref",
    ])
    assert rc3 == 0
    assert len(calls) >= 1
    receipt = json.loads(receipt_path.read_text())
    assert receipt["project_ref"] == "realref"
    assert receipt["status"] == "applied"

    # A mismatched override must still refuse end to end through main(),
    # never reaching the runner (no extra calls recorded).
    calls_before = len(calls)
    rc4 = main([
        str(f), "--apply", "--receipt", str(tmp_path / "r2.json"), "--project-ref", "wrongref",
    ])
    assert rc4 == 4
    assert len(calls) == calls_before
