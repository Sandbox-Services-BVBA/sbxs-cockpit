"use client";

// The client half of the layout engine: one provider holding the saved
// profile plus whatever Bob has just changed and not yet had written back.
//
// There is no edit mode any more. Closing a tile, dragging it, picking a
// width: each is one mutation that shows at once and is written to the
// server on a short debounce. Views never read the profile directly; they
// ask for a resolved view, which is the saved profile with the unsaved
// changes layered on top, so what is on screen is always what will be saved.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import useSWR from "swr";
import { MODULE_BY_ID } from "./catalog";
import { resolveView } from "./resolver";
import {
  EMPTY_PROFILE,
  type LayoutProfile,
  type ModuleDensity,
  type ModuleOverride,
  type ModuleWidth,
  type ResolvedView,
  type SurfaceId,
} from "./types";

/** How long the canvas waits after the last change before writing it. */
export const AUTOSAVE_DELAY_MS = 800;

/**
 * Where the last write stands. `saved` is transient: it clears back to idle
 * a moment later so the status pill does not sit there forever.
 */
export type SaveState =
  | "idle"
  | "saving"
  | "saved"
  | "conflict"
  | "error"
  | "unauthorized"
  | "unconfigured";

interface LayoutContextValue {
  /** The layout every view renders: saved plus unsaved changes. */
  profile: LayoutProfile;
  saved: LayoutProfile;
  revision: number;
  /**
   * False until /api/layout has answered (or failed). Views hold their
   * modules back until then, so a module Bob closed never mounts on the
   * defaults for a moment and fires a fetch before the profile arrives.
   */
  ready: boolean;
  /** True while a change is waiting to be written or is in flight. */
  pending: boolean;
  saveState: SaveState;
  /** The human line that goes with a non-idle save state, or null. */
  saveError: string | null;
  authenticated: boolean;
  authConfigured: boolean;

  /**
   * Each setter resolves true once the change is applied and false when it
   * was refused or the password prompt it triggered was cancelled, so a
   * caller can hold its own follow-up (an undo toast) until it is real.
   */
  setEnabled: (viewId: SurfaceId, moduleId: string, enabled: boolean) => Promise<boolean>;
  setWidth: (viewId: SurfaceId, moduleId: string, width: ModuleWidth) => Promise<boolean>;
  setDensity: (viewId: SurfaceId, moduleId: string, density: ModuleDensity) => Promise<boolean>;
  /**
   * Move a module one visible neighbour up or down. Hidden modules sit in
   * the same order array, so a plain index shift could swap with one and
   * show no change; this skips them. `among` is the ids actually on screen
   * when the view mounts fewer than the resolver enables (Home tiles that
   * do not apply to the current timeframe); it defaults to every enabled id.
   */
  moveModule: (viewId: SurfaceId, moduleId: string, delta: number, among?: string[]) => Promise<boolean>;
  /** Place a module directly before another visible one, or last when null. */
  placeModule: (viewId: SurfaceId, moduleId: string, beforeId: string | null) => Promise<boolean>;
  setOrder: (viewId: SurfaceId, order: string[]) => Promise<boolean>;
  /** Back to code defaults for every view; needs the password like a save. */
  resetAll: () => Promise<boolean>;
  /** Write whatever is pending now instead of waiting for the debounce. */
  flush: () => Promise<void>;

  refreshAuth: () => void;

  /**
   * The password prompt is owned here so the first change and a refused
   * write share one flow: ask once, then continue. The canvas renders it;
   * `login` submits it.
   */
  authPrompt: boolean;
  login: (password: string) => Promise<{ ok: boolean; error: string | null }>;
  dismissAuthPrompt: () => void;
}

const LayoutContext = createContext<LayoutContextValue | null>(null);

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function clone(profile: LayoutProfile): LayoutProfile {
  return JSON.parse(JSON.stringify(profile)) as LayoutProfile;
}

/* --- Pure helpers ---------------------------------------------------------
   Everything the provider does to a profile is a function of (profile,
   arguments) so it can be tested without React. Each returns the same
   object when it refuses or has nothing to do, which is how the provider
   knows not to schedule a write. */

/** Reads the current order for a view, falling back to the resolved default. */
export function currentOrder(profile: LayoutProfile, viewId: SurfaceId): string[] {
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
 * Puts `id` directly before `beforeId` in `list`, or last when `beforeId`
 * is null. Everything else keeps its relative position, hidden entries
 * included. Unknown ids leave the list untouched.
 */
export function placeBefore<T>(list: T[], id: T, beforeId: T | null): T[] {
  if (!list.includes(id) || id === beforeId) return list;
  if (beforeId !== null && !list.includes(beforeId)) return list;
  const without = list.filter((entry) => entry !== id);
  const at = beforeId === null ? without.length : without.indexOf(beforeId);
  const next = [...without];
  next.splice(at, 0, id);
  return next.every((entry, index) => entry === list[index]) ? list : next;
}

/**
 * Moves `id` one visible neighbour up (-1) or down (+1). `visible` is the
 * ids on screen in order; `list` is the full order including hidden ids.
 * At either end the list is returned unchanged.
 */
export function moveAmongVisible<T>(list: T[], visible: T[], id: T, delta: number): T[] {
  const at = visible.indexOf(id);
  const target = at + delta;
  if (at < 0 || target < 0 || target >= visible.length) return list;
  const neighbour = visible[target];
  if (delta < 0) return placeBefore(list, id, neighbour);
  // Down: land after the neighbour, i.e. before whatever follows it in the
  // full list (which may be a hidden module, and that is fine).
  const after = list.indexOf(neighbour) + 1;
  return placeBefore(list, id, after < list.length ? list[after] : null);
}

/**
 * Applies a module override to a copy of the profile. Refuses to disable a
 * required module or to set a width or density the module does not allow,
 * returning the original profile so the caller can tell nothing changed.
 */
export function applyModuleOverride(
  profile: LayoutProfile,
  viewId: SurfaceId,
  moduleId: string,
  patch: ModuleOverride
): LayoutProfile {
  const definition = MODULE_BY_ID[moduleId];
  if (!definition) return profile;
  if (patch.enabled === false && definition.required) return profile;
  if (patch.width && !definition.allowedWidths.includes(patch.width)) return profile;
  if (patch.density && !definition.allowedDensities.includes(patch.density)) return profile;

  const next = clone(profile);
  next.views ??= {};
  next.views[viewId] ??= {};
  const view = next.views[viewId]!;
  view.modules ??= {};
  view.modules[moduleId] = { ...view.modules[moduleId], ...patch };
  return next;
}

/** Writes a full order for a view into a copy of the profile. */
export function applyOrder(profile: LayoutProfile, viewId: SurfaceId, order: string[]): LayoutProfile {
  const before = currentOrder(profile, viewId);
  if (before.length === order.length && before.every((id, i) => id === order[i])) return profile;
  const next = clone(profile);
  next.views ??= {};
  next.views[viewId] ??= {};
  next.views[viewId]!.order = [...order];
  return next;
}

/**
 * A debounced, serialised writer. `schedule` remembers the latest value and
 * restarts the timer; when it fires, one `write` happens with that value.
 * A value scheduled while a write is in flight waits for it and then goes
 * out on its own, so two writes never race and the last one always wins.
 */
export function createAutosave<T>(write: (value: T) => Promise<void>, delay: number) {
  let latest: T | undefined;
  let hasLatest = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;

  // Writes until nothing is waiting. A value that arrives mid-write is
  // picked up by the next turn of the loop, but only once its own debounce
  // has elapsed, so a burst of changes still collapses into one request.
  const run = async (): Promise<void> => {
    while (hasLatest && timer === null) {
      const value = latest as T;
      hasLatest = false;
      latest = undefined;
      await write(value).catch(() => undefined);
    }
  };

  const start = (): Promise<void> => {
    if (!running) {
      running = run().finally(() => {
        running = null;
      });
    }
    return running;
  };

  return {
    schedule(value: T) {
      latest = value;
      hasLatest = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void start();
      }, delay);
    },
    async flush() {
      if (timer) clearTimeout(timer);
      timer = null;
      while (hasLatest || running) await start();
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      hasLatest = false;
      latest = undefined;
    },
    get pending() {
      return timer !== null || running !== null || hasLatest;
    },
  };
}

/* --- Provider ------------------------------------------------------------- */

type WriteResult = "ok" | "unauthorized" | "failed";

const NOTES: Partial<Record<SaveState, string>> = {
  conflict: "Saved on another device first. Showing that layout now.",
  unauthorized: "Not saved. Log in to keep layout changes.",
  unconfigured: "Layout changes cannot be saved: no cockpit password is configured.",
};

export function LayoutProvider({ children }: { children: ReactNode }) {
  const { data, error: loadError, mutate } = useSWR<{ profile: LayoutProfile; revision: number }>(
    "/api/layout",
    fetcher,
    { revalidateOnFocus: false }
  );
  const { data: session, mutate: mutateSession } = useSWR<{
    authenticated: boolean;
    configured: boolean;
  }>("/api/auth/session", fetcher, { revalidateOnFocus: false });

  // `local` is the profile with unsaved changes; null when everything is
  // written. The ref mirrors it for the async writer, which must see the
  // latest value rather than the one its closure was created with.
  const [local, setLocal] = useState<LayoutProfile | null>(null);
  const localRef = useRef<LayoutProfile | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [authPrompt, setAuthPrompt] = useState(false);
  // The promise a caller is waiting on while the prompt is open.
  const pendingAuth = useRef<((ok: boolean) => void) | null>(null);

  const saved = data?.profile ?? EMPTY_PROFILE;
  const revision = data?.revision ?? 0;
  // A failed load still counts as ready: the defaults are the honest answer then.
  const ready = data !== undefined || loadError !== undefined;
  const profile = local ?? saved;
  const authenticated = session?.authenticated ?? false;
  const authConfigured = session?.configured ?? false;

  // Refs for everything the writer reads across an await. They are synced
  // in an effect, which runs before any timer or handler can read them.
  const savedRef = useRef(saved);
  const revisionRef = useRef(revision);
  const sessionRef = useRef(session);
  useEffect(() => {
    savedRef.current = saved;
    revisionRef.current = revision;
    sessionRef.current = session;
  }, [saved, revision, session]);

  const setState = useCallback((state: SaveState, note: string | null = NOTES[state] ?? null) => {
    setSaveState(state);
    setSaveError(note);
  }, []);

  // "Saved" is a pulse, not a state to live in.
  useEffect(() => {
    if (saveState !== "saved") return;
    const timer = setTimeout(() => setState("idle"), 1800);
    return () => clearTimeout(timer);
  }, [saveState, setState]);

  // Opens the prompt and resolves when it closes. Without a configured
  // password there is nothing to prompt for, so it answers false at once.
  const ensureAuthenticated = useCallback((): Promise<boolean> => {
    if (sessionRef.current && !sessionRef.current.configured) {
      setState("unconfigured");
      return Promise.resolve(false);
    }
    pendingAuth.current?.(false);
    return new Promise((resolve) => {
      pendingAuth.current = resolve;
      setAuthPrompt(true);
    });
  }, [setState]);

  const commitLocal = useCallback((next: LayoutProfile | null) => {
    localRef.current = next;
    setLocal(next);
  }, []);

  const put = useCallback(
    async (value: LayoutProfile): Promise<WriteResult> => {
      setState("saving");
      const response = await fetch("/api/layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: value, expectedRevision: revisionRef.current }),
        keepalive: true,
      });
      if (response.status === 401) return "unauthorized";
      if (response.status === 409) {
        // Another device saved first. Take its profile rather than clobber
        // it; the unsaved change is gone, and the note says so.
        const body = await response.json();
        revisionRef.current = body.revision;
        await mutate(body, { revalidate: false });
        commitLocal(null);
        setState("conflict");
        return "failed";
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setState("error", body.error ?? `Save failed (${response.status})`);
        return "failed";
      }
      const body = await response.json();
      revisionRef.current = body.revision;
      await mutate(body, { revalidate: false });
      // Only clear the unsaved layer when nothing newer arrived meanwhile;
      // otherwise the autosaver has another write queued for it.
      if (localRef.current === value) commitLocal(null);
      setState("saved");
      return "ok";
    },
    [mutate, commitLocal, setState]
  );

  // Try once; on 401 ask for the password and try once more with whatever
  // is current by then. The session flag can be stale (an expired cookie),
  // so the first attempt is always real.
  const write = useCallback(
    async (value: LayoutProfile): Promise<void> => {
      let result = await put(value);
      if (result !== "unauthorized") return;
      if (!(await ensureAuthenticated())) {
        if (sessionRef.current?.configured !== false) setState("unauthorized");
        return;
      }
      result = await put(localRef.current ?? value);
      if (result === "unauthorized") setState("unauthorized");
    },
    [put, ensureAuthenticated, setState]
  );

  // The autosaver is created once; it reaches the current `write` through
  // a ref so a pending timer never fires a stale closure.
  const writeRef = useRef(write);
  useEffect(() => {
    writeRef.current = write;
  }, [write]);
  const autosaveRef = useRef<ReturnType<typeof createAutosave<LayoutProfile>> | null>(null);
  const autosave = useCallback(() => {
    autosaveRef.current ??= createAutosave<LayoutProfile>((value) => writeRef.current(value), AUTOSAVE_DELAY_MS);
    return autosaveRef.current;
  }, []);

  // A pending change should not die with the tab. `keepalive` on the PUT
  // lets the request outlive the page.
  useEffect(() => {
    const onUnload = () => {
      if (localRef.current) void autosave().flush();
    };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, [autosave]);

  /**
   * Every mutation goes through here. `fn` returns the same object when it
   * refuses (required module, disallowed width), and nothing happens then.
   * When the server wants a password and this device has no session yet,
   * the very first change asks for it and is applied once it is given.
   */
  const mutateProfile = useCallback(
    async (fn: (base: LayoutProfile) => LayoutProfile): Promise<boolean> => {
      const current = sessionRef.current;
      if (current?.configured && !current.authenticated && !(await ensureAuthenticated())) {
        return false;
      }
      const base = localRef.current ?? savedRef.current;
      const next = fn(base);
      if (next === base) return false;
      commitLocal(next);
      autosave().schedule(next);
      return true;
    },
    [autosave, commitLocal, ensureAuthenticated]
  );

  const value = useMemo<LayoutContextValue>(() => {
    const performResetAll = async (): Promise<WriteResult> => {
      const response = await fetch("/api/layout", { method: "DELETE" });
      if (response.status === 401) return "unauthorized";
      if (!response.ok) {
        setState("error", `Reset failed (${response.status})`);
        return "failed";
      }
      const body = await response.json();
      revisionRef.current = body.revision;
      await mutate(body, { revalidate: false });
      autosave().cancel();
      commitLocal(null);
      setState("saved");
      return "ok";
    };

    return {
      profile,
      saved,
      revision,
      ready,
      pending: local !== null,
      saveState,
      saveError,
      authenticated,
      authConfigured,

      setEnabled: (viewId, moduleId, enabled) =>
        mutateProfile((base) => applyModuleOverride(base, viewId, moduleId, { enabled })),

      setWidth: (viewId, moduleId, width) =>
        mutateProfile((base) => applyModuleOverride(base, viewId, moduleId, { width })),

      setDensity: (viewId, moduleId, density) =>
        mutateProfile((base) => applyModuleOverride(base, viewId, moduleId, { density })),

      moveModule: (viewId, moduleId, delta, among) =>
        mutateProfile((base) => {
          const visible = among ?? resolveView(viewId, base).modules.map((m) => m.moduleId);
          return applyOrder(base, viewId, moveAmongVisible(currentOrder(base, viewId), visible, moduleId, delta));
        }),

      placeModule: (viewId, moduleId, beforeId) =>
        mutateProfile((base) => applyOrder(base, viewId, placeBefore(currentOrder(base, viewId), moduleId, beforeId))),

      setOrder: (viewId, order) => mutateProfile((base) => applyOrder(base, viewId, order)),

      resetAll: async () => {
        if (authConfigured && !authenticated && !(await ensureAuthenticated())) return false;
        let result = await performResetAll();
        if (result === "unauthorized") {
          if (!(await ensureAuthenticated())) return false;
          result = await performResetAll();
        }
        return result === "ok";
      },

      flush: async () => {
        // A write refused earlier (401, prompt dismissed) consumed its
        // scheduled value; put the unsaved layer back on the queue first.
        const saver = autosave();
        if (localRef.current && !saver.pending) saver.schedule(localRef.current);
        await saver.flush();
      },

      refreshAuth: () => {
        void mutateSession();
      },

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
        const next = { authenticated: true, configured: true };
        sessionRef.current = next;
        await mutateSession(next, { revalidate: false });
        setAuthPrompt(false);
        if (saveState === "unauthorized") setState("idle");
        pendingAuth.current?.(true);
        pendingAuth.current = null;
        return { ok: true, error: null };
      },

      dismissAuthPrompt: () => {
        setAuthPrompt(false);
        pendingAuth.current?.(false);
        pendingAuth.current = null;
      },
    };
  }, [
    profile,
    saved,
    revision,
    ready,
    local,
    saveState,
    saveError,
    authenticated,
    authConfigured,
    authPrompt,
    autosave,
    mutate,
    mutateSession,
    mutateProfile,
    ensureAuthenticated,
    commitLocal,
    setState,
  ]);

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayout(): LayoutContextValue {
  const context = useContext(LayoutContext);
  if (!context) throw new Error("useLayout must be used inside LayoutProvider");
  return context;
}

/**
 * What a view renders: the saved profile with unsaved changes on top, so a
 * change shows the moment it is made and the write catches up.
 */
export function useResolvedView(viewId: SurfaceId): ResolvedView {
  const { profile } = useLayout();
  return useMemo(() => resolveView(viewId, profile), [viewId, profile]);
}

