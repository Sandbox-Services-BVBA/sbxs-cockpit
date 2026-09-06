"use client";

// The cockpit is one plane. This is it.
//
// Every module the catalog knows is a tile on a board that is wider and
// taller than the window, placed where Bob dragged it and sized by its
// corner. There is no edit mode and no navigation: the strip above each
// tile holds the grip, the menu (detail, reset size) and the close, the +
// button brings a closed tile back, and every change is written on a short
// debounce.
//
// The same board on every screen. A phone gets the plane too, panned with a
// finger and pinched to zoom, rather than a stacked list that would have
// been a different product wearing the same data.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useHomeMode } from "@/components/dashboard/home/home-console-provider";
import { getDashboardHealth } from "@/lib/dashboard-health";
import { useLayout, useResolvedView } from "@/lib/layout/client";
import { MODULE_BY_ID } from "@/lib/layout/catalog";
import { CANVAS_DEFAULT_RECTS } from "@/lib/layout/default-layouts";
import {
  CANVAS_MAX_COLS,
  CANVAS_MAX_ROWS,
  findFreeRect,
  planeCols,
  rectsOverlap,
} from "@/lib/layout/grid";
import { homeModuleApplies } from "@/lib/layout/home-modules";
import type { ModuleDensity, ResolvedGroup, ResolvedModule, TileRect } from "@/lib/layout/types";
import {
  AddTray,
  CanvasGrid,
  GroupFrame,
  DENSITY_LABELS,
  LiveRegion,
  PasswordPrompt,
  SaveStatus,
  SelectionBar,
  TileChrome,
  UndoToast,
  useFocusAfter,
  type UndoToastState,
} from "@/components/canvas";
import { ModuleFrame } from "./module-frame";
import { moduleNode } from "./module-renderers";
import { homeModuleNode } from "./home-renderers";
import { SourceFreshnessNotice, ViewError, ViewSkeleton } from "./view-chrome";

const VIEW = "canvas";

export function CanvasView() {
  const { data, loading, error } = useDashboardData();
  const {
    ready,
    setEnabled,
    setDensity,
    setRects,
    openModule,
    groupModules,
    ungroup,
    renameGroupBy,
    recolourGroup,
  } = useLayout();
  const resolved = useResolvedView(VIEW);
  const health = getDashboardHealth(data);
  const { register, focusAfter, announcement } = useFocusAfter();
  const [toast, setToast] = useState<UndoToastState | null>(null);
  // A tile just added from the tray, to bring on screen once it has mounted.
  const arriving = useRef<string | null>(null);
  // Bumped when a write was refused, so the grid stops drawing a tile where
  // it was dropped and goes back to what is actually saved.
  const [resyncKey, setResyncKey] = useState(0);
  // Zoom lives in the plane, which owns the gesture; the dock only needs a
  // readout and a way back to 100 percent, so it is reported outwards.
  const [zoom, setZoom] = useState<{ value: number; reset: () => void } | null>(null);
  const onZoom = useCallback((value: number, reset: () => void) => setZoom({ value, reset }), []);
  // Which tiles are picked out, purely so they can be named as a group.
  // Never saved: a selection is a thing you are doing, not a thing you have.
  const [selected, setSelected] = useState<string[]>([]);

  // What is actually on screen: enabled, minus the Home tiles that do not
  // apply to the current timeframe. Subscribing to the mode is what makes a
  // live or period switch recompute it.
  const mode = useHomeMode();
  const visible = useMemo(
    () => resolved.modules.filter((entry) => homeModuleApplies(entry.moduleId, mode)),
    [resolved.modules, mode]
  );

  const commit = useCallback(
    (promise: Promise<boolean>, note: string, anchor?: string) => {
      void promise.then((ok) => {
        if (ok) focusAfter(note, ...(anchor ? [anchor] : []));
        else setResyncKey((key) => key + 1);
      });
    },
    [focusAfter]
  );

  const onRects = useCallback(
    (rects: Record<string, TileRect>) => {
      void setRects(VIEW, rects).then((ok) => {
        if (!ok) setResyncKey((key) => key + 1);
      });
    },
    [setRects]
  );

  /** The cells every other visible tile is sitting in. */
  const othersThan = useCallback(
    (moduleId: string) => visible.filter((t) => t.moduleId !== moduleId).map((t) => t.rect),
    [visible]
  );

  /** Applies a rectangle if it is on the plane and nothing is already there. */
  const place = useCallback(
    (entry: ResolvedModule, rect: TileRect, note: string) => {
      const { minSize } = entry.definition;
      if (rect.x < 0 || rect.y < 0 || rect.w < minSize.w || rect.h < minSize.h) return;
      if (rect.x + rect.w > CANVAS_MAX_COLS || rect.y + rect.h > CANVAS_MAX_ROWS) return;
      if (othersThan(entry.moduleId).some((other) => rectsOverlap(rect, other))) return;
      commit(setRects(VIEW, { [entry.moduleId]: rect }), note, `${entry.moduleId}:grip`);
    },
    [commit, othersThan, setRects]
  );

  const nudge = (entry: ResolvedModule, dx: number, dy: number) =>
    place(
      entry,
      { ...entry.rect, x: entry.rect.x + dx, y: entry.rect.y + dy },
      `${entry.definition.title} moved`
    );

  const resize = (entry: ResolvedModule, dw: number, dh: number) =>
    place(
      entry,
      { ...entry.rect, w: entry.rect.w + dw, h: entry.rect.h + dh },
      `${entry.definition.title} resized to ${entry.rect.w + dw} by ${entry.rect.h + dh}`
    );

  const resetSize = (entry: ResolvedModule) => {
    const size = entry.definition.defaultSize;
    const rect = findFreeRect(othersThan(entry.moduleId), size, { ...entry.rect, ...size });
    commit(
      setRects(VIEW, { [entry.moduleId]: rect }),
      `${entry.definition.title} back to its default size`,
      `${entry.moduleId}:menu`
    );
  };

  // The follow-ups wait for the setter: on a device without a session the
  // first change opens the password prompt, and a cancelled prompt must not
  // leave a "Closed" toast for a tile that is still there.
  const close = (entry: ResolvedModule) => {
    void setEnabled(VIEW, entry.moduleId, false).then((ok) => {
      if (!ok) return;
      setToast({ moduleId: entry.moduleId, title: entry.definition.title });
      focusAfter(`Closed ${entry.definition.title}. Undo is available for a moment.`);
    });
  };

  // A reopened tile cannot simply go back to its default slot: whatever Bob
  // has since dragged there is very likely in the way, and two tiles in the
  // same cells would render on top of each other. Its old spot is tried
  // first, so closing and immediately undoing puts it back where it was.
  const reopen = useCallback(
    (moduleId: string) => {
      setToast(null);
      const definition = MODULE_BY_ID[moduleId];
      if (!definition) return;
      const occupied = visible.map((tile) => tile.rect);
      // Scanned across the board as it is now, so the tile fills a gap
      // rather than landing out on the spare room at the right.
      const rect = findFreeRect(
        occupied,
        definition.defaultSize,
        CANVAS_DEFAULT_RECTS[moduleId],
        planeCols(occupied)
      );
      void openModule(VIEW, moduleId, rect).then((ok) => {
        if (!ok) return;
        arriving.current = moduleId;
        focusAfter(`Added ${definition.title} to the board`);
      });
    },
    [openModule, focusAfter, visible]
  );

  const dismissToast = useCallback(() => setToast(null), []);

  // After every commit: once the added tile is in the DOM, bring it on
  // screen and hand it focus without a second jump. A tile that has not
  // mounted yet is tried again next render, which is how a change held
  // behind the password prompt works.
  useEffect(() => {
    const id = arriving.current;
    if (!id) return;
    const tile = document.querySelector<HTMLElement>(`[data-module-id="${CSS.escape(id)}"]`);
    if (!tile) return;
    arriving.current = null;
    tile.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    tile.querySelector<HTMLElement>(".canvas-tile__grip")?.focus({ preventScroll: true });
  });

  const select = (moduleId: string, additive: boolean) =>
    setSelected((current) => {
      if (!additive) return current.length === 1 && current[0] === moduleId ? [] : [moduleId];
      return current.includes(moduleId)
        ? current.filter((id) => id !== moduleId)
        : [...current, moduleId];
    });

  const makeGroup = () => {
    const members = selected.filter((id) => visible.some((tile) => tile.moduleId === id));
    if (members.length < 2) return;
    // Named after nothing in particular, because the point is that Bob
    // renames it: the tiles already say what they are, the group says why
    // they are together, and only he knows that.
    const name = `Groep ${resolved.groups.length + 1}`;
    void groupModules(VIEW, members, name).then((ok) => {
      if (!ok) return;
      setSelected([]);
      focusAfter(`Grouped ${members.length} widgets as ${name}`);
    });
  };

  /**
   * Where a group's members were when the drag started, and what they have
   * to avoid. Taken once, because the window listeners that drive the drag
   * keep the props they were handed: measuring against "wherever the tiles
   * are now" would read a base that stopped updating at pointerdown.
   */
  const groupDrag = useRef<{ base: { id: string; rect: TileRect }[]; outsiders: TileRect[] } | null>(null);

  const startGroupDrag = (group: ResolvedGroup) => {
    const isMember = (tile: ResolvedModule) => group.moduleIds.includes(tile.moduleId);
    groupDrag.current = {
      base: visible.filter(isMember).map((tile) => ({ id: tile.moduleId, rect: tile.rect })),
      outsiders: visible.filter((tile) => !isMember(tile)).map((tile) => tile.rect),
    };
  };

  /**
   * Offset every member of a group from where it started, or none of them.
   * A group that half-moved because one tile was blocked would stop being a
   * group in any useful sense, so the whole arrangement is checked first.
   */
  const moveGroupTo = (dx: number, dy: number) => {
    const drag = groupDrag.current;
    if (!drag) return;

    const moved: Record<string, TileRect> = {};
    for (const { id, rect: from } of drag.base) {
      const rect = { ...from, x: from.x + dx, y: from.y + dy };
      if (rect.x < 0 || rect.y < 0) return;
      if (rect.x + rect.w > CANVAS_MAX_COLS || rect.y + rect.h > CANVAS_MAX_ROWS) return;
      if (drag.outsiders.some((other) => rectsOverlap(rect, other))) return;
      moved[id] = rect;
    }
    void setRects(VIEW, moved).then((ok) => {
      if (!ok) setResyncKey((key) => key + 1);
    });
  };

  const density = (entry: ResolvedModule, value: ModuleDensity) =>
    commit(
      setDensity(VIEW, entry.moduleId, value),
      `${entry.definition.title}: ${DENSITY_LABELS[value]}`,
      `${entry.moduleId}:menu`
    );

  // Closed modules are absent from `visible`, so they never mount and a
  // self-fetching one stops polling. Shared-data modules wait for the
  // payload; Home and self-fetching ones render straight away. Nothing
  // mounts until the profile is known, so a closed tile never flashes up on
  // the defaults and fires a fetch first.
  const mountable = (entry: ResolvedModule) => entry.definition.dataMode !== "shared" || data !== null;
  const waiting = !ready || (loading && !data && !visible.some(mountable));

  const body = (entry: ResolvedModule) =>
    homeModuleNode(entry.moduleId, { density: entry.density }) ??
    moduleNode(entry.moduleId, {
      data,
      agentStale: health.agentStale,
      density: entry.density,
      layout: "grid",
    });

  const frame = (entry: ResolvedModule) => {
    const node = body(entry);
    if (node === null) return null;
    return (
      <ModuleFrame
        resolved={entry}
        fill
        selected={selected.includes(entry.moduleId)}
        chrome={
          <TileChrome
            resolved={entry}
            onNudge={(dx, dy) => nudge(entry, dx, dy)}
            onResize={(dw, dh) => resize(entry, dw, dh)}
            onResetSize={() => resetSize(entry)}
            onClose={() => close(entry)}
            onDensity={(value) => density(entry, value)}
            onSelect={(additive) => select(entry.moduleId, additive)}
            gripRef={register(`${entry.moduleId}:grip`)}
            menuRef={register(`${entry.moduleId}:menu`)}
          />
        }
      >
        {node}
      </ModuleFrame>
    );
  };

  // The grid needs its children and its layout to agree exactly, so a tile
  // whose module renders nothing is dropped from both.
  const placed = useMemo(
    () => visible.filter((entry) => mountable(entry) && body(entry) !== null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, data, health.agentStale]
  );

  return (
    <div className="canvas">
      {error && (
        <div className="canvas-notice">
          <ViewError message={error} />
        </div>
      )}
      {data && (health.agentStale || health.uptimeStale) && (
        <div className="canvas-notice">
          <SourceFreshnessNotice agentStale={health.agentStale} uptimeStale={health.uptimeStale} />
        </div>
      )}

      {waiting ? (
        <ViewSkeleton />
      ) : (
        <CanvasGrid
          tiles={placed}
          onRects={onRects}
          resyncKey={resyncKey}
          renderTile={frame}
          onZoom={onZoom}
          overlay={(scale) =>
            resolved.groups.map((group) => (
              <GroupFrame
                key={group.id}
                group={group}
                zoom={scale}
                onMoveStart={() => startGroupDrag(group)}
                onMoveTo={moveGroupTo}
                onRename={(name) => void renameGroupBy(VIEW, group.id, name)}
                onTone={(tone) => void recolourGroup(VIEW, group.id, tone)}
                onUngroup={() =>
                  void ungroup(VIEW, group.id).then((ok) => {
                    if (ok) focusAfter(`Ungrouped ${group.name}`);
                  })
                }
              />
            ))
          }
        />
      )}

      <div className="canvas-dock">
        <SelectionBar count={selected.length} onGroup={makeGroup} onClear={() => setSelected([])} />
        {zoom && zoom.value !== 1 && (
          <button type="button" className="canvas-zoom" onClick={zoom.reset} title="Back to 100 percent">
            {Math.round(zoom.value * 100)}%
          </button>
        )}
        <SaveStatus />
        {ready && <AddTray hidden={resolved.hidden} onAdd={reopen} />}
      </div>
      <UndoToast toast={toast} onUndo={reopen} onDismiss={dismissToast} />
      <LiveRegion text={announcement} />
      <PasswordPrompt />
    </div>
  );
}
