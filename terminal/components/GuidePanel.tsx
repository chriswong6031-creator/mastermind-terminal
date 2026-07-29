"use client";
// GuidePanel — the in-Terminal indicator guide surface (premium suites program).
//
// Renders one module's written guide in a right-side sheet. Guides are plain markdown files served
// statically from `terminal/public/guides/<suite>/<module>.<lang>.md`; there is no API, no CMS and no
// build step — writing a guide means adding a file. The panel fetches the viewer's language first and
// falls back to English when the localized file does not exist yet, showing an "EN" chip so the
// fallback is visible rather than silent.
//
// Deliberately NOT a focus trap: the guide is a reading surface that opens beside the settings dialog
// it was launched from, and trapping focus here would strand keyboard users away from the controls
// they are reading about. Escape and a scrim click both close it.

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { mdToHtml } from "@/lib/md";
import { useLang, useT } from "@/lib/i18n";

export interface GuidePanelProps {
  suiteKey: string;
  moduleKey: string;
  moduleLabel: string;
  onClose: () => void;
}

type Status = "loading" | "ready" | "missing";

const guideUrl = (suiteKey: string, moduleKey: string, lang: string) =>
  `/guides/${encodeURIComponent(suiteKey)}/${encodeURIComponent(moduleKey)}.${lang}.md`;

// A missing file under public/ can come back as the app's HTML 404 shell — and an edge cache can hand
// that shell back with a 200. Anything that opens like markup is therefore treated as "not written
// yet" rather than rendered as a guide.
function looksLikeMarkdown(s: string): boolean {
  const head = s.trimStart().slice(0, 200).toLowerCase();
  if (!head) return false;
  return !head.startsWith("<!doctype") && !head.startsWith("<html") && !head.startsWith("<?xml");
}

async function fetchGuide(url: string, signal: AbortSignal): Promise<string | null> {
  try {
    const r = await fetch(url, { signal });
    if (!r.ok) return null;
    const txt = await r.text();
    return looksLikeMarkdown(txt) ? txt : null;
  } catch {
    return null; // network error or abort — callers check the abort flag before acting on this
  }
}

export default function GuidePanel({ suiteKey, moduleKey, moduleLabel, onClose }: GuidePanelProps) {
  const { lang } = useLang();
  const t = useT();
  const [status, setStatus] = useState<Status>("loading");
  const [html, setHtml] = useState("");
  const [docTitle, setDocTitle] = useState<string | null>(null);   // guide's own H1 — localized, wins over the EN registry label
  const [enFallback, setEnFallback] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setStatus("loading");
    setHtml(""); setDocTitle(null);
    setEnFallback(false);
    (async () => {
      let txt = await fetchGuide(guideUrl(suiteKey, moduleKey, lang), ac.signal);
      let fell = false;
      if (txt == null && lang !== "en") {
        txt = await fetchGuide(guideUrl(suiteKey, moduleKey, "en"), ac.signal);
        fell = txt != null;
      }
      if (ac.signal.aborted) return;
      if (txt == null) { setStatus("missing"); return; }
      const h1 = /^#\s+(.+)$/m.exec(txt);
      setDocTitle(h1 ? h1[1].trim() : null);
      setHtml(mdToHtml(txt));
      setEnFallback(fell);
      setStatus("ready");
    })();
    return () => ac.abort();
  }, [suiteKey, moduleKey, lang]);

  // Escape closes. Capture phase + stopPropagation so the dialog underneath (which listens on the
  // same window) does not close along with the guide.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // Move focus into the sheet once so a keyboard/screen-reader user lands on the guide they opened.
  // No trap: Tab walks straight back out into the page.
  useEffect(() => { sheetRef.current?.focus(); }, []);

  const onScrim = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  return (
    <div className="gp-scrim" onMouseDown={onScrim}>
      <div
        ref={sheetRef}
        className="gp-sheet"
        role="dialog"
        aria-label={`${moduleLabel} — ${t("guideOpen", "Guide")}`}
        tabIndex={-1}
      >
        <div className="gp-head">
          <span className="gp-title">{docTitle ?? moduleLabel}</span>
          {enFallback && (
            <span className="gp-enchip" title={t("guideEnFallback", "English guide — no Chinese version yet.")}>EN</span>
          )}
          <button className="gp-close" onClick={onClose} aria-label={t("guideClose", "Close")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="gp-body">
          {status === "loading" && (
            <div className="gp-skel" aria-hidden="true"><span /><span /><span /></div>
          )}
          {status === "missing" && (
            <p className="gp-empty">{t("guideMissing", "Guide not written yet.")}</p>
          )}
          {status === "ready" && <div dangerouslySetInnerHTML={{ __html: html }} />}
        </div>
      </div>
    </div>
  );
}
