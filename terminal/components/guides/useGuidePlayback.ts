"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

const LAST_STAGE = 2;
const STAGE_DURATION_MS = 2200;

interface GuidePlayback {
  activeStage: number;
  isPlaying: boolean;
  prefersReducedMotion: boolean;
  rootRef: RefObject<HTMLElement | null>;
  pause: () => void;
  replay: () => void;
  selectStage: (stage: number) => void;
}

/**
 * Runs a visual's short, finite teaching sequence only while it can be seen.
 *
 * The hook deliberately does not loop. Reduced-motion users receive the complete
 * final schematic immediately and can still inspect each stage with discrete
 * controls.
 */
export function useGuidePlayback(playbackKey: string): GuidePlayback {
  const rootRef = useRef<HTMLElement | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => (
    typeof window !== "undefined"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ));
  const [activeStage, setActiveStage] = useState(
    prefersReducedMotion ? LAST_STAGE : 0,
  );
  const [isPlaying, setIsPlaying] = useState(!prefersReducedMotion);
  const [isIntersecting, setIsIntersecting] = useState(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(true);
  const resetKey = `${playbackKey}:${prefersReducedMotion ? "reduced" : "animated"}`;
  const [previousResetKey, setPreviousResetKey] = useState(resetKey);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  if (previousResetKey !== resetKey) {
    setPreviousResetKey(resetKey);
    setActiveStage(prefersReducedMotion ? LAST_STAGE : 0);
    setIsPlaying(!prefersReducedMotion);
  }

  useEffect(() => {
    const syncVisibility = () => {
      setIsDocumentVisible(document.visibilityState === "visible");
    };
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setIsIntersecting(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsIntersecting(entry.isIntersecting && entry.intersectionRatio >= 0.35),
      { threshold: [0, 0.35, 0.75] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [playbackKey]);

  useEffect(() => {
    if (
      prefersReducedMotion
      || !isPlaying
      || !isIntersecting
      || !isDocumentVisible
      || activeStage >= LAST_STAGE
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      const next = Math.min(activeStage + 1, LAST_STAGE);
      setActiveStage(next);
      if (next === LAST_STAGE) setIsPlaying(false);
    }, STAGE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [
    activeStage,
    isDocumentVisible,
    isIntersecting,
    isPlaying,
    prefersReducedMotion,
  ]);

  const pause = useCallback(() => setIsPlaying(false), []);

  const replay = useCallback(() => {
    setActiveStage(0);
    setIsPlaying(!prefersReducedMotion);
  }, [prefersReducedMotion]);

  const selectStage = useCallback((stage: number) => {
    setActiveStage(Math.max(0, Math.min(stage, LAST_STAGE)));
    setIsPlaying(false);
  }, []);

  return {
    activeStage,
    isPlaying,
    prefersReducedMotion,
    rootRef,
    pause,
    replay,
    selectStage,
  };
}
