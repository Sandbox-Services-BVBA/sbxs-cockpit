"use client";

// The cockpit is one page. This is it.
//
// Every module the catalog knows sits in one grid, in the order Bob left
// it. There is no edit mode: the strip above each tile holds the grip, the
// menu (width, detail, move) and the close; the + button brings a closed
// tile back. Each change shows at once and the layout provider writes it
// on a short debounce.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useHomeMode } from "@/components/dashboard/home/home-console-provider";
import { getDashboardHealth } from "@/lib/dashboard-health";
import { useLayout, useResolvedView } from "@/lib/layout/client";
import { MODULE_BY_ID } from "@/lib/layout/catalog";
import { GRID_CLASS } from "@/lib/layout/grid";
import { homeModuleApplies } from "@/lib/layout/home-modules";
import type { ModuleDensity, ModuleWidth, ResolvedModule } from "@/lib/layout/types";
import {
  AddTray,
  DENSITY_LABELS,
  LiveRegion,
  PasswordPrompt,
  SaveStatus,
  TileChrome,
  UndoToast,
  WIDTH_LABELS,
  useFocusAfter,
  useSortableGrid,
  type SortableDrop,
  type UndoToastState,
} from "@/components/canvas";
import { ModuleFrame } from "./module-frame";
import { moduleNode } from "./module-renderers";
import { homeModuleNode } from "./home-renderers";
import { SourceFreshnessNotice, ViewError, ViewSkeleton } from "./view-chrome";

const VIEW = "canvas";

export function CanvasView() {
  const { data, loading, error } = useDashboardData();
  const { ready, setEnabled, setWidth, setDensity, moveModule, placeModule } = useLayout();
  const resolved = useResolvedView(VIEW);
  const health = getDashboardHealth(data);
  const { register, focusAfter, announcement } = useFocusAfter();
  const [toast, setToast] = useState<UndoToastState | null>(null);
  // A tile just added from the tray, to scroll to once it has mounted.
  const arriving = useRef<string | null>(null);

  // What is actually on screen: enabled, minus the Home tiles that do not
  // apply to the current timeframe. Moves and the "n of m" announcement
  // work over this list, so a keyboard move never swaps with a tile that
  // is not there to see. Subscribing to the mode is what makes a live or
  // period switch recompute it.
  const mode = useHomeMode();
  const visible = useMemo(
    () => resolved.modules.filter((entry) => homeModuleApplies(entry.moduleId, mode)),
    [resolved.modules, mode]
  );
  const shown = useMemo(() => visible.map((entry) => entry.moduleId), [visible]);
  const count = visible.length;

  const titleOf = useCallback(
    (moduleId: string) => visible.find((m) => m.moduleId === moduleId)?.definition.title ?? moduleId,
    [visible]
  );

  const onDrop = useCallback(
    ({ moduleId, beforeId }: SortableDrop) => {
      void placeModule(VIEW, moduleId, beforeId).then((ok) => {
        if (ok) focusAfter(`${titleOf(moduleId)} moved`);
      });
    },
    [placeModule, focusAfter, titleOf]
  );
  const gridRef = useSortableGrid(onDrop);

  const move = (entry: ResolvedModule, index: number, delta: number, from: "grip" | "menu") => {
    const target = index + delta;
    if (target < 0 || target >= count) return;
    void moveModule(VIEW, entry.moduleId, delta, shown).then((ok) => {
      if (!ok) return;
      focusAfter(
        `${entry.definition.title} moved ${delta < 0 ? "up" : "down"}, now ${target + 1} of ${count}`,
        `${entry.moduleId}:${from}`,
        `${entry.moduleId}:grip`
      );
    });
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

  const reopen = useCallback(
    (moduleId: string) => {
      setToast(null);
      void setEnabled(VIEW, moduleId, true).then((ok) => {
        if (!ok) return;
        arriving.current = moduleId;
        focusAfter(`Added ${MODULE_BY_ID[moduleId]?.title ?? moduleId} to the page`);
      });
    },
    [setEnabled, focusAfter]
  );

  const dismissToast = useCallback(() => setToast(null), []);

  // After every commit: once the added tile is in the DOM, bring it on
  // screen and hand it focus without a second jump; the smooth scroll is
  // the one movement. A tile that has not mounted yet is tried again next
  // render, which is how a change held behind the password prompt works.
  useEffect(() => {
    const id = arriving.current;
    if (!id) return;
    const tile = document.querySelector<HTMLElement>(`[data-module-id="${CSS.escape(id)}"]`);
    if (!tile) return;
    arriving.current = null;
    tile.scrollIntoView({ block: "center", behavior: "smooth" });
    tile.querySelector<HTMLElement>(".canvas-tile__grip")?.focus({ preventScroll: true });
  });

  const width = (entry: ResolvedModule, value: ModuleWidth) => {
    void setWidth(VIEW, entry.moduleId, value).then((ok) => {
      if (ok) focusAfter(`${entry.definition.title}: ${WIDTH_LABELS[value]}`, `${entry.moduleId}:menu`);
    });
  };
  const density = (entry: ResolvedModule, value: ModuleDensity) => {
    void setDensity(VIEW, entry.moduleId, value).then((ok) => {
      if (ok) focusAfter(`${entry.definition.title}: ${DENSITY_LABELS[value]}`, `${entry.moduleId}:menu`);
    });
  };

  // Closed modules are absent from `visible`, so they never mount and a
  // self-fetching one stops polling. Shared-data modules wait for the
  // payload; Home and self-fetching ones render straight away. Nothing
  // mounts until the profile is known, so a closed tile never flashes up
  // on the defaults and fires a fetch first. Index and count are taken
  // over `visible`, the same list the provider moves within, so "3 of 37"
  // stays true while the shared payload is still on its way.
  const mountable = (entry: ResolvedModule) => entry.definition.dataMode !== "shared" || data !== null;
  const waiting = !ready || (loading && !data && !visible.some(mountable));

  return (
    <div className="canvas space-y-3">
      {error && <ViewError message={error} />}
      {data && <SourceFreshnessNotice agentStale={health.agentStale} uptimeStale={health.uptimeStale} />}

      {waiting ? (
        <ViewSkeleton />
      ) : (
        <div ref={gridRef} className={GRID_CLASS} data-canvas-grid>
          {visible.map((entry, index) => {
            if (!mountable(entry)) return null;
            const node =
              homeModuleNode(entry.moduleId, { density: entry.density }) ??
              moduleNode(entry.moduleId, {
                data,
                agentStale: health.agentStale,
                density: entry.density,
                layout: "grid",
              });
            if (node === null) return null;
            return (
              <ModuleFrame
                key={entry.moduleId}
                resolved={entry}
                chrome={
                  <TileChrome
                    resolved={entry}
                    index={index}
                    count={count}
                    onMove={(delta, source) => move(entry, index, delta, source)}
                    onClose={() => close(entry)}
                    onWidth={(value) => width(entry, value)}
                    onDensity={(value) => density(entry, value)}
                    gripRef={register(`${entry.moduleId}:grip`)}
                    menuRef={register(`${entry.moduleId}:menu`)}
                  />
                }
              >
                {node}
              </ModuleFrame>
            );
          })}
        </div>
      )}

      <div className="canvas-dock">
        <SaveStatus />
        {ready && <AddTray hidden={resolved.hidden} onAdd={reopen} />}
      </div>
      <UndoToast toast={toast} onUndo={reopen} onDismiss={dismissToast} />
      <LiveRegion text={announcement} />
      <PasswordPrompt />
    </div>
  );
}
