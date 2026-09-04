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
  useState,
  type ReactNode,
} from "react";
import useSWR from "swr";
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

  const saved = data?.profile ?? EMPTY_PROFILE;
  const revision = data?.revision ?? 0;
  const editing = draft !== null;
  const profile = draft ?? saved;

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

    return {
      profile,
      saved,
      revision,
      editing,
      dirty,
      saveState,
      saveError,
      authenticated: session?.authenticated ?? false,
      authConfigured: session?.configured ?? false,

      startEditing: () => {
        setSaveState("idle");
        setSaveError(null);
        setDraft(clone(saved));
      },

      cancel: () => {
        setDraft(null);
        setSaveState("idle");
        setSaveError(null);
        try {
          window.localStorage.removeItem(DRAFT_KEY);
        } catch {
          // Nothing to clean up if storage is unavailable.
        }
      },

      save: async () => {
        if (!draft) return true;
        setSaveState("saving");
        setSaveError(null);
        const response = await fetch("/api/layout", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile: draft, expectedRevision: revision }),
        });
        if (response.status === 401) {
          setSaveState("unauthorized");
          return false;
        }
        if (response.status === 409) {
          // Another device saved first. Take its profile rather than clobber it.
          const body = await response.json();
          await mutate(body, { revalidate: false });
          setSaveState("conflict");
          setSaveError("Saved on another device. Reloaded the current layout.");
          setDraft(null);
          return false;
        }
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          setSaveState("error");
          setSaveError(body.error ?? `Save failed (${response.status})`);
          return false;
        }
        const body = await response.json();
        await mutate(body, { revalidate: false });
        setDraft(null);
        setSaveState("idle");
        try {
          window.localStorage.removeItem(DRAFT_KEY);
        } catch {
          // Ignore: the draft is gone from memory either way.
        }
        return true;
      },

      resetView: (viewId) => {
        edit((next) => {
          if (next.views) delete next.views[viewId];
        });
      },

      resetAll: async () => {
        const response = await fetch("/api/layout", { method: "DELETE" });
        if (response.status === 401) {
          setSaveState("unauthorized");
          return false;
        }
        if (!response.ok) {
          setSaveState("error");
          setSaveError(`Reset failed (${response.status})`);
          return false;
        }
        await mutate(await response.json(), { revalidate: false });
        setDraft(null);
        return true;
      },

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
          const from = order.indexOf(moduleId);
          const to = from + delta;
          if (from < 0 || to < 0 || to >= order.length) return;
          order.splice(to, 0, order.splice(from, 1)[0]);
          view.order = order;
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
          // The bar holds exactly four; anything else is a bug in the caller.
          const chosen = new Set(pins.slice(0, MOBILE_PIN_COUNT));
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
    };
  }, [
    draft,
    saved,
    profile,
    revision,
    editing,
    saveState,
    saveError,
    session,
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
