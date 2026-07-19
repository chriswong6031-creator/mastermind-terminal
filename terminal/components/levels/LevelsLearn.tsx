"use client";
/**
 * LevelsLearn — the Learn academy seed for the Levels board (WP-A3).
 *
 * Six short, original lessons in plain English. Written from scratch for this
 * board — no copy borrowed from any other site. Institutional dark aesthetic.
 * The whole point is honesty: this teaches what the map is AND what it is not.
 */

import React from "react";
import Link from "next/link";
import { BrandLockup } from "@/components/BrandMark";

interface Lesson {
  glyph: string;
  eyebrow: string;
  title: string;
  body: React.ReactNode;
}

const LESSONS: Lesson[] = [
  {
    glyph: "≈",
    eyebrow: "The idea",
    title: "Why price gets sticky or slippery",
    body: (
      <>
        Big options positions have to be hedged, and the people on the other side
        of them buy and sell the underlying stock to stay balanced as it moves.
        When that hedging <em>leans against</em> the move — selling into strength,
        buying into weakness — price tends to slow down and hold. We call that
        <b> sticky</b>. When the hedging <em>chases</em> the move instead — buying
        higher, selling lower — price tends to speed up and slide. We call that
        <b> slippery</b>. The map colors every strike by which kind of terrain it is.
      </>
    ),
  },
  {
    glyph: "★",
    eyebrow: "The anchor",
    title: "The Keystone",
    body: (
      <>
        One strike usually carries more dealer hedging than any other. That is the
        <b> Keystone</b> — the day&apos;s biggest magnet. Price is often drawn toward
        it and tends to settle near it, because that is where hedging pressure is
        heaviest. It is the first thing to find on the map, and everything else is
        read relative to it. Brighter and wider means more weight; the Keystone is
        the brightest rung by definition.
      </>
    ),
  },
  {
    glyph: "▔▁",
    eyebrow: "The edges",
    title: "Ceiling vs. Floor — and why a Floor isn't support",
    body: (
      <>
        The <b>Ceiling</b> is the heavy strike above price where hedging tends to
        lean against a push higher — a spot where upside can stall. The <b>Floor</b>
        is the heavy strike below price. Here is the honest part: a Floor is not the
        same as support. It marks where hedging turns <em>slippery</em>, so a move
        down through it can pick up speed rather than get cushioned. Treat the Floor
        as a place where the terrain changes, not a place that catches you.
      </>
    ),
  },
  {
    glyph: "⚡",
    eyebrow: "The boundary",
    title: "The Flip — calm above, wild below",
    body: (
      <>
        The <b>Flip</b> is the price where the net hedging effect crosses from one
        kind to the other. Above it the tape tends to run <b>calm</b> (sticky terrain,
        moves fade). Below it the tape tends to run <b>wild</b> (slippery terrain,
        moves extend). It is a boundary line on the map, not a level with weight of
        its own — which is why it shows as a dashed line rather than a colored rung.
      </>
    ),
  },
  {
    glyph: "◆ ≋",
    eyebrow: "The texture",
    title: "Clusters and Voids",
    body: (
      <>
        A <b>Cluster</b> is a secondary magnet — a strike stacked with enough hedging
        to act like a smaller Keystone. A <b>Void</b> is the opposite: a stretch of
        strikes with almost no dealer gamma. Because there is little hedging friction
        in a Void, price can travel across that band quickly once it enters — think
        of it as thin air between rungs. Clusters are where the map is dense; Voids
        are where it is empty.
      </>
    ),
  },
  {
    glyph: "◑",
    eyebrow: "The fine print",
    title: "Positioning, not prophecy",
    body: (
      <>
        This board shows <b>locations where dealer hedging concentrates</b> — it does
        not predict direction or tell you what to do. Three honest limits worth
        keeping in mind: the underlying open-interest data <b>updates once a day</b>,
        so the map is a snapshot, not a live read. The dealer-sign convention (who is
        long or short what) is <b>assumed, not measured</b> — a standard convention
        applied to the visible options, not confirmed inventory. And a level marks a
        tendency, never a guarantee. Read it as a weather map, not a schedule.
      </>
    ),
  },
];

export function LevelsLearn() {
  return (
    <div style={PAGE}>
      <header style={TOPBAR}>
        <Link href="/options?tab=levels" style={{ textDecoration: "none" }}>
          <BrandLockup />
        </Link>
        <Link href="/options?tab=levels" style={BACK_LINK}>← Back to the board</Link>
      </header>

      <main style={MAIN}>
        <div style={HERO}>
          <div style={HERO_EYEBROW}>Levels · learn the board</div>
          <h1 style={HERO_TITLE}>The gamma weather map, in six reads</h1>
          <p style={HERO_SUB}>
            The Levels board maps where dealer hedging concentrates on a stock&apos;s
            options — the terrain that tends to make price hold or slide. It is
            display-only context: positioning, not prophecy. Here is how to read it.
          </p>
        </div>

        <ol style={LIST}>
          {LESSONS.map((l, i) => (
            <li key={i} style={CARD}>
              <div style={CARD_RAIL}>
                <span style={CARD_NUM}>{String(i + 1).padStart(2, "0")}</span>
                <span style={CARD_GLYPH}>{l.glyph}</span>
              </div>
              <div style={CARD_BODY}>
                <div style={CARD_EYEBROW}>{l.eyebrow}</div>
                <h2 style={CARD_TITLE}>{l.title}</h2>
                <p style={CARD_TEXT}>{l.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div style={FOOT}>
          <Link href="/options?tab=levels" style={FOOT_CTA}>Open the Levels board →</Link>
          <span style={FOOT_NOTE}>
            Display-only market structure. Not investment advice.
          </span>
        </div>
      </main>
    </div>
  );
}

// ─── Styles (theme tokens from app/globals.css) ───────────────────────────────

const PAGE: React.CSSProperties = {
  minHeight: "100vh", background: "var(--bg)", color: "var(--text)",
  fontFamily: "var(--font-ui)",
};
const TOPBAR: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "12px 20px", borderBottom: "1px solid var(--line)", background: "var(--panel)",
  position: "sticky", top: 0, zIndex: 5,
};
const BACK_LINK: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 600, color: "var(--link)", textDecoration: "none",
};
const MAIN: React.CSSProperties = { maxWidth: 760, margin: "0 auto", padding: "40px 20px 72px" };

const HERO: React.CSSProperties = { marginBottom: 34 };
const HERO_EYEBROW: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
  color: "var(--brand-2)", marginBottom: 12,
};
const HERO_TITLE: React.CSSProperties = {
  fontSize: 30, lineHeight: 1.15, fontWeight: 800, letterSpacing: "-0.02em",
  color: "var(--text)", margin: "0 0 14px",
};
const HERO_SUB: React.CSSProperties = {
  fontSize: 15, lineHeight: 1.6, color: "var(--text-2)", margin: 0, maxWidth: 620,
};

const LIST: React.CSSProperties = { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 };
const CARD: React.CSSProperties = {
  display: "flex", gap: 18, padding: "20px 20px", background: "var(--panel)",
  border: "1px solid var(--line)", borderRadius: "var(--r-lg)",
};
const CARD_RAIL: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center", gap: 10, flexShrink: 0, width: 40,
};
const CARD_NUM: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: "var(--text-dim)", fontFamily: "var(--font-num)", letterSpacing: "0.02em",
};
const CARD_GLYPH: React.CSSProperties = {
  fontSize: 20, color: "var(--brand-2)", lineHeight: 1, textAlign: "center",
};
const CARD_BODY: React.CSSProperties = { flex: 1, minWidth: 0 };
const CARD_EYEBROW: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase",
  color: "var(--muted)", marginBottom: 6,
};
const CARD_TITLE: React.CSSProperties = {
  fontSize: 17, fontWeight: 700, color: "var(--text)", margin: "0 0 9px", letterSpacing: "-0.01em",
};
const CARD_TEXT: React.CSSProperties = { fontSize: 14, lineHeight: 1.62, color: "var(--text-2)", margin: 0 };

const FOOT: React.CSSProperties = {
  marginTop: 34, paddingTop: 22, borderTop: "1px solid var(--line)",
  display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
};
const FOOT_CTA: React.CSSProperties = {
  fontSize: 14, fontWeight: 700, color: "var(--link)", textDecoration: "none",
};
const FOOT_NOTE: React.CSSProperties = { fontSize: 11.5, color: "var(--muted)" };
