# indicator_engine/ — the Pine-style runtime (Phase 1)

The user authors indicators in Pine; this sidecar runs them on our OHLC and emits the
`mastermind.indicator/v1` contract. Pine cannot be executed off TradingView, so we use a
**clean-room Pine engine**, not TradingView's runtime.

## The AGPL firewall (decision D3 — do not skip)

**PineTS is AGPL-3.0.** Its network-copyleft clause can pull a linked service into the
same license. So PineTS runs as a **separate Node process** here, and the FastAPI/macro
Python talks to it **only over an HTTP/JSON boundary**:

```
POST /run  { "script": "<pine src>", "ohlc": {...}, "params": {...} }
       →   { "series": {...}, "signals": [...] }     # never the Pine source back out
```

Rules:
- **Pin a COMMIT hash**, not a version tag — a single owner can relicense.
- Node `node:vm` / `vm2` are **not** security sandboxes. Only use `isolated-vm` if/when
  untrusted third parties author scripts. For now (you + Opus author), defer hardening.
- For a single-user, internal, non-distributed tool the firewall is almost certainly
  fine; **if this is ever shared/hosted, get the AGPL boundary reviewed** (P1-5).

## PyneCore (Apache-2.0) — the clean in-process path

For indicators that can live in Python, **PyneCore** imports directly into the vendored
`engine/` with zero IPC and no license entanglement. Prefer it where it covers the math.

## The trust gate (mandatory)

Every registered engine is diffed against `signal_layer/confluence.py` via
`signal_layer/golden_gate.py` on a **real-OHLC** symbol before it is trusted to emit a
contract. Divergence fails the registration — same evidence-gate discipline as the macro
repo's `risk_radar_backtest.py`.
