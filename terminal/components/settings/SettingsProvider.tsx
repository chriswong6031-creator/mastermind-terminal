"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";

// ── Account settings dashboard: the host ──────────────────────────────────────
// One panel per shell, opened from every avatar button on the page. This is the
// answer to the old SettingsMenu's structural problem: the dropdown mounted
// three times on /terminal (desktop topbar + mobile topbar + drawer footer) and
// each copy carried its own state. Here the BUTTONS mount three times and the
// panel exactly once, so there is nothing to drift.

export type SettingsSection = "account" | "billing" | "usage" | "prefs" | "terminal" | "sync";

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  "account", "billing", "usage", "prefs", "terminal", "sync",
] as const;

interface SettingsApi {
  open: (section?: SettingsSection) => void;
  close: () => void;
}

// No-op fallback for provider-less hosts — the same degradation OnboardingProvider
// ships for the same reason: components/RouteSkeleton.tsx renders MobileNav (and
// therefore the settings button) OUTSIDE any provider during route transitions.
// A throwing hook would crash every navigation.
const NOOP_API: SettingsApi = { open: () => {}, close: () => {} };

const SettingsCtx = createContext<SettingsApi>(NOOP_API);

export function useSettings(): SettingsApi {
  return useContext(SettingsCtx);
}

/** The slice of the Supabase user the panel actually renders. */
export interface AcsUser {
  id: string;
  email: string;
  createdAt: string | null;
  lastSignInAt: string | null;
  provider: string;
  meta: Record<string, unknown>;
}

function toAcsUser(u: {
  id?: string;
  email?: string;
  created_at?: string;
  last_sign_in_at?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
} | null): AcsUser | null {
  if (!u) return null;
  const am = u.app_metadata || {};
  const providers = am.providers;
  const provider =
    (typeof am.provider === "string" && am.provider) ||
    (Array.isArray(providers) && typeof providers[0] === "string" ? providers[0] : "") ||
    "email";
  return {
    id: u.id || "",
    email: u.email || (u.user_metadata?.email as string | undefined) || "",
    createdAt: u.created_at || null,
    lastSignInAt: u.last_sign_in_at || null,
    provider: String(provider).toLowerCase(),
    meta: (u.user_metadata as Record<string, unknown>) || {},
  };
}

// Code-split: the panel and its six sections never load until the user opens
// settings for the first time (mirrors OnboardingProvider's sheet).
const SettingsPanel = dynamic(() => import("./SettingsPanel"), { ssr: false });

export function SettingsProvider({
  email,
  defaultSection = "account",
  children,
}: {
  email: string;
  /** Surface-specific landing tab. Explicit open("billing"), etc. still wins. */
  defaultSection?: SettingsSection;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [section, setSection] = useState<SettingsSection>("account");
  const [everOpened, setEverOpened] = useState(false);
  const [user, setUser] = useState<AcsUser | null>(null);
  // Bumped on every open() so the panel can re-key its one-shot laser sweep and
  // replay it — the declarative stand-in for macro's remove-class/force-reflow.
  const [openSeq, setOpenSeq] = useState(0);
  const loadedFor = useRef<string | null>(null);

  const open = useCallback<SettingsApi["open"]>((s) => {
    setSection(s && SETTINGS_SECTIONS.includes(s) ? s : defaultSection);
    setIsOpen(true);
    setEverOpened(true);
    setOpenSeq((n) => n + 1);
  }, [defaultSection]);

  const close = useCallback(() => setIsOpen(false), []);

  // ONE getUser() per signed-in session, on first open. The full user object
  // (created_at / last_sign_in_at / app_metadata / user_metadata) is not on the
  // `email` prop the shells pass down, and every section needs some of it.
  const refreshUser = useCallback(async () => {
    if (!email) { setUser(null); return; }
    try {
      const { data } = await createClient().auth.getUser();
      setUser(toAcsUser(data.user as Parameters<typeof toAcsUser>[0]));
      loadedFor.current = email;
    } catch {
      /* offline / auth unreachable — sections degrade to what `email` alone gives */
    }
  }, [email]);

  useEffect(() => {
    if (!isOpen) return;
    if (loadedFor.current === email && user) return;
    void refreshUser();
  }, [isOpen, email, user, refreshUser]);

  // A sign-out (or an account switch) must never leave another user's cached
  // profile behind the next time the panel opens.
  useEffect(() => {
    if (loadedFor.current !== null && loadedFor.current !== email) {
      loadedFor.current = null;
      setUser(null);
    }
  }, [email]);

  /** Merge a user_metadata patch into the cached user after a successful save,
   *  so the ID card and rail repaint without a second network round-trip. */
  const patchMeta = useCallback((patch: Record<string, unknown>) => {
    setUser((u) => (u ? { ...u, meta: { ...u.meta, ...patch } } : u));
  }, []);

  const api = useMemo<SettingsApi>(() => ({ open, close }), [open, close]);

  return (
    <SettingsCtx.Provider value={api}>
      {children}
      {everOpened && (
        <SettingsPanel
          visible={isOpen}
          openSeq={openSeq}
          section={section}
          onSection={setSection}
          onClose={close}
          email={email}
          user={user}
          onPatchMeta={patchMeta}
          onRefreshUser={refreshUser}
        />
      )}
    </SettingsCtx.Provider>
  );
}
