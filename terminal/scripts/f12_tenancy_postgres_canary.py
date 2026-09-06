#!/usr/bin/env python3
"""F12 tenancy-foundation RLS canary.

Applies every supabase/migrations/*.sql file (in filename order) to a scratch Postgres 16
database, bootstraps a minimal auth.* shim (auth.users, auth.uid() from a JWT-claim GUC), seeds
three users A/B/C, and asserts the RLS/trigger/recursion-guard contract that
0014_tenancy_foundation.sql claims. Mirrors the shape of PR #502's
terminal/scripts/f11_thesis_postgres_canary.py (Proof class, env(), actor_connection(),
admin_row(), expect_database_error(), bootstrap()) for the tenancy tables instead of theses.

This script APPLIES migrations to a throwaway CI database only. It is never a substitute for the
manual, out-of-band operator application described in supabase/migrations/README.md.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import uuid
from pathlib import Path

import psycopg
from psycopg import sql


class Proof:
    def __init__(self) -> None:
        self.assertions = 0
        self.verdicts: dict[str, str] = {}

    def check(self, name: str, condition: bool, detail: str = "") -> None:
        self.assertions += 1
        if condition:
            self.verdicts[name] = "pass"
        else:
            self.verdicts[name] = f"FAIL: {detail}"
            print(f"::error title=f12-canary::{name} failed: {detail}", flush=True)
            raise SystemExit(1)


def env(name: str, required: bool = True, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if required and not value:
        print(f"::error title=f12-canary::missing required env {name}", flush=True)
        raise SystemExit(1)
    return value or ""


def admin_connection(dsn: str) -> psycopg.Connection:
    conn = psycopg.connect(dsn, autocommit=True)
    return conn


def actor_connection(dsn: str, user_id: str | None) -> psycopg.Connection:
    """A connection acting as `authenticated` (or `anon` when user_id is None), with
    request.jwt.claim.sub set so auth.uid() resolves inside SECURITY DEFINER helpers."""
    conn = psycopg.connect(dsn, autocommit=True)
    with conn.cursor() as cur:
        if user_id:
            cur.execute("set role authenticated")
            cur.execute("select set_config('request.jwt.claim.sub', %s, false)", (user_id,))
        else:
            cur.execute("set role anon")
    return conn


def admin_row(conn: psycopg.Connection, query: str, params: tuple = ()) -> tuple | None:
    with conn.cursor() as cur:
        cur.execute(query, params)
        return cur.fetchone()


def expect_database_error(fn) -> bool:
    try:
        fn()
    except psycopg.Error:
        return True
    return False


def bootstrap(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute("create schema if not exists auth")
        cur.execute("create schema if not exists extensions")
        cur.execute("create extension if not exists pgcrypto with schema extensions")
        cur.execute(
            "create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text)"
        )
        cur.execute(
            """
            create or replace function auth.uid() returns uuid
              language sql stable as $$
              select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
            $$
            """
        )
        cur.execute("do $$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if; end $$;")
        cur.execute("do $$ begin if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if; end $$;")
        cur.execute("grant usage on schema public, auth to anon, authenticated")
        cur.execute("grant select on auth.users to anon, authenticated")


def apply_migrations(conn: psycopg.Connection, migrations_dir: Path) -> list[dict]:
    applied = []
    for path in sorted(migrations_dir.glob("*.sql")):
        text = path.read_text()
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        with conn.cursor() as cur:
            cur.execute(text)
        applied.append({"file": path.name, "sha256": digest})
    return applied


def inspect_catalog(conn: psycopg.Connection) -> None:
    pass


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--migrations", required=True)
    parser.add_argument("--receipt", required=True)
    args = parser.parse_args()

    dsn = env("F12_DATABASE_URL")
    proof = Proof()

    admin = admin_connection(dsn)
    bootstrap(admin)
    applied = apply_migrations(admin, Path(args.migrations))

    # Seed three users A/B/C.
    user_ids: dict[str, str] = {}
    for label in ("a", "b", "c"):
        row = admin_row(admin, "insert into auth.users default values returning id")
        user_ids[label] = str(row[0])

    # 1. catalog: owner + RLS enabled
    for table in ("teams", "team_members", "team_invites"):
        row = admin_row(
            admin,
            "select relowner::regrole::text, relrowsecurity from pg_class where relname = %s and relnamespace = 'public'::regnamespace",
            (table,),
        )
        proof.check(f"catalog:{table}", row is not None and row[0] == "postgres" and row[1] is True, f"{table} row={row}")

    # 2. helper functions: security definer + search_path, no user-id arg
    for fn in ("is_team_member", "team_role"):
        row = admin_row(
            admin,
            """
            select prosecdef, proconfig, pg_get_function_identity_arguments(oid)
              from pg_proc where proname = %s and pronamespace = 'public'::regnamespace
            """,
            (fn,),
        )
        ok = (
            row is not None
            and row[0] is True
            and row[1] is not None
            and any("search_path=pg_catalog, public, auth" in c for c in row[1])
            and row[2].strip() == "p_team uuid"
        )
        proof.check(f"helper:{fn}", ok, f"row={row}")

    conn_a = actor_connection(dsn, user_ids["a"])
    conn_b = actor_connection(dsn, user_ids["b"])
    conn_anon = actor_connection(dsn, None)

    # 3. A creates a team -> exactly one team_members row, role owner
    team_id = None
    with conn_a.cursor() as cur:
        cur.execute(
            "insert into public.teams (name, created_by) values (%s, %s) returning id",
            ("A-desk", user_ids["a"]),
        )
        team_id = cur.fetchone()[0]
    row = admin_row(
        admin,
        "select count(*), max(role), max(user_id::text) from public.team_members where team_id = %s",
        (team_id,),
    )
    proof.check("trigger:owner", row == (1, "owner", user_ids["a"]), f"row={row}")

    # 4. B cannot read A's team or membership rows
    with conn_b.cursor() as cur:
        cur.execute("select * from public.teams")
        proof.check("rls:b_cannot_read_teams", len(cur.fetchall()) == 0, "B saw A's teams")
        cur.execute("select * from public.team_members where team_id = %s", (team_id,))
        proof.check("rls:b_cannot_read_members", len(cur.fetchall()) == 0, "B saw A's membership rows")

    # 5/6. B cannot insert into team_members / teams for A's team
    def b_insert_member():
        with conn_b.cursor() as cur:
            cur.execute(
                "insert into public.team_members (team_id, user_id, role) values (%s, %s, 'member')",
                (team_id, user_ids["b"]),
            )

    proof.check("rls:b_cannot_insert_member", expect_database_error(b_insert_member), "insert did not raise")

    def b_insert_team_as_a():
        with conn_b.cursor() as cur:
            cur.execute(
                "insert into public.teams (name, created_by) values (%s, %s)",
                ("spoofed", user_ids["a"]),
            )

    proof.check("rls:b_cannot_insert_team_as_a", expect_database_error(b_insert_team_as_a), "insert did not raise")

    # 7. A adds B as member; B can now read; B (member) adding C raises
    with conn_a.cursor() as cur:
        cur.execute(
            "insert into public.team_members (team_id, user_id, role, invited_by) values (%s, %s, 'member', %s)",
            (team_id, user_ids["b"], user_ids["a"]),
        )
    with conn_b.cursor() as cur:
        cur.execute("select * from public.teams where id = %s", (team_id,))
        proof.check("rls:b_can_read_after_join", len(cur.fetchall()) == 1, "B still cannot read after joining")

    def b_member_adds_c():
        with conn_b.cursor() as cur:
            cur.execute(
                "insert into public.team_members (team_id, user_id, role) values (%s, %s, 'member')",
                (team_id, user_ids["c"]),
            )

    proof.check("rls:member_cannot_add", expect_database_error(b_member_adds_c), "member insert did not raise")

    # 8. A promotes B to admin; B adds C -> succeeds
    with conn_a.cursor() as cur:
        cur.execute(
            "update public.team_members set role = 'admin' where team_id = %s and user_id = %s",
            (team_id, user_ids["b"]),
        )
    with conn_b.cursor() as cur:
        cur.execute(
            "insert into public.team_members (team_id, user_id, role) values (%s, %s, 'member')",
            (team_id, user_ids["c"]),
        )
    row = admin_row(
        admin,
        "select count(*) from public.team_members where team_id = %s and user_id = %s",
        (team_id, user_ids["c"]),
    )
    proof.check("rls:admin_can_add", row == (1,), f"row={row}")

    # 9. anon: 0 rows on select, insert raises
    with conn_anon.cursor() as cur:
        for table in ("teams", "team_members", "team_invites"):
            cur.execute(sql.SQL("select * from public.{}").format(sql.Identifier(table)))
            proof.check(f"anon:select_{table}", len(cur.fetchall()) == 0, f"anon saw rows in {table}")

    def anon_insert():
        with conn_anon.cursor() as cur:
            cur.execute(
                "insert into public.teams (name, created_by) values (%s, %s)",
                ("anon-team", user_ids["a"]),
            )

    proof.check("anon:insert_raises", expect_database_error(anon_insert), "anon insert did not raise")

    # 10. non-admin member cannot select team_invites; token_hash uniqueness rejects duplicate
    with conn_a.cursor() as cur:
        cur.execute(
            "insert into public.team_invites (team_id, email, role, token_hash, invited_by, expires_at) values (%s, %s, 'member', %s, %s, now() + interval '14 days')",
            (team_id, "invitee@example.com", "deadbeef" * 8, user_ids["a"]),
        )
    with conn_b.cursor() as cur:
        # B is now admin, so per policy this SHOULD succeed for B; use a plain member instead.
        pass
    with conn_a.cursor() as cur:
        cur.execute(
            "update public.team_members set role = 'member' where team_id = %s and user_id = %s",
            (team_id, user_ids["c"]),
        )
    conn_c = actor_connection(dsn, user_ids["c"])
    with conn_c.cursor() as cur:
        cur.execute("select * from public.team_invites where team_id = %s", (team_id,))
        proof.check("rls:member_cannot_read_invites", len(cur.fetchall()) == 0, "member read invites")

    def dup_token():
        with conn_a.cursor() as cur:
            cur.execute(
                "insert into public.team_invites (team_id, email, role, token_hash, invited_by, expires_at) values (%s, %s, 'member', %s, %s, now() + interval '14 days')",
                (team_id, "other@example.com", "deadbeef" * 8, user_ids["a"]),
            )

    proof.check("unique:token_hash", expect_database_error(dup_token), "duplicate token_hash did not raise")

    # 11. no 42P17: RLS recursion is avoided because is_team_member/team_role are SECURITY DEFINER
    # (they bypass RLS internally instead of re-entering the policies that call them). Probe the
    # actual property in pg_proc rather than merely observing that earlier statements didn't raise.
    row = admin_row(
        admin,
        "select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
        "where n.nspname = 'public' and p.proname = 'is_team_member'",
    )
    proof.check("no_recursion", row == (True,), f"is_team_member not security definer: row={row}")

    # 12. re-runnability: apply 0014 a second time
    row_counts_before = admin_row(
        admin,
        "select (select count(*) from public.teams), (select count(*) from public.team_members), (select count(*) from public.team_invites)",
    )
    tenancy_file = Path(args.migrations) / "0014_tenancy_foundation.sql"
    with admin.cursor() as cur:
        cur.execute(tenancy_file.read_text())
    row_counts_after = admin_row(
        admin,
        "select (select count(*) from public.teams), (select count(*) from public.team_members), (select count(*) from public.team_invites)",
    )
    proof.check("rerun:idempotent", row_counts_before == row_counts_after, f"{row_counts_before} != {row_counts_after}")

    receipt = {
        "schema": "mastermind.f12-tenancy-canary/v1",
        "commit": env("F12_EXPECTED_COMMIT", required=False, default=""),
        "image": env("F12_EXPECTED_IMAGE", required=False, default=""),
        "postgres_version": env("F12_EXPECTED_POSTGRES", required=False, default=""),
        "migrations": applied,
        "assertions": proof.assertions,
        "verdicts": proof.verdicts,
        "run_id": env("F12_GITHUB_RUN_ID", required=False, default=""),
        "run_attempt": env("F12_GITHUB_RUN_ATTEMPT", required=False, default=""),
        "job": env("F12_GITHUB_JOB", required=False, default=""),
    }
    Path(args.receipt).write_text(json.dumps(receipt, indent=2))
    print(f"::notice title=f12-canary::{proof.assertions} assertions passed", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
