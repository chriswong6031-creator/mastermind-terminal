"use client";
import { useEffect, useRef } from "react";
import { handoffMastermindBrainSymbol, type MastermindBrainHost } from "@/lib/mastermindBrain";

// Mounts the production Mastermind Brain widget (mm_brain.js) into the Terminal, replacing
// the old CopilotPanel. The widget is a self-contained IIFE that reads window.MM_BRAIN_CFG
// BEFORE it loads, then exposes window.MMBrain = {open, close, toggle, expand, explain, mounted}.
//
// It calls /api/brain/* same-origin with credentials:'include' and NO Authorization header —
// the Terminal has no window.MDXAuth — so the server proxy (app/api/brain/[...path]) injects
// the Bearer from the verified Supabase session.

const SCRIPT_SRC = "https://www.mastermind-x.com/mm_brain.js";

type Props = {
  active: string;
  onCommand: (j: any) => void;
  onAnnotate: (j: any) => void;
  onAuthRequired?: () => void;
};

export default function BrainWidget({
  active,
  onCommand,
  onAnnotate,
  onAuthRequired,
}: Props) {
  // Keep refs current so the CFG getters/callbacks read live values and never see a stale
  // closure from mount time (the config object is captured by the widget exactly once).
  const symRef = useRef(active);
  const onCommandRef = useRef(onCommand);
  const onAnnotateRef = useRef(onAnnotate);
  const onAuthRequiredRef = useRef(onAuthRequired);

  useEffect(() => {
    symRef.current = active;
    // The script is a document-level singleton and can outlive this component
    // during a client-side /terminal -> /analysis navigation.  Rebind the
    // shared getter on every active-symbol change so a subsequent handoff
    // cannot keep querying an unmounted component's stale ref.
    handoffMastermindBrainSymbol(active);
  }, [active]);
  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);
  useEffect(() => {
    onAnnotateRef.current = onAnnotate;
  }, [onAnnotate]);
  useEffect(() => {
    onAuthRequiredRef.current = onAuthRequired;
  }, [onAuthRequired]);

  // Load the widget exactly once per document. StrictMode double-invokes effects in dev,
  // and the widget itself is a singleton — guard on both the mounted flag and an existing tag.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as MastermindBrainHost;
    if (w.MMBrain?.mounted) return;
    if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) return;

    w.MM_BRAIN_CFG = {
      anchor: "top", // no built-in launcher; host calls window.MMBrain.open()/.toggle()
      api: "", // same-origin — /api/brain/* with credentials:'include'
      symbol: () => w.__MM_BRAIN_ACTIVE_SYMBOL__ || symRef.current,
      onCommand: (j: any) => onCommandRef.current?.(j),
      onAnnotate: (j: any) => onAnnotateRef.current?.(j),
      onAuthRequired: () => onAuthRequiredRef.current?.(),
    };

    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.defer = true;
    document.body.appendChild(s);
    // Intentionally NOT removed on unmount: the widget is a document-level singleton and
    // TerminalShell is the only mount site; tearing the script down would orphan window.MMBrain.
  }, []);

  return null;
}
