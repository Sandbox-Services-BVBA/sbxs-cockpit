"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { useLayout } from "@/lib/layout/client";
import type { ModuleDensity, ModuleWidth, ResolvedModule, ResolvedView, ViewId } from "@/lib/layout/types";
import { VIEW_BY_ID } from "@/lib/views";
import { EditorActions } from "./editor-actions";
import { moduleNote } from "./module-notes";
import { useFocusAfter } from "./use-focus-after";

// The compact editor for one view: an ordered list with one row per module
// instead of the live canvas, so it stays usable on a phone. Everything is a
// real button, checkbox or select; the only thing that is not a native
// control is the live region that reports moves to screen readers.

const WIDTH_LABELS: Record<ModuleWidth, string> = {
  compact: "Compact",
  standard: "Standard",
  wide: "Wide",
  full: "Full",
};

const DENSITY_LABELS: Record<ModuleDensity, string> = {
  summary: "Summary",
  standard: "Standard",
  full: "Full",
};

interface ViewEditorProps {
  viewId: ViewId;
  resolved: ResolvedView;
  /** The live grid, rendered by the view on desktop only. */
  preview?: ReactNode;
}

export function ViewEditor({ viewId, resolved, preview }: ViewEditorProps) {
  const { setEnabled, setWidth, setDensity, moveModule, resetAllWithAuth } = useLayout();
  const { register, focusAfter, announcement } = useFocusAfter();
  const [resetting, setResetting] = useState(false);
  const label = VIEW_BY_ID[viewId].label;
  const count = resolved.modules.length;

  const move = (entry: ResolvedModule, delta: number) => {
    const index = resolved.modules.findIndex((m) => m.moduleId === entry.moduleId);
    const to = index + delta;
    if (to < 0 || to >= count) return;
    moveModule(viewId, entry.moduleId, delta);
    const direction = delta < 0 ? "up" : "down";
    const other = delta < 0 ? "down" : "up";
    // Keep focus on the same button; if it just became disabled at an edge,
    // step to its sibling so the keyboard user is never dropped.
    focusAfter(
      `${entry.definition.title} moved ${direction} to position ${to + 1} of ${count}.`,
      `${entry.moduleId}:${direction}`,
      `${entry.moduleId}:${other}`
    );
  };

  const hide = (entry: ResolvedModule) => {
    setEnabled(viewId, entry.moduleId, false);
    focusAfter(`${entry.definition.title} hidden. It is in the Add module tray.`, `${entry.moduleId}:add`);
  };

  const show = (entry: ResolvedModule) => {
    setEnabled(viewId, entry.moduleId, true);
    focusAfter(`${entry.definition.title} added to ${label}.`, `${entry.moduleId}:visible`);
  };

  const resetAll = async () => {
    if (!window.confirm("Reset every view and the navigation to the code defaults? This saves immediately.")) return;
    setResetting(true);
    await resetAllWithAuth();
    setResetting(false);
  };

  return (
    <div className="editor-split">
      <section className="editor" aria-labelledby="editor-heading">
        <div className="editor__head">
          <h2 id="editor-heading" className="serif editor__title">
            Customize {label}
          </h2>
          <p className="editor__lede">
            Show, hide, reorder and resize the modules in this view. Nothing changes until you save.
          </p>
        </div>

        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>

        <ol className="editor-list" aria-label={`Modules in ${label}, in display order`}>
          {resolved.modules.map((entry, index) => (
            <ModuleRow
              key={entry.moduleId}
              entry={entry}
              index={index}
              count={count}
              register={register}
              onHide={() => hide(entry)}
              onMove={(delta) => move(entry, delta)}
              onWidth={(width) => setWidth(viewId, entry.moduleId, width)}
              onDensity={(density) => setDensity(viewId, entry.moduleId, density)}
            />
          ))}
        </ol>

        <section className="editor-tray" aria-labelledby="editor-tray-heading">
          <h3 id="editor-tray-heading" className="eyebrow">
            Add module
          </h3>
          {resolved.hidden.length === 0 ? (
            <p className="editor-tray__empty">Every module of this view is shown.</p>
          ) : (
            <ul className="editor-tray__list">
              {resolved.hidden.map((entry) => (
                <li key={entry.moduleId} className="editor-tray__item">
                  <div className="editor-row__text">
                    <p className="editor-row__title">{entry.definition.title}</p>
                    <p className="editor-row__note">{moduleNote(entry.definition)}</p>
                  </div>
                  <button
                    type="button"
                    className="editor-btn editor-btn--small"
                    ref={register(`${entry.moduleId}:add`)}
                    onClick={() => show(entry)}
                    aria-label={`Add ${entry.definition.title}`}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Add
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="editor-footer">
          <EditorActions viewId={viewId} />
          <button
            type="button"
            className="editor-btn editor-btn--danger"
            onClick={() => void resetAll()}
            disabled={resetting}
          >
            {resetting ? "Resetting" : "Reset all layouts"}
          </button>
        </div>
      </section>

      {preview && (
        <aside className="editor-preview" aria-label={`Live preview of ${label}`}>
          <p className="eyebrow editor-preview__label">Preview</p>
          <div className="editor-preview__canvas" inert>
            {preview}
          </div>
        </aside>
      )}
    </div>
  );
}

interface ModuleRowProps {
  entry: ResolvedModule;
  index: number;
  count: number;
  register: (key: string) => (el: HTMLElement | null) => void;
  onHide: () => void;
  onMove: (delta: number) => void;
  onWidth: (width: ModuleWidth) => void;
  onDensity: (density: ModuleDensity) => void;
}

function ModuleRow({ entry, index, count, register, onHide, onMove, onWidth, onDensity }: ModuleRowProps) {
  const { definition, moduleId } = entry;
  const title = definition.title;
  const required = definition.required === true;
  const reasonId = `${moduleId}-required`;
  const widthId = `${moduleId}-width`;
  const densityId = `${moduleId}-density`;

  return (
    <li className="editor-row" data-module-id={moduleId}>
      <div className="editor-row__head">
        <div className="editor-row__text">
          <p className="editor-row__title">
            <span className="editor-row__index" aria-hidden="true">
              {index + 1}
            </span>
            {title}
          </p>
          <p className="editor-row__note">{moduleNote(definition)}</p>
        </div>
        <label className="editor-switch">
          <input
            type="checkbox"
            role="switch"
            checked
            disabled={required}
            aria-describedby={required ? reasonId : undefined}
            ref={register(`${moduleId}:visible`)}
            onChange={() => {
              if (!required) onHide();
            }}
          />
          <span>Visible</span>
        </label>
      </div>

      {required && (
        <p id={reasonId} className="editor-row__reason">
          Required: this is a safety signal and cannot be hidden.
        </p>
      )}

      <div className="editor-row__controls">
        <label className="editor-field" htmlFor={widthId}>
          <span>Width</span>
          <select
            id={widthId}
            className="editor-select"
            value={entry.width}
            disabled={definition.allowedWidths.length < 2}
            onChange={(event) => onWidth(event.target.value as ModuleWidth)}
          >
            {definition.allowedWidths.map((width) => (
              <option key={width} value={width}>
                {WIDTH_LABELS[width]}
              </option>
            ))}
          </select>
        </label>

        {definition.allowedDensities.length > 1 && (
          <label className="editor-field" htmlFor={densityId}>
            <span>Density</span>
            <select
              id={densityId}
              className="editor-select"
              value={entry.density}
              onChange={(event) => onDensity(event.target.value as ModuleDensity)}
            >
              {definition.allowedDensities.map((density) => (
                <option key={density} value={density}>
                  {DENSITY_LABELS[density]}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="editor-move" role="group" aria-label={`Reorder ${title}`}>
          <button
            type="button"
            className="editor-btn editor-btn--icon"
            ref={register(`${moduleId}:up`)}
            disabled={index === 0}
            onClick={() => onMove(-1)}
            aria-label={`Move ${title} up`}
            title="Move up"
          >
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="editor-btn editor-btn--icon"
            ref={register(`${moduleId}:down`)}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
            aria-label={`Move ${title} down`}
            title="Move down"
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </li>
  );
}
