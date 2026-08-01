"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

export const GUIDE_PROOF_DURATION_MS = 7600;

type PlaybackStatus = "playing" | "paused" | "complete";
export type GuidePlayState = "playing" | "paused" | "complete";

interface GuidePlayback {
  playState: GuidePlayState;
  playbackRun: number;
  prefersReducedMotion: boolean;
  rootRef: RefObject<HTMLElement | null>;
  pause: () => void;
  replay: () => void;
  resume: () => void;
}

/**
 * Runs one finite causal proof only while it is visible.
 *
 * Time spent off-screen or in a background tab is not counted. Reduced-motion
 * users receive the completed diagram immediately, and static guide diagrams
 * never opt into playback at all.
 */
export function useGuidePlayback(
  playbackKey: string,
  enabled: boolean,
): GuidePlayback {
  const rootRef = useRef<HTMLElement | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => (
    typeof window !== "undefined"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ));
  const [status, setStatus] = useState<PlaybackStatus>(() => (
    enabled && !prefersReducedMotion ? "playing" : "complete"
  ));
  const [playbackRun, setPlaybackRun] = useState(0);
  const [isIntersecting, setIsIntersecting] = useState(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(true);
  const remainingMsRef = useRef(GUIDE_PROOF_DURATION_MS);
  const resetKeyRef = useRef(`${playbackKey}:${enabled}:${prefersReducedMotion}`);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const resetKey = `${playbackKey}:${enabled}:${prefersReducedMotion}`;
    if (resetKeyRef.current === resetKey) return;
    resetKeyRef.current = resetKey;
    remainingMsRef.current = GUIDE_PROOF_DURATION_MS;
    setPlaybackRun((run) => run + 1);
    setStatus(enabled && !prefersReducedMotion ? "playing" : "complete");
  }, [enabled, playbackKey, prefersReducedMotion]);

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
    if (!enabled || !node || typeof IntersectionObserver === "undefined") {
      setIsIntersecting(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsIntersecting(entry.isIntersecting && entry.intersectionRatio >= 0.35),
      { threshold: [0, 0.35, 0.75] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, playbackKey]);

  const isActivelyPlaying = enabled
    && !prefersReducedMotion
    && status === "playing"
    && isIntersecting
    && isDocumentVisible;

  useEffect(() => {
    if (!isActivelyPlaying) return;

    const startedAt = performance.now();
    const scheduledDuration = remainingMsRef.current;
    let completed = false;
    const timer = window.setTimeout(() => {
      completed = true;
      remainingMsRef.current = 0;
      setStatus("complete");
    }, scheduledDuration);

    return () => {
      window.clearTimeout(timer);
      if (!completed) {
        remainingMsRef.current = Math.max(
          0,
          scheduledDuration - (performance.now() - startedAt),
        );
      }
    };
  }, [isActivelyPlaying]);

  const pause = useCallback(() => setStatus("paused"), []);
  const resume = useCallback(() => {
    if (remainingMsRef.current > 0) setStatus("playing");
  }, []);
  const replay = useCallback(() => {
    if (!enabled || prefersReducedMotion) return;
    remainingMsRef.current = GUIDE_PROOF_DURATION_MS;
    setPlaybackRun((run) => run + 1);
    setStatus("playing");
  }, [enabled, prefersReducedMotion]);

  const playState: GuidePlayState = prefersReducedMotion || !enabled || status === "complete"
    ? "complete"
    : isActivelyPlaying
      ? "playing"
      : "paused";

  return {
    playState,
    playbackRun,
    prefersReducedMotion,
    rootRef,
    pause,
    replay,
    resume,
  };
}
