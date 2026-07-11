"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLang, useT } from "@/lib/i18n";
import {
  type MarketPlane,
  type Tone,
  cortexTone,
  isStalePlane,
  liqLabel,
  prettyToken,
  verdictTone,
  volLabel,
} from "@/lib/nwPlane";

// Compact Neural Web macro strip for the chart topbar — verdict pill + regime quad + vol +
// liquidity + cortex health dot, fed by /api/nw (market_plane.json). Display-only context:
// greyed when the producer marks the feed stale, hidden entirely while the feed is absent.
// The whole strip links out to the Macro Dashboard for the full read.

const TONE_COLOR: Record<Tone, string> = {
  up: "var(--up)",
  down: "var(--down)",
  warn: "var(--signal)",
  muted: "var(--muted)",
};

const POLL_MS = 300_000; // producer republishes at most every 5 min (max-age=300)

export default function NeuralWebStrip() {
  const t = useT();
  const { lang } = useLang();
  // Staleness is judged against the clock at poll time (5-min cadence vs a 4-day
  // threshold), keeping render pure for the react-hooks/purity rule.
  const [state, setState] = useState<{ plane: MarketPlane; stale: boolean } | null>(null);
  const aliveRef = useRef(false);

  const poll = useCallback(() => {
    fetch("/api/nw?f=market_plane")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: MarketPlane | null) => {
        if (!aliveRef.current) return;
        setState(d && d.verdict ? { plane: d, stale: isStalePlane(d, Date.now()) } : null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      aliveRef.current = false;
      clearInterval(id);
    };
  }, [poll]);

  if (!state) return null;

  const { plane, stale } = state;
  const v = plane.verdict ?? {};
  const vTone = verdictTone(v.verdict);
  const vLabel = (lang === "zh" ? v.label_zh : v.label_en) || prettyToken(v.verdict);
  const reg = plane.regime ?? {};
  const vol = plane.vol ?? {};
  const liq = plane.liquidity_plumbing ?? {};
  const cortex = plane.cortex ?? {};
  const cTone = cortexTone(cortex.status);

  const regimeTip = [
    `${prettyToken(reg.transition_state)} · ${t("nwConfidence")} ${reg.confidence != null ? Math.round(reg.confidence * 100) + "%" : "—"}`,
    reg.cycle_tag ? `${t("nwCycle")}: ${prettyToken(reg.cycle_tag)}` : "",
    reg.liquidity_overlay ? `${t("nwLiq")}: ${liqLabel(reg.liquidity_overlay, lang)}` : "",
  ].filter(Boolean).join("\n");
  const liqTip = [
    `${t("nwLiq")}: ${liqLabel(liq.state, lang)}`,
    liq.netliq_bn != null ? `NetLiq $${Math.round(liq.netliq_bn)}bn (Δ20d ${liq.netliq_d20_bn != null && liq.netliq_d20_bn >= 0 ? "+" : ""}${liq.netliq_d20_bn != null ? Math.round(liq.netliq_d20_bn) : "—"}bn)` : "",
    liq.rrp_buffer_state ? `RRP: ${prettyToken(liq.rrp_buffer_state)}` : "",
    liq.tga_bn != null ? `TGA $${Math.round(liq.tga_bn)}bn` : "",
  ].filter(Boolean).join("\n");
  const cortexTip = `Cortex: ${prettyToken(cortex.status)}${cortex.degradation_reason ? ` — ${cortex.degradation_reason}` : ""}`;

  return (
    <a
      className={`nw-strip${stale ? " stale" : ""}`}
      href="https://mastermind-x.com"
      target="_blank"
      rel="noopener noreferrer"
      title={`${t("nwTip")}${stale ? `\n(${t("nwStale")} · as of ${plane.asof ?? "?"})` : ""}`}
    >
      <span
        className="nw-chip nw-verdict"
        style={{ color: TONE_COLOR[vTone], borderColor: "currentColor" }}
      >
        <i />
        {vLabel}
        {v.score != null && <b className="num nw-score">{v.score}</b>}
      </span>
      {reg.quad && (
        <span className="nw-chip" title={regimeTip}>
          {reg.quad}
          {reg.quad_name ? ` · ${reg.quad_name}` : ""}
        </span>
      )}
      {vol.regime && (
        <span className="nw-chip nw-sec" title={`${t("nwVol")} · risk ${vol.risk_score != null ? Math.round(vol.risk_score * 100) : "—"}/100`}>
          {t("nwVol")} {volLabel(vol.regime, lang)}
        </span>
      )}
      {liq.state && (
        <span className="nw-chip nw-sec" title={liqTip}>
          {t("nwLiq")} {liqLabel(liq.state, lang)}
        </span>
      )}
      <span className="nw-dot" style={{ background: TONE_COLOR[cTone] }} title={cortexTip} />
    </a>
  );
}
