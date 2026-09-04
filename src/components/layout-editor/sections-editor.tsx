"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { draftPins, moveId, orderedDomains, useLayout } from "@/lib/layout/client";
import { MOBILE_PIN_COUNT, type ViewId } from "@/lib/layout/types";
import { VIEW_BY_ID } from "@/lib/views";
import { EditorActions } from "./editor-actions";
import { useFocusAfter } from "./use-focus-after";

// Domain navigation: which of the nine domains show, in what order, and which
// four sit on the phone's bottom bar. Reads the raw draft rather than the
// resolved layout because the resolved one hides hidden domains and tops the
// pins up to four, and this screen must show Bob exactly what he chose.

export function SectionsEditor({ currentView }: { currentView: ViewId }) {
  const { profile, setDomainVisible, setDomainOrder, setMobilePins, resetDomains } = useLayout();
  const { register, focusAfter, announcement } = useFocusAfter();

  const order = orderedDomains(profile);
  const pins = draftPins(profile);
  const overrides = profile.domains ?? {};
  const isVisible = (viewId: ViewId) => overrides[viewId]?.visible !== false;

  const move = (viewId: ViewId, delta: number) => {
    const index = order.indexOf(viewId);
    const to = index + delta;
    if (to < 0 || to >= order.length) return;
    setDomainOrder(moveId(order, viewId, delta));
    const direction = delta < 0 ? "up" : "down";
    const other = delta < 0 ? "down" : "up";
    focusAfter(
      `${VIEW_BY_ID[viewId].label} moved ${direction} to position ${to + 1} of ${order.length}.`,
      `${viewId}:${direction}`,
      `${viewId}:${other}`
    );
  };

  const toggleVisible = (viewId: ViewId, visible: boolean) => {
    setDomainVisible(viewId, visible);
    // A hidden domain cannot sit on the bottom bar; drop its pin so Bob
    // picks a replacement instead of saving something the server rejects.
    if (!visible && pins.includes(viewId)) setMobilePins(pins.filter((id) => id !== viewId));
  };

  const togglePin = (viewId: ViewId, pinned: boolean) => {
    setMobilePins(pinned ? [...pins, viewId] : pins.filter((id) => id !== viewId));
  };

  const pinNote =
    pins.length === MOBILE_PIN_COUNT
      ? `${MOBILE_PIN_COUNT} of ${MOBILE_PIN_COUNT} pinned.`
      : pins.length < MOBILE_PIN_COUNT
        ? `${pins.length} of ${MOBILE_PIN_COUNT} pinned. Pick ${MOBILE_PIN_COUNT - pins.length} more before saving.`
        : `${pins.length} pinned. Unpin ${pins.length - MOBILE_PIN_COUNT} before saving; the bar has ${MOBILE_PIN_COUNT} slots.`;

  return (
    <section className="editor" aria-labelledby="sections-heading">
      <div className="editor__head">
        <h2 id="sections-heading" className="serif editor__title">
          Sections
        </h2>
        <p className="editor__lede">
          Choose which domains appear in the rail and the More menu, their order, and the four that sit on the
          phone&apos;s bottom bar. Home stays reachable through the SBXS mark, and every domain keeps its URL.
        </p>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <p className="editor-pins" aria-live="polite">
        <b>Bottom bar:</b>{" "}
        {pins.length === 0 ? "nothing pinned" : pins.map((id) => VIEW_BY_ID[id].short).join(" / ")}. {pinNote}
      </p>

      <ol className="editor-list" aria-label="Domains, in navigation order">
        {order.map((viewId, index) => {
          const view = VIEW_BY_ID[viewId];
          const visible = isVisible(viewId);
          const pinned = pins.includes(viewId);
          const Icon = view.icon;
          return (
            <li key={viewId} className="editor-row" data-domain={viewId}>
              <div className="editor-row__head">
                <div className="editor-row__text">
                  <p className="editor-row__title">
                    <span className="editor-row__index" aria-hidden="true">
                      {index + 1}
                    </span>
                    <Icon className="editor-row__icon" aria-hidden="true" />
                    {view.label}
                    {viewId === currentView && <span className="editor-row__tag">this view</span>}
                  </p>
                  <p className="editor-row__note">{view.description}</p>
                </div>
              </div>

              <div className="editor-row__controls">
                <label className="editor-switch">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={visible}
                    onChange={(event) => toggleVisible(viewId, event.target.checked)}
                  />
                  <span>In navigation</span>
                </label>
                <label className="editor-switch">
                  <input
                    type="checkbox"
                    checked={pinned}
                    disabled={!visible}
                    onChange={(event) => togglePin(viewId, event.target.checked)}
                  />
                  <span>Bottom bar</span>
                </label>

                <div className="editor-move" role="group" aria-label={`Reorder ${view.label}`}>
                  <button
                    type="button"
                    className="editor-btn editor-btn--icon"
                    ref={register(`${viewId}:up`)}
                    disabled={index === 0}
                    onClick={() => move(viewId, -1)}
                    aria-label={`Move ${view.label} up`}
                    title="Move up"
                  >
                    <ChevronUp className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="editor-btn editor-btn--icon"
                    ref={register(`${viewId}:down`)}
                    disabled={index === order.length - 1}
                    onClick={() => move(viewId, 1)}
                    aria-label={`Move ${view.label} down`}
                    title="Move down"
                  >
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="editor-footer">
        <EditorActions viewId={currentView} />
        <button type="button" className="editor-btn" onClick={resetDomains}>
          Restore default navigation
        </button>
      </div>
    </section>
  );
}
