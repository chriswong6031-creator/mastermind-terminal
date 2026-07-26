"use client";
/**
 * EodContextBelt — the settled-close context row on the Exposure Desk (OEU T-E).
 *
 * One horizontal belt: the Structure strip (walls / flip / expected move / max pain / IV
 * percentile / OI confirmation) plus the Dark Pool mini-panel for the same root. It sits
 * directly under GexSummaryBar and above the ladder + Market State pane.
 *
 * WHY BOTH SURFACES SHARE ONE ROW
 *   They are the same fact about the same ticker at the same cadence: what the close left
 *   behind. Splitting them across two tabs would have meant a second ticker selector, a
 *   second fetch lifecycle, and a reader who has to remember that the two are related. The
 *   desk already owns the root, so the belt inherits it and stays a single insertion point.
 *
 * FETCH SPLIT
 *   gex_state and the gex ladder payload arrive as PROPS — the desk already holds both, and
 *   re-fetching them here would double the desk's traffic and let the belt drift a poll
 *   behind the summary bar above it. The three stores the desk does not already read
 *   (dark pool, expected move, per-root IV) plus the OI-confirmation feed are fetched here,
 *   through the shared flowGet cache, so the belt owns exactly what it introduces.
 *
 *   `darkpool` and `oiconf` are whole-universe artifacts: fetched once on mount, indexed by
 *   root on the client. Only `moves:` and `vol:` re-fetch when the ticker changes.
 */

import React, { useEffect, useState } from "react";
import { flowGet } from "@/lib/flowClientCache";
import type { Lang } from "@/lib/i18n";
import { StructureStrip } from "./StructureStrip";
import { DarkPoolMini } from "./DarkPoolMini";
import type {
  DarkPoolEodPayload,
  MovesPayload,
  OiConfPayload,
  OiConfRow,
  StructureGex,
  StructureGexState,
  VolPayload,
} from "@/lib/eodContext";

interface EodContextBeltProps {
  root: string;
  gexState: StructureGexState | null;
  gex: StructureGex | null;
  lang: Lang;
}

async function get<T>(f: string): Promise<T | null> {
  try {
    return ((await flowGet(f)) as T) ?? null;
  } catch {
    return null;
  }
}

export function EodContextBelt({ root, gexState, gex, lang }: EodContextBeltProps) {
  const [darkpool, setDarkpool] = useState<DarkPoolEodPayload | null>(null);
  const [dpLoading, setDpLoading] = useState(true);
  const [oiConf, setOiConf] = useState<OiConfPayload | OiConfRow[] | null>(null);
  const [perRoot, setPerRoot] = useState<{
    root: string;
    moves: MovesPayload | null;
    vol: VolPayload | null;
  } | null>(null);

  // Universe-wide artifacts — once per mount, indexed by root client-side.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [dp, oc] = await Promise.all([
        get<DarkPoolEodPayload>("darkpool"),
        get<OiConfPayload | OiConfRow[]>("oiconf"),
      ]);
      if (!alive) return;
      setDarkpool(dp);
      setDpLoading(false);
      setOiConf(oc);
    })();
    return () => { alive = false; };
  }, []);

  // Per-root stores, STORED WITH THE ROOT THEY DESCRIBE.
  //
  // The belt must never show the previous ticker's expected move under the new ticker's
  // name, not even for one frame. Clearing state in the effect would do that but costs a
  // cascading render (and is only as good as the effect's timing); tagging the payload with
  // its root makes the guard structural — mismatched data is unrenderable by construction.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [mv, vl] = await Promise.all([
        get<MovesPayload>(`moves:${root}`),
        get<VolPayload>(`vol:${root}`),
      ]);
      if (!alive) return;
      setPerRoot({ root, moves: mv, vol: vl });
    })();
    return () => { alive = false; };
  }, [root]);

  const moves = perRoot?.root === root ? perRoot.moves : null;
  const vol = perRoot?.root === root ? perRoot.vol : null;

  return (
    <div style={BELT}>
      <StructureStrip
        root={root}
        gexState={gexState}
        gex={gex}
        moves={moves}
        vol={vol}
        oiConf={oiConf}
        lang={lang}
      />
      <DarkPoolMini root={root} payload={darkpool} loading={dpLoading} lang={lang} />
    </div>
  );
}

const BELT: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "stretch",
  borderBottom: "1px solid var(--line)",
  background: "var(--panel)",
  flexShrink: 0,
};
