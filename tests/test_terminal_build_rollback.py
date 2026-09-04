"""Hostile contract for the deployment-identity rollback in ops/terminal-build.sh.

THE DEFECT THIS PINS (release integrity, not logging cosmetics)
--------------------------------------------------------------
`ops/terminal-build.sh` installs the new `.deployment-id` BEFORE it swaps `.next`.
When the post-restart health check fails it restores `.next.bak` — and nothing else.
After that automatic rollback the box is left in an incoherent state:

    live build      = the OLD one (restored from .next.bak)
    .gitsrc HEAD    = the NEW commit
    .deployment-id  = the NEW commit

Only `.next/BUILD_ID` still witnesses what is actually being served. Any verifier
that trusts "source HEAD == .deployment-id" therefore CERTIFIES A DEPLOY THAT WAS
ROLLED BACK. That is the bug; these tests exist so it cannot come back.

WHAT IS ASSERTED
----------------
The marker and the build move as ONE deploy generation, and deployment verification
fails closed unless all THREE identities agree: the intended full Git SHA, the live
`.deployment-id`, and the live `.next/BUILD_ID`.

HERMETIC BY CONSTRUCTION
------------------------
`ops/terminal-build.sh` hardcodes /opt/terminal, so the rollback state machine is
sourced — not executed — via the `TERMINAL_BUILD_LIB_ONLY` guard, and driven against
a temporary directory. Nothing here contacts the VPS, SSH, systemd, GitHub, Supabase
or the public site, and nothing reads or writes any real deploy root.

Structure is not trusted on its own: the static tests below assert the deploy body
performs no raw `$APP/.deployment-id` mutation outside the generation functions, so
re-inlining the original defect fails this contract. The two mutation tests prove the
restoration and the BUILD_ID comparison are load-bearing rather than decorative.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import textwrap
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
SCRIPT = REPO / "ops" / "terminal-build.sh"

OLD_SHA = "1111111111111111111111111111111111111111"
NEW_SHA = "2222222222222222222222222222222222222222"
OLD_BUILD_ID = "build-OLDoldOLDoldOL"
NEW_BUILD_ID = "build-NEWnewNEWnewNE"


# `bash` is present on every CI runner and on macOS. Requiring it rather than
# skipping is deliberate: a skip here would turn this whole contract into a silent
# no-op and the job would go green having proven nothing.
def _bash() -> str:
    found = shutil.which("bash")
    assert found, "bash is required to exercise the deploy contract"
    return found


def run_gen(script: Path, body: str) -> subprocess.CompletedProcess:
    """Source the deploy script as a library and run `body` against it."""
    driver = textwrap.dedent(
        f"""
        export TERMINAL_BUILD_LIB_ONLY=1
        . "{script}"
        set +e            # the script sets -e; the driver tests failure paths on purpose
        {textwrap.dedent(body)}
        """
    )
    return subprocess.run(
        [_bash(), "-c", driver], capture_output=True, text=True, timeout=60
    )


def make_app(tmp_path: Path, marker: str | None, marker_mode: int = 0o644,
             build_id: str | None = None) -> Path:
    app = tmp_path / "app"
    app.mkdir(exist_ok=True)
    if marker is not None:
        m = app / ".deployment-id"
        m.write_text(marker + "\n")
        m.chmod(marker_mode)
    if build_id is not None:
        nxt = app / ".next"
        nxt.mkdir()
        (nxt / "BUILD_ID").write_text(build_id + "\n")
    return app


def staged_marker(tmp_path: Path, sha: str) -> Path:
    p = tmp_path / "staged-deployment-id"
    p.write_text(sha + "\n")
    return p


def simulate_swap(app: Path, new_build_id: str) -> None:
    """The step-6 atomic swap: current .next -> .next.bak, new build -> .next."""
    nxt = app / ".next"
    if nxt.exists():
        nxt.rename(app / ".next.bak")
    nxt.mkdir()
    (nxt / "BUILD_ID").write_text(new_build_id + "\n")


def marker_of(app: Path) -> str | None:
    m = app / ".deployment-id"
    return m.read_text().strip() if m.exists() else None


def live_build_id(app: Path) -> str | None:
    b = app / ".next" / "BUILD_ID"
    return b.read_text().strip() if b.exists() else None


def artifacts(app: Path) -> list[str]:
    return sorted(
        p.name for p in app.iterdir()
        if p.name in (".deployment-id.bak", ".deployment-id.absent", ".deployment-id.new")
    )


# --------------------------------------------------------------------------
# the sourceable seam
# --------------------------------------------------------------------------

def test_lib_only_source_does_not_run_the_deploy():
    """Sourcing must expose the state machine without deploying anything."""
    r = run_gen(SCRIPT, 'echo SOURCED_OK')
    assert r.returncode == 0, f"sourcing failed:\n{r.stdout}\n{r.stderr}"
    assert "SOURCED_OK" in r.stdout
    # No step of the real deploy may have run.
    assert "[build]" not in r.stdout, f"deploy body executed while sourcing:\n{r.stdout}"


def test_generation_contract_is_exposed():
    r = run_gen(SCRIPT, """
        for fn in deploy_generation_reset deploy_generation_begin \\
                  deploy_generation_commit deploy_generation_rollback \\
                  deploy_identity_verified; do
          type -t "$fn" >/dev/null || { echo "MISSING:$fn"; exit 1; }
        done
        echo ALL_PRESENT
    """)
    assert "ALL_PRESENT" in r.stdout, f"contract not exposed:\n{r.stdout}\n{r.stderr}"


# --------------------------------------------------------------------------
# the rollback-state matrix required by issue #503
# --------------------------------------------------------------------------

def test_healthy_deploy_keeps_new_identity_and_clears_artifacts(tmp_path):
    app = make_app(tmp_path, OLD_SHA, build_id=OLD_BUILD_ID)
    new = staged_marker(tmp_path, NEW_SHA)
    r = run_gen(SCRIPT, f"""
        deploy_generation_begin "{app}" "{new}"
        deploy_generation_commit "{app}"
    """)
    assert r.returncode == 0, r.stderr
    assert marker_of(app) == NEW_SHA
    assert artifacts(app) == [], f"rollback artifacts survived a healthy deploy: {artifacts(app)}"


def test_rollback_with_prior_marker_restores_exact_bytes_and_metadata(tmp_path):
    """Failed health, prior marker present: old build AND old marker come back."""
    app = make_app(tmp_path, OLD_SHA, marker_mode=0o640, build_id=OLD_BUILD_ID)
    new = staged_marker(tmp_path, NEW_SHA)

    r = run_gen(SCRIPT, f'deploy_generation_begin "{app}" "{new}"')
    assert r.returncode == 0, r.stderr
    assert marker_of(app) == NEW_SHA, "begin must install the new marker"

    simulate_swap(app, NEW_BUILD_ID)

    r = run_gen(SCRIPT, f'deploy_generation_rollback "{app}"; echo "RC=$?"')
    assert "RC=0" in r.stdout, f"rollback reported unresolved:\n{r.stdout}\n{r.stderr}"

    # This is the assertion the shipped script fails today.
    assert marker_of(app) == OLD_SHA, (
        "marker was NOT restored — a rolled-back deploy still advertises the new commit"
    )
    assert live_build_id(app) == OLD_BUILD_ID, "old build was not restored"
    assert os.stat(app / ".deployment-id").st_mode & 0o777 == 0o640, (
        "marker metadata was not preserved by the snapshot"
    )
    assert artifacts(app) == [], f"rollback artifacts leaked: {artifacts(app)}"


def test_rollback_without_prior_marker_removes_the_new_marker(tmp_path):
    """Failed health, no prior marker: the marker must end up ABSENT, not new."""
    app = make_app(tmp_path, None, build_id=OLD_BUILD_ID)
    new = staged_marker(tmp_path, NEW_SHA)

    r = run_gen(SCRIPT, f'deploy_generation_begin "{app}" "{new}"')
    assert r.returncode == 0, r.stderr
    assert (app / ".deployment-id.absent").exists(), "absent sentinel not recorded"

    simulate_swap(app, NEW_BUILD_ID)
    r = run_gen(SCRIPT, f'deploy_generation_rollback "{app}"; echo "RC=$?"')
    assert "RC=0" in r.stdout, f"rollback reported unresolved:\n{r.stdout}\n{r.stderr}"

    assert marker_of(app) is None, (
        "a marker was invented for a build that never successfully deployed"
    )
    assert live_build_id(app) == OLD_BUILD_ID
    assert artifacts(app) == []


def test_swap_failure_after_marker_replacement_restores_marker(tmp_path):
    """Marker already replaced, new build never activated: still coherent."""
    app = make_app(tmp_path, OLD_SHA, build_id=OLD_BUILD_ID)
    new = staged_marker(tmp_path, NEW_SHA)

    r = run_gen(SCRIPT, f"""
        deploy_generation_begin "{app}" "{new}"
        deploy_generation_rollback "{app}"; echo "RC=$?"
    """)
    assert "RC=0" in r.stdout, f"{r.stdout}\n{r.stderr}"
    assert marker_of(app) == OLD_SHA
    assert live_build_id(app) == OLD_BUILD_ID, "untouched live build must stay untouched"
    assert artifacts(app) == []


def test_restart_health_failure_after_activation_restores_both(tmp_path):
    app = make_app(tmp_path, OLD_SHA, build_id=OLD_BUILD_ID)
    new = staged_marker(tmp_path, NEW_SHA)

    run_gen(SCRIPT, f'deploy_generation_begin "{app}" "{new}"')
    simulate_swap(app, NEW_BUILD_ID)
    r = run_gen(SCRIPT, f'deploy_generation_rollback "{app}"; echo "RC=$?"')

    assert "RC=0" in r.stdout, f"{r.stdout}\n{r.stderr}"
    assert marker_of(app) == OLD_SHA
    assert live_build_id(app) == OLD_BUILD_ID
    # the failed build is kept for diagnosis, not silently destroyed
    assert (app / ".next.broken" / "BUILD_ID").read_text().strip() == NEW_BUILD_ID


def test_stale_artifacts_are_purged_without_destroying_the_live_marker(tmp_path):
    """An interrupted prior attempt must not poison the next deploy's rollback."""
    app = make_app(tmp_path, OLD_SHA, build_id=OLD_BUILD_ID)
    (app / ".deployment-id.bak").write_text("dead-sha-from-an-interrupted-run\n")
    (app / ".deployment-id.absent").write_text("")
    (app / ".deployment-id.new").write_text("another-dead-sha\n")
    new = staged_marker(tmp_path, NEW_SHA)

    r = run_gen(SCRIPT, f'deploy_generation_begin "{app}" "{new}"')
    assert r.returncode == 0, r.stderr

    assert marker_of(app) == NEW_SHA, "the valid live marker was destroyed by the purge"
    assert (app / ".deployment-id.bak").read_text().strip() == OLD_SHA, (
        "stale .bak was reused as the rollback record — rollback would restore a dead SHA"
    )
    assert not (app / ".deployment-id.absent").exists(), (
        "stale absent sentinel survived; rollback would delete a valid marker"
    )
    assert not (app / ".deployment-id.new").exists()


def test_rollback_reports_unresolved_when_the_record_is_gone(tmp_path):
    """Restoration failure must be reported, never dressed up as a clean rollback."""
    app = make_app(tmp_path, OLD_SHA, build_id=OLD_BUILD_ID)
    new = staged_marker(tmp_path, NEW_SHA)

    run_gen(SCRIPT, f'deploy_generation_begin "{app}" "{new}"')
    simulate_swap(app, NEW_BUILD_ID)
    (app / ".deployment-id.bak").unlink()          # rollback record destroyed

    r = run_gen(SCRIPT, f'deploy_generation_rollback "{app}"; echo "RC=$?"')
    assert "RC=0" not in r.stdout, (
        "rollback claimed success while the identity state was unrecoverable"
    )


# --------------------------------------------------------------------------
# the fail-closed three-identity gate
# --------------------------------------------------------------------------

def test_identity_gate_accepts_only_full_agreement(tmp_path):
    app = make_app(tmp_path, NEW_SHA, build_id=NEW_BUILD_ID)
    r = run_gen(SCRIPT,
                f'deploy_identity_verified "{app}" "{NEW_SHA}" "{NEW_BUILD_ID}"; echo "RC=$?"')
    assert "RC=0" in r.stdout, f"a fully coherent deploy was rejected:\n{r.stdout}\n{r.stderr}"


def test_identity_gate_rejects_stale_build_id(tmp_path):
    """THE NAMED MUTANT: source HEAD == marker, but the OLD build is still serving."""
    app = make_app(tmp_path, NEW_SHA, build_id=OLD_BUILD_ID)
    r = run_gen(SCRIPT,
                f'deploy_identity_verified "{app}" "{NEW_SHA}" "{NEW_BUILD_ID}"; echo "RC=$?"')
    assert "RC=0" not in r.stdout, (
        "verification passed on marker agreement alone while a rolled-back build was live"
    )


def test_identity_gate_rejects_a_rolled_back_generation(tmp_path):
    """End-to-end: the state the old script certified as a successful deploy.

    This is the acceptance test for the whole repair. Note the BUILD_ID passed in is
    the one the *new* build would have — under Next 16.2.9 with deploymentId set,
    .next/BUILD_ID is a constant literal, so it is identical for the old and new
    build and cannot discriminate them. The rejection therefore has to come from the
    restored marker, which is precisely what this change makes trustworthy.
    """
    app = make_app(tmp_path, OLD_SHA, build_id=NEW_BUILD_ID)
    new = staged_marker(tmp_path, NEW_SHA)

    run_gen(SCRIPT, f'deploy_generation_begin "{app}" "{new}"')
    simulate_swap(app, NEW_BUILD_ID)
    run_gen(SCRIPT, f'deploy_generation_rollback "{app}"')

    r = run_gen(SCRIPT,
                f'deploy_identity_verified "{app}" "{NEW_SHA}" "{NEW_BUILD_ID}"; echo "RC=$?"')
    assert "RC=0" not in r.stdout, (
        "a rolled-back deploy was certified as successful — the P0 defect is back"
    )


def test_identity_gate_rejects_marker_mismatch(tmp_path):
    app = make_app(tmp_path, OLD_SHA, build_id=NEW_BUILD_ID)
    r = run_gen(SCRIPT,
                f'deploy_identity_verified "{app}" "{NEW_SHA}" "{NEW_BUILD_ID}"; echo "RC=$?"')
    assert "RC=0" not in r.stdout


def test_identity_gate_rejects_missing_build_id(tmp_path):
    app = make_app(tmp_path, NEW_SHA)
    r = run_gen(SCRIPT,
                f'deploy_identity_verified "{app}" "{NEW_SHA}" "{NEW_BUILD_ID}"; echo "RC=$?"')
    assert "RC=0" not in r.stdout


def test_identity_gate_rejects_missing_marker(tmp_path):
    app = make_app(tmp_path, None, build_id=NEW_BUILD_ID)
    r = run_gen(SCRIPT,
                f'deploy_identity_verified "{app}" "{NEW_SHA}" "{NEW_BUILD_ID}"; echo "RC=$?"')
    assert "RC=0" not in r.stdout


# --------------------------------------------------------------------------
# mutation kills — proof the logic above is load-bearing, not decorative
# --------------------------------------------------------------------------

def _mutate(tmp_path: Path, anchor: str, replacement: str) -> Path:
    text = SCRIPT.read_text()
    assert anchor in text, (
        f"mutation anchor vanished from ops/terminal-build.sh:\n{anchor!r}\n"
        "The mutation test cannot silently pass — update the anchor with the code."
    )
    mutant = tmp_path / "mutant-terminal-build.sh"
    mutant.write_text(text.replace(anchor, replacement, 1))
    mutant.chmod(0o755)
    return mutant


def test_mutant_without_marker_restoration_is_caught(tmp_path):
    """Delete the marker restoration -> the original defect must reappear."""
    mutant = _mutate(
        tmp_path,
        'mv -f "$app/.deployment-id.bak" "$app/.deployment-id"',
        ':  # MUTANT: marker restoration removed',
    )
    app = make_app(tmp_path, OLD_SHA, build_id=OLD_BUILD_ID)
    new = staged_marker(tmp_path, NEW_SHA)

    run_gen(mutant, f'deploy_generation_begin "{app}" "{new}"')
    simulate_swap(app, NEW_BUILD_ID)
    run_gen(mutant, f'deploy_generation_rollback "{app}"')

    # The mutant reproduces the exact production bug: old build, new marker.
    assert live_build_id(app) == OLD_BUILD_ID
    assert marker_of(app) == NEW_SHA, (
        "mutation was inert — the marker-restoration assertions are not load-bearing"
    )


def test_mutant_accepting_marker_only_agreement_is_caught(tmp_path):
    """Drop the BUILD_ID comparison -> the gate must start certifying a rolled-back build."""
    mutant = _mutate(
        tmp_path,
        '[ "$live_build" = "$want_build" ]',
        'true  # MUTANT: BUILD_ID agreement no longer required',
    )
    app = make_app(tmp_path, NEW_SHA, build_id=OLD_BUILD_ID)
    r = run_gen(mutant,
                f'deploy_identity_verified "{app}" "{NEW_SHA}" "{NEW_BUILD_ID}"; echo "RC=$?"')
    assert "RC=0" in r.stdout, (
        "mutation was inert — the BUILD_ID readback is not actually gating verification"
    )


# --------------------------------------------------------------------------
# static structure: the defect must not be re-inlined later
# --------------------------------------------------------------------------

def _deploy_body() -> str:
    text = SCRIPT.read_text()
    marker = "TERMINAL_BUILD_LIB_ONLY"
    idx = text.rindex(marker)
    return text[idx:]


def test_script_syntax_is_valid():
    r = subprocess.run([_bash(), "-n", str(SCRIPT)], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr


def test_deploy_body_never_mutates_the_marker_directly():
    """All marker writes go through the generation functions, which own rollback."""
    body = _deploy_body()
    assert '$APP/.deployment-id' not in body, (
        "the deploy body mutates $APP/.deployment-id directly; that is exactly how the "
        "marker escaped rollback in the first place"
    )


def test_health_failure_path_rolls_back_the_generation():
    body = _deploy_body()
    assert "deploy_generation_rollback" in body, "health failure does not roll back the generation"
    assert "deploy_identity_verified" in body, "the deploy does not run the three-identity gate"
    assert "deploy_generation_commit" in body, "rollback artifacts are never committed away"


def test_success_is_only_committed_after_the_identity_gate():
    body = _deploy_body()
    assert body.index("deploy_identity_verified") < body.index("deploy_generation_commit"), (
        "artifacts are cleared before the three identities are checked — rollback would be "
        "impossible by the time the deploy discovers it is incoherent"
    )


def test_identity_report_names_all_three(tmp_path):
    """Behavioural: one reporter, and it cannot report only two of the three."""
    app = make_app(tmp_path, NEW_SHA, build_id=OLD_BUILD_ID)
    r = run_gen(SCRIPT, f'deploy_identity_line "{app}" "{NEW_SHA}"')
    out = r.stdout
    assert NEW_SHA in out, "intended SHA missing from the identity report"
    assert OLD_BUILD_ID in out, "live BUILD_ID missing from the identity report"
    assert "marker=" in out, "live marker missing from the identity report"


def test_identity_report_marks_a_missing_marker_absent(tmp_path):
    app = make_app(tmp_path, None, build_id=OLD_BUILD_ID)
    r = run_gen(SCRIPT, f'deploy_identity_line "{app}" "{NEW_SHA}"')
    assert "marker=<absent>" in r.stdout, (
        "a missing marker must be reported as absent, never as blank agreement"
    )


def test_both_outcomes_report_the_full_identity_triple():
    body = _deploy_body()
    assert body.count("deploy_identity_line") >= 2, (
        "success and failure must both report intended SHA, live marker and live BUILD_ID"
    )
