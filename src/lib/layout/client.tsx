"use client";

// The client half of the layout engine: one provider holding the saved
// profile, the in-progress edit draft, and the actions the editor calls.
// Views never read the profile directly; they ask for a resolved view, which
// is the draft while editing and the saved profile otherwise. That is what
// makes Cancel free: nothing outside this file ever saw the draft.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import useSWR from "swr";
import { VIEW_BY_ID } from "@/lib/views";
import { DEFAULT_DOMAIN_ORDER } from "./default-layouts";
import { resolveLayout, resolveView } from "./resolver";
import {
  EMPTY_PROFILE,
  MOBILE_PIN_COUNT,
  type LayoutProfile,
  type ModuleDensity,
  type ModuleWidth,
  type ResolvedLayout,
  type ResolvedView,
  type ViewOverride,
  type ViewId,
} from "./types";

const DRAFT_KEY = "cockpit:layout-draft";

type SaveState = "idle" | "saving" | "conflict" | "error" | "unauthorized";

/** Which half of the editor is on screen: this view's modules, or navigation. */
export type EditorTab = "modules" | "sections";

interface LayoutContextValue {
  /** The layout every view renders: the draft while editing, else the saved one. */
  profile: LayoutProfile;
  saved: LayoutProfile;
  revision: number;
  editing: boolean;
  dirty: boolean;
  saveState: SaveState;
  saveError: string | null;
  authenticated: boolean;
  authConfigured: boolean;

  startEditing: () => void;
  cancel: () => void;
  save: () => Promise<boolean>;
  resetView: (viewId: ViewId) => void;
  resetAll: () => Promise<boolean>;

  setEnabled: (viewId: ViewId, moduleId: string, enabled: boolean) => void;
  setWidth: (viewId: ViewId, moduleId: string, width: ModuleWidth) => void;
  setDensity: (viewId: ViewId, moduleId: string, density: ModuleDensity) => void;
  moveModule: (viewId: ViewId, moduleId: string, delta: number) => void;
  setOrder: (viewId: ViewId, order: string[]) => void;

  setDomainVisible: (viewId: ViewId, visible: boolean) => void;
  setDomainOrder: (order: ViewId[]) => void;
  setMobilePins: (pins: ViewId[]) => void;
  resetDomains: () => void;

  refreshAuth: () => void;

  editorTab: EditorTab;
  setEditorTab: (tab: EditorTab) => void;

  /** Why the draft cannot be saved as it stands, or null when it can. */
  draftProblem: string | null;

  /**
   * The password prompt is owned here so Save and Reset all share one flow:
   * ask once, then retry. The shell renders it; `login` submits it.
   */
  authPrompt: boolean;
  login: (password: string) => Promise<{ ok: boolean; error: string | null }>;
  dismissAuthPrompt: () => void;
  /** Save, prompting for the password first when the server wants one. */
  saveWithAuth: () => Promise<boolean>;
  resetAllWithAuth: () => Promise<boolean>;
}

const LayoutContext = createContext<LayoutContextValue | null>(null);

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function clone(profile: LayoutProfile): LayoutProfile {
  return JSON.parse(JSON.stringify(profile)) as LayoutProfile;
}

/** Reads the current order for a view, falling back to the resolved default. */
function currentOrder(profile: LayoutProfile, viewId: ViewId): string[] {
  const saved = profile.views?.[viewId]?.order;
  if (saved?.length) return [...saved];
  const resolved = resolveView(viewId, profile);
  return [...resolved.modules, ...resolved.hidden].map((m) => m.moduleId);
}

/** Moves `id` by `delta` places. Out of range or unknown: the list is returned as is. */
export function moveId<T>(list: T[], id: T, delta: number): T[] {
  const from = list.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= list.length) return list;
  const next = [...list];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

/**
 * Every domain, hidden ones included, in the order the profile asks for.
 * The resolver's `domains` drops hidden entries because navigation never
 * shows them; the Sections editor needs the full list to offer them back.
 */
export function orderedDomains(profile: LayoutProfile): ViewId[] {
  const overrides = profile.domains ?? {};
  return DEFAULT_DOMAIN_ORDER.map((viewId, index) => ({
    viewId,
    index,
    order: overrides[viewId]?.order ?? index,
  }))
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map((entry) => entry.viewId);
}

/**
 * The pins the editor shows. Once a profile has saved any pin it is the raw
 * saved set, even when that set is the wrong size, so Bob sees what he
 * actually chose; an untouched profile shows the effective defaults.
 */
export function draftPins(profile: LayoutProfile): ViewId[] {
  const overrides = profile.domains ?? {};
  const anySaved = Object.values(overrides).some((d) => d?.mobilePinned !== undefined);
  if (!anySaved) return resolveLayout(profile).mobilePins;
  return orderedDomains(profile).filter((viewId) => overrides[viewId]?.mobilePinned === true);
}

/** The reason a draft's navigation cannot be saved, or null. Mirrors the server rule. */
export function pinProblem(profile: LayoutProfile): string | null {
  const overrides = profile.domains ?? {};
  const anySaved = Object.values(overrides).some((d) => d?.mobilePinned !== undefined);
  if (!anySaved) return null;
  const pins = draftPins(profile);
  if (pins.length !== MOBILE_PIN_COUNT) {
    return `The phone's bottom bar holds exactly ${MOBILE_PIN_COUNT} domains; ${pins.length} ${pins.length === 1 ? "is" : "are"} pinned.`;
  }
  const hiddenPin = pins.find((viewId) => overrides[viewId]?.visible === false);
  if (hiddenPin) {
    return `${VIEW_BY_ID[hiddenPin].label} is pinned to the bottom bar but hidden from navigation. Show it or unpin it.`;
  }
  return null;
}

type SaveResult = "ok" | "unauthorized" | "failed";

function clearDraftStorage() {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

export function LayoutProvider({ children }: { children: ReactNode }) {
  const { data, mutate } = useSWR<{ profile: LayoutProfile; revision: number }>(
    "/api/layout",
    fetcher,
    { revalidateOnFocus: false }
  );
  const { data: session, mutate: mutateSession } = useSWR<{
    authenticated: boolean;
    configured: boolean;
  }>("/api/auth/session", fetcher, { revalidateOnFocus: false });

  const [draft, setDraft] = useState<LayoutProfile | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<EditorTab>("modules");
  const [authPrompt, setAuthPrompt] = useState(false);
  // The promise a caller is waiting on while the prompt is open.
  const pendingAuth = useRef<((ok: boolean) => void) | null>(null);

  const saved = data?.profile ?? EMPTY_PROFILE;
  const revision = data?.revision ?? 0;
  const editing = draft !== null;
  const profile = draft ?? saved;
  const authenticated = session?.authenticated ?? false;
  const authConfigured = session?.configured ?? false;

  // Mutating a draft always goes through here so the localStorage copy and the
  // dirty flag stay in step with the in-memory object.
  const edit = useCallback(
    (fn: (next: LayoutProfile) => void) => {
      setDraft((current) => {
        const next = clone(current ?? saved);
        fn(next);
        try {
          window.localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
        } catch {
          // A full or blocked storage quota must not break editing.
        }
        return next;
      });
    },
    [saved]
  );

  const editView = useCallback(
    (viewId: ViewId, fn: (view: ViewOverride) => void) => {
      edit((next) => {
        next.views ??= {};
        next.views[viewId] ??= {};
        fn(next.views[viewId]!);
      });
    },
    [edit]
  );

  const value = useMemo<LayoutContextValue>(() => {
    const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);
    const draftProblem = draft ? pinProblem(draft) : null;

    const performSave = async (): Promise<SaveResult> => {
      if (!draft) return "ok";
      setSaveState("saving");
      setSaveError(null);
      const response = await fetch("/api/layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: draft, expectedRevision: revision }),
      });
      if (response.status === 401) {
        setSaveState("unauthorized");
        return "unauthorized";
      }
      if (response.status === 409) {
        // Another device saved first. Take its profile rather than clobber it.
        const body = await response.json();
        await mutate(body, { revalidate: false });
        setSaveState("conflict");
        setSaveError("Saved on another device. Reloaded the current layout.");
        setDraft(null);
        return "failed";
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setSaveState("error");
        setSaveError(body.error ?? `Save failed (${response.status})`);
        return "failed";
      }
      const body = await response.json();
      await mutate(body, { revalidate: false });
      setDraft(null);
      setSaveState("idle");
      clearDraftStorage();
      return "ok";
    };

    const performResetAll = async (): Promise<SaveResult> => {
      const response = await fetch("/api/layout", { method: "DELETE" });
      if (response.status === 401) {
        setSaveState("unauthorized");
        return "unauthorized";
      }
      if (!response.ok) {
        setSaveState("error");
        setSaveError(`Reset failed (${response.status})`);
        return "failed";
      }
      await mutate(await response.json(), { revalidate: false });
      setDraft(null);
      clearDraftStorage();
      return "ok";
    };

    // Opens the prompt and resolves when it closes. Without a configured
    // password there is nothing to prompt for, so it answers false at once.
    const ensureAuthenticated = (): Promise<boolean> => {
      if (!authConfigured) {
        setSaveState("unauthorized");
        return Promise.resolve(false);
      }
      pendingAuth.current?.(false);
      return new Promise((resolve) => {
        pendingAuth.current = resolve;
        setAuthPrompt(true);
      });
    };

    // Try once; on 401 ask for the password and try once more. The session
    // flag can be stale (an expired cookie), so the first attempt is real.
    const withAuth = async (action: () => Promise<SaveResult>): Promise<boolean> => {
      if (authConfigured && !authenticated) {
        if (!(await ensureAuthenticated())) return false;
      }
      let result = await action();
      if (result === "unauthorized") {
        if (!(await ensureAuthenticated())) return false;
        result = await action();
      }
      return result === "ok";
    };

    return {
      profile,
      saved,
      revision,
      editing,
      dirty,
      saveState,
      saveError,
      authenticated,
      authConfigured,

      startEditing: () => {
        setSaveState("idle");
        setSaveError(null);
        setEditorTab("modules");
        setDraft(clone(saved));
      },

      cancel: () => {
        setDraft(null);
        setSaveState("idle");
        setSaveError(null);
        clearDraftStorage();
      },

      save: async () => (await performSave()) === "ok",

      resetView: (viewId) => {
        edit((next) => {
          if (next.views) delete next.views[viewId];
        });
      },

      resetAll: async () => (await performResetAll()) === "ok",

      setEnabled: (viewId, moduleId, enabled) =>
        editView(viewId, (view) => {
          view.modules ??= {};
          view.modules[moduleId] = { ...view.modules[moduleId], enabled };
        }),

      setWidth: (viewId, moduleId, width) =>
        editView(viewId, (view) => {
          view.modules ??= {};
          view.modules[moduleId] = { ...view.modules[moduleId], width };
        }),

      setDensity: (viewId, moduleId, density) =>
        editView(viewId, (view) => {
          view.modules ??= {};
          view.modules[moduleId] = { ...view.modules[moduleId], density };
        }),

      moveModule: (viewId, moduleId, delta) =>
        editView(viewId, (view) => {
          const order = view.order?.length ? [...view.order] : currentOrder(profile, viewId);
          view.order = moveId(order, moduleId, delta);
        }),

      setOrder: (viewId, order) =>
        editView(viewId, (view) => {
          view.order = [...order];
        }),

      setDomainVisible: (viewId, visible) =>
        edit((next) => {
          next.domains ??= {};
          next.domains[viewId] = { ...next.domains[viewId], visible };
        }),

      setDomainOrder: (order) =>
        edit((next) => {
          next.domains ??= {};
          order.forEach((viewId, index) => {
            next.domains![viewId] = { ...next.domains![viewId], order: index };
          });
        }),

      setMobilePins: (pins) =>
        edit((next) => {
          // The draft may briefly hold the wrong number while Bob is choosing;
          // `draftProblem` blocks Save until it is exactly four again.
          const chosen = new Set(pins);
          next.domains ??= {};
          for (const viewId of Object.keys(next.domains) as ViewId[]) {
            next.domains[viewId] = { ...next.domains[viewId], mobilePinned: chosen.has(viewId) };
          }
          for (const viewId of chosen) {
            next.domains[viewId] = { ...next.domains[viewId], mobilePinned: true };
          }
        }),

      resetDomains: () =>
        edit((next) => {
          delete next.domains;
        }),

      refreshAuth: () => {
        void mutateSession();
      },

      editorTab,
      setEditorTab,
      draftProblem,
      authPrompt,

      login: async (password) => {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        if (response.status === 429) {
          return { ok: false, error: "Too many attempts. Wait 15 minutes and try again." };
        }
        if (!response.ok) {
          return { ok: false, error: "That password was not accepted." };
        }
        await mutateSession({ authenticated: true, configured: true }, { revalidate: false });
        setAuthPrompt(false);
        pendingAuth.current?.(true);
        pendingAuth.current = null;
        return { ok: true, error: null };
      },

      dismissAuthPrompt: () => {
        setAuthPrompt(false);
        pendingAuth.current?.(false);
        pendingAuth.current = null;
      },

      saveWithAuth: async () => {
        if (draftProblem) {
          setSaveState("error");
          setSaveError(draftProblem);
          return false;
        }
        if (!dirty) {
          // Nothing changed: leaving edit mode is the whole job.
          setDraft(null);
          clearDraftStorage();
          return true;
        }
        return withAuth(performSave);
      },

      resetAllWithAuth: async () => withAuth(performResetAll),
    };
  }, [
    draft,
    saved,
    profile,
    revision,
    editing,
    saveState,
    saveError,
    authenticated,
    authConfigured,
    editorTab,
    authPrompt,
    edit,
    editView,
    mutate,
    mutateSession,
  ]);

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayout(): LayoutContextValue {
  const context = useContext(LayoutContext);
  if (!context) throw new Error("useLayout must be used inside LayoutProvider");
  return context;
}

/**
 * What a view renders. Resolved against the draft while editing, so the
 * preview is the real thing rather than a separate code path.
 */
export function useResolvedView(viewId: ViewId): ResolvedView {
  const { profile } = useLayout();
  return useMemo(() => resolveView(viewId, profile), [viewId, profile]);
}

export function useResolvedLayout(): ResolvedLayout {
  const { profile } = useLayout();
  return useMemo(() => resolveLayout(profile), [profile]);
}
