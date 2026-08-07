"use client";
/**
 * MscCard — shared chrome for every Positioning-tab card (2026-08-01 production sweep).
 *
 * DESIGN RULES this component enforces, born from the operator's review of the first
 * pass ("large amount of useless text… awkward structure"):
 *
 *   1. A card's explanation is ONE Tip on an ⓘ dot, never a permanent paragraph.
 *      The old LEAD paragraphs cost 2–3 lines on all thirteen cards before a single
 *      number appeared.
 *   2. A card carries AT MOST one visible foot line — the disclosure that is
 *      honesty-required (convention, window, coverage). Everything else joins the ⓘ.
 *   3. The tier chip stays: it is the product's honesty differentiator. Its Tip
 *      carries the tier rationale.
 *   4. `grow` marks the element that should absorb spare height when a curated row
 *      pairs this card with a taller neighbour — charts grow, tables do not, and the
 *      old giant bottom voids disappear.
 *
 * i18n: title/tips arrive as plain strings resolved by the caller's makeMscT(lang) —
 * this component never touches the LEX table. No translated string in title= attrs
 * (CI-guarded): tooltips go through <Tip>.
 */

import React from "react";
import { Tip } from "@/components/ui/Tip";
import s from "./msc.module.css";

export function MscCard({
  title,
  info,
  tier,
  tierWhy,
  headRight,
  span,
  children,
}: {
  title: string;
  /** The card's one-paragraph explanation — rendered as a Tip on the ⓘ dot. */
  info?: string;
  tier?: string;
  tierWhy?: string;
  /** Extra chrome (chips, unit labels) on the header's right, before the tier chip. */
  headRight?: React.ReactNode;
  /** Grid span class: 3|4|5|6|7|8|12. */
  span: 3 | 4 | 5 | 6 | 7 | 8 | 12;
  children: React.ReactNode;
}) {
  return (
    <section className={`${s.card} ${SPAN_CLASS[span]}`}>
      <header className={s.cardHd}>
        <span className={s.cardTitle}>{title}</span>
        {info && (
          <Tip label={info} side="top" size="card">
            <i className={s.infoDot} tabIndex={0} aria-label={info}>
              i
            </i>
          </Tip>
        )}
        <span className={s.cardHdRight}>
          {headRight}
          {tier &&
            (tierWhy ? (
              <Tip label={tierWhy} side="top" size="card">
                <span className={s.tierChip} tabIndex={0}>
                  {tier}
                </span>
              </Tip>
            ) : (
              <span className={s.tierChip}>{tier}</span>
            ))}
        </span>
      </header>
      {children}
    </section>
  );
}

const SPAN_CLASS: Record<3 | 4 | 5 | 6 | 7 | 8 | 12, string> = {
  3: s.s3,
  4: s.s4,
  5: s.s5,
  6: s.s6,
  7: s.s7,
  8: s.s8,
  12: s.s12,
};

/** Labelled hairline separating the tab's three narrative sections. */
export function SectionRule({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className={s.rule} role="presentation">
      <span className={s.ruleLabel}>{label}</span>
      {hint && <span className={s.ruleHint}>{hint}</span>}
    </div>
  );
}

/** Flexible filler pushing the foot to the card's bottom edge in curated rows. */
export function CardSpacer() {
  return <div className={s.spacer} aria-hidden />;
}

/** The single visible provenance/disclosure line a card is allowed. */
export function CardFoot({ children }: { children: React.ReactNode }) {
  return <p className={s.foot}>{children}</p>;
}
