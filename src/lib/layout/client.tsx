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
  GROUP_TONES,
  MAX_GROUPS,
  MAX_GROUP_NAME,
  type LayoutProfile,
  type ModuleDensity,
  type ModuleOverride,
  type ModuleWidth,
  type ResolvedView,
  type SurfaceId,
  type TileGroup,
  type TileRect,
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
  /**
   * Where the canvas tiles sit, as one batch. A single drag settles the
   * whole grid, so the board is written once rather than once per tile
   * that shifted, and the autosave debounce sees one change.
   */
  setRects: (viewId: SurfaceId, rects: Record<string, TileRect>) => Promise<boolean>;
  /** Brings a closed tile back at a rectangle the caller has found room for. */
  openModule: (viewId: SurfaceId, moduleId: string, rect: TileRect) => Promise<boolean>;
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

  /**
   * Grouping. A group is a border and a label around tiles that are
   * already where they are: nothing moves, nothing resizes, and a module
   * belongs to at most one group, so grouping tiles that are already in
   * another border takes them out of it.
   */
  groupModules: (viewId: SurfaceId, moduleIds: string[], name: string) => Promise<boolean>;
  ungroup: (viewId: SurfaceId, groupId: string) => Promise<boolean>;
  renameGroupBy: (viewId: SurfaceId, groupId: string, name: string) => Promise<boolean>;
  recolourGroup: (viewId: SurfaceId, groupId: string, tone: number) => Promise<boolean>;
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

/** True when two rectangles are the same cell for cell. */
function sameRect(a: TileRect | undefined, b: TileRect): boolean {
  return a !== undefined && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/**
 * Writes a batch of canvas rectangles into a copy of the profile.
 *
 * Only rectangles that actually moved are written, and if none did the
 * original profile comes back unchanged. That matters more than it looks:
 * the grid reports its layout on mount and on every render, not only after
 * a gesture, so without this check simply opening the page would queue a
 * save and climb the revision on every device that looked at it.
 */
export function applyRects(
  profile: LayoutProfile,
  viewId: SurfaceId,
  rects: Record<string, TileRect>
): LayoutProfile {
  const current = profile.views?.[viewId]?.modules ?? {};
  const changed = Object.entries(rects).filter(
    ([moduleId, rect]) => MODULE_BY_ID[moduleId] && !sameRect(current[moduleId]?.rect, rect)
  );
  if (changed.length === 0) return profile;

  const next = clone(profile);
  next.views ??= {};
  next.views[viewId] ??= {};
  const view = next.views[viewId]!;
  view.modules ??= {};
  for (const [moduleId, rect] of changed) {
    view.modules[moduleId] = { ...view.modules[moduleId], rect: { ...rect } };
  }
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

/* --- Groups ---------------------------------------------------------------
   A group is a named set of module ids. It owns no data and moves nothing:
   the border the canvas draws is derived from where its members already
   are, so every mutation here is a list edit. The invariant the renderer
   leans on is that a module is in at most one group, and `applyGroup` is
   what keeps it true. */

function viewGroups(profile: LayoutProfile, viewId: SurfaceId): TileGroup[] {
  return profile.views?.[viewId]?.groups ?? [];
}

function sameGroup(a: TileGroup, b: TileGroup): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    (a.tone ?? 0) === (b.tone ?? 0) &&
    a.modules.length === b.modules.length &&
    a.modules.every((id, index) => id === b.modules[index])
  );
}

function sameGroups(a: TileGroup[], b: TileGroup[]): boolean {
  return a.length === b.length && a.every((group, index) => sameGroup(group, b[index]));
}

/** Writes a list of groups for a view, dropping the key when none are left. */
function withGroups(profile: LayoutProfile, viewId: SurfaceId, groups: TileGroup[]): LayoutProfile {
  if (sameGroups(viewGroups(profile, viewId), groups)) return profile;
  const next = clone(profile);
  next.views ??= {};
  next.views[viewId] ??= {};
  const view = next.views[viewId]!;
  if (groups.length > 0) view.groups = groups;
  else delete view.groups;
  return next;
}

/**
 * A fresh group id for this view: the lowest free `gN`. Short enough to
 * read in a saved profile, never derived from the name (renaming a group
 * must not change its identity, and two groups may share a name), and free
 * of collisions within the view, which is the only scope that matters
 * because a concurrent device is already handled by the revision lock.
 */
export function nextGroupId(profile: LayoutProfile, viewId: SurfaceId): string {
  const taken = new Set(viewGroups(profile, viewId).map((group) => group.id));
  for (let n = 1; ; n += 1) {
    const id = `g${n}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * Creates a group, or replaces the one with the same id. The incoming
 * members are pulled out of every other group first, so a tile dragged
 * into a new border leaves the old one rather than belonging to both; a
 * group emptied that way disappears with it.
 *
 * Refuses (returns the profile unchanged) an unknown module, an empty set,
 * an over-long name, a tone outside the palette, or a new group past the
 * cap. Refusing is how the provider knows not to schedule a write.
 */
export function applyGroup(profile: LayoutProfile, viewId: SurfaceId, group: TileGroup): LayoutProfile {
  if (typeof group.id !== "string" || !/^[a-z0-9-]{1,64}$/.test(group.id)) return profile;
  if (typeof group.name !== "string" || group.name.trim().length > MAX_GROUP_NAME) return profile;
  const tone = group.tone ?? 0;
  if (!Number.isInteger(tone) || tone < 0 || tone >= GROUP_TONES) return profile;
  if (!Array.isArray(group.modules) || group.modules.length === 0) return profile;
  const modules: string[] = [];
  for (const moduleId of group.modules) {
    if (!MODULE_BY_ID[moduleId]) return profile;
    if (!modules.includes(moduleId)) modules.push(moduleId);
  }

  const existing = viewGroups(profile, viewId);
  const replacing = existing.some((entry) => entry.id === group.id);
  if (!replacing && existing.length >= MAX_GROUPS) return profile;

  const incoming: TileGroup = { id: group.id, name: group.name.trim(), modules };
  if (tone !== 0) incoming.tone = tone;

  const claimed = new Set(modules);
  const next: TileGroup[] = [];
  for (const entry of existing) {
    if (entry.id === incoming.id) {
      next.push(incoming);
      continue;
    }
    const kept = entry.modules.filter((moduleId) => !claimed.has(moduleId));
    if (kept.length === 0) continue;
    next.push(kept.length === entry.modules.length ? entry : { ...entry, modules: kept });
  }
  if (!replacing) next.push(incoming);

  return withGroups(profile, viewId, next);
}

/** Dissolves a group. Its tiles stay exactly where they are. */
export function removeGroup(profile: LayoutProfile, viewId: SurfaceId, groupId: string): LayoutProfile {
  const existing = viewGroups(profile, viewId);
  if (!existing.some((group) => group.id === groupId)) return profile;
  return withGroups(profile, viewId, existing.filter((group) => group.id !== groupId));
}

/** Renames a group. An empty name is allowed: that is a border with no label. */
export function renameGroup(
  profile: LayoutProfile,
  viewId: SurfaceId,
  groupId: string,
  name: string
): LayoutProfile {
  if (typeof name !== "string") return profile;
  const trimmed = name.trim();
  if (trimmed.length > MAX_GROUP_NAME) return profile;
  const existing = viewGroups(profile, viewId);
  if (!existing.some((group) => group.id === groupId)) return profile;
  return withGroups(
    profile,
    viewId,
    existing.map((group) => (group.id === groupId ? { ...group, name: trimmed } : group))
  );
}

/** Moves a group to another accent slot. The colour itself is the UI's business. */
export function setGroupTone(
  profile: LayoutProfile,
  viewId: SurfaceId,
  groupId: string,
  tone: number
): LayoutProfile {
  if (!Number.isInteger(tone) || tone < 0 || tone >= GROUP_TONES) return profile;
  const existing = viewGroups(profile, viewId);
  if (!existing.some((group) => group.id === groupId)) return profile;
  return withGroups(
    profile,
    viewId,
    existing.map((group) => {
      if (group.id !== groupId) return group;
      const next: TileGroup = { id: group.id, name: group.name, modules: group.modules };
      if (tone !== 0) next.tone = tone;
      return next;
    })
  );
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

      setRects: (viewId, rects) => mutateProfile((base) => applyRects(base, viewId, rects)),

      openModule: (viewId, moduleId, rect) =>
        mutateProfile((base) => applyModuleOverride(base, viewId, moduleId, { enabled: true, rect })),

      moveModule: (viewId, moduleId, delta, among) =>
        mutateProfile((base) => {
          const visible = among ?? resolveView(viewId, base).modules.map((m) => m.moduleId);
          return applyOrder(base, viewId, moveAmongVisible(currentOrder(base, viewId), visible, moduleId, delta));
        }),

      placeModule: (viewId, moduleId, beforeId) =>
        mutateProfile((base) => applyOrder(base, viewId, placeBefore(currentOrder(base, viewId), moduleId, beforeId))),

      setOrder: (viewId, order) => mutateProfile((base) => applyOrder(base, viewId, order)),

      groupModules: (viewId, moduleIds, name) =>
        mutateProfile((base) =>
          applyGroup(base, viewId, { id: nextGroupId(base, viewId), name, modules: moduleIds })
        ),

      ungroup: (viewId, groupId) => mutateProfile((base) => removeGroup(base, viewId, groupId)),

      renameGroupBy: (viewId, groupId, name) =>
        mutateProfile((base) => renameGroup(base, viewId, groupId, name)),

      recolourGroup: (viewId, groupId, tone) =>
        mutateProfile((base) => setGroupTone(base, viewId, groupId, tone)),

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

