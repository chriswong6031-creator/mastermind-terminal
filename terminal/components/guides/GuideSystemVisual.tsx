"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  localizeSystemGuide,
  type SystemGuideDescriptor,
} from "@/lib/guides/systems/registry";
import type { GuideLanguage } from "@/lib/guides/experience";
import {
  getSuiteModuleCatalogEntry,
  suiteModuleId,
} from "@/lib/suites/catalog";

interface GuideSystemVisualProps {
  descriptor: SystemGuideDescriptor;
  lang: GuideLanguage;
}

const PATHS: Record<string, string> = {
  structure: "M24 150 C75 145 88 113 132 121 S196 96 232 105 S287 57 334 69 S395 38 456 51",
  trend: "M24 158 C70 155 93 139 126 143 S184 115 218 119 S273 89 309 94 S365 60 456 53",
  pulse: "M24 119 C58 86 83 161 119 126 S178 79 214 119 S272 166 307 124 S365 76 456 110",
  rsix: "M24 141 C76 135 91 92 134 107 S193 151 234 125 S286 76 324 91 S391 131 456 105",
  macdx: "M24 145 C70 152 91 132 128 137 S185 94 224 108 S280 68 317 82 S373 119 456 84",
};

export default function GuideSystemVisual({
  descriptor,
  lang,
}: GuideSystemVisualProps) {
  const reducedMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => (
    typeof document === "undefined" || document.visibilityState === "visible"
  ));
  const [stage, setStage] = useState(reducedMotion ? descriptor.workflow.length - 1 : 0);
  const [playing, setPlaying] = useState(!reducedMotion);
  const [manuallySelected, setManuallySelected] = useState(false);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.intersectionRatio >= 0.35),
      { threshold: 0.35 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    if (!visible || !pageVisible || !playing || reducedMotion) return;
    const last = descriptor.workflow.length - 1;
    if (stage >= last) return;
    const timer = window.setTimeout(() => {
      const next = Math.min(stage + 1, last);
      setStage(next);
      if (next === last) setPlaying(false);
    }, 1900);
    return () => window.clearTimeout(timer);
  }, [descriptor.workflow.length, pageVisible, playing, reducedMotion, stage, visible]);

  const renderedStage = reducedMotion && !manuallySelected
    ? descriptor.workflow.length - 1
    : stage;
  const active = descriptor.workflow[renderedStage] ?? descriptor.workflow[0];
  const path = PATHS[descriptor.suiteKey] ?? PATHS.trend;
  const title = localizeSystemGuide(descriptor.title, lang);
  const summary = localizeSystemGuide(active.summary, lang);
  const moduleTags = active.moduleKeys.map((moduleKey) => (
    getSuiteModuleCatalogEntry(suiteModuleId(descriptor.suiteKey, moduleKey))?.tag
      ?? moduleKey.toUpperCase()
  ));

  return (
    <div
      className="gp-system-visual"
      data-stage={renderedStage + 1}
      ref={rootRef}
      style={{ "--gp-system-stage-count": descriptor.workflow.length } as CSSProperties}
    >
      <div
        className="gp-system-canvas"
        role="img"
        aria-label={`${title}: ${summary}`}
      >
        <svg viewBox="0 0 480 200" aria-hidden="true">
          <defs>
            <linearGradient id={`system-area-${descriptor.suiteKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--brand-2)" stopOpacity=".24" />
              <stop offset="1" stopColor="var(--brand-2)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g className="gp-system-grid">
            {[34, 76, 118, 160].map((y) => <path key={y} d={`M18 ${y}H462`} />)}
            {[64, 152, 240, 328, 416].map((x) => <path key={x} d={`M${x} 18V180`} />)}
          </g>
          <path className="gp-system-area" d={`${path} L456 180 L24 180 Z`} fill={`url(#system-area-${descriptor.suiteKey})`} />
          <path className="gp-system-price" d={path} />
          {descriptor.workflow.map((item, index) => {
            const x = 54 + index * (372 / Math.max(1, descriptor.workflow.length - 1));
            const y = [142, 112, 82, 55][index] ?? 55;
            return (
              <g
                className={`gp-system-node${index <= renderedStage ? " revealed" : ""}${index === renderedStage ? " active" : ""}`}
                key={item.id}
                transform={`translate(${x} ${y})`}
              >
                <circle r="14" />
                <text textAnchor="middle" dy="3">{index + 1}</text>
              </g>
            );
          })}
          <g className="gp-system-focus" transform="translate(26 23)">
            <rect width="214" height="42" rx="9" />
            <text x="13" y="17">{localizeSystemGuide(active.title, lang)}</text>
            <text x="13" y="32">{moduleTags.join("  ·  ")}</text>
          </g>
        </svg>
      </div>
      <div className="gp-system-lesson">
        <div>
          <span>{lang === "zh" ? "系统路径" : "System path"}</span>
          <strong>{localizeSystemGuide(active.title, lang)}</strong>
          <p>{summary}</p>
        </div>
        <button
          type="button"
          className="gp-system-play"
          aria-label={playing && !reducedMotion ? (lang === "zh" ? "暂停动画" : "Pause lesson") : (lang === "zh" ? "重播动画" : "Replay lesson")}
          onClick={() => {
            if (playing && !reducedMotion) {
              setPlaying(false);
              return;
            }
            setStage(0);
            setManuallySelected(reducedMotion);
            setPlaying(!reducedMotion);
          }}
        >
          {playing && !reducedMotion ? "Ⅱ" : "↻"}
        </button>
      </div>
      <div className="gp-system-steps" role="group" aria-label={lang === "zh" ? "系统学习步骤" : "System learning steps"}>
        {descriptor.workflow.map((item, index) => (
          <button
            type="button"
            aria-current={renderedStage === index ? "step" : undefined}
            key={item.id}
            onClick={() => {
              setStage(index);
              setManuallySelected(true);
              setPlaying(false);
            }}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {localizeSystemGuide(item.title, lang)}
          </button>
        ))}
      </div>
    </div>
  );
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => (
    typeof window !== "undefined"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ));
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}
