"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { WIDTH_SPANS } from "@/lib/layout/grid";
import type { ResolvedModule } from "@/lib/layout/types";
import { cn } from "@/lib/utils";

interface ModuleFrameProps {
  resolved: ResolvedModule;
  children: ReactNode;
  /**
   * The strip the canvas puts above the module: grip, menu, close. The
   * frame only positions it; what it does is the canvas's business.
   */
  chrome?: ReactNode;
  /** Set by the old editor's live preview; normal mode renders nothing extra. */
  editing?: boolean;
  className?: string;
}

/**
 * The placement wrapper: the only thing that owns a module's grid span.
 * Modules still draw their own header, so the frame adds no chrome of its
 * own beyond the optional strip the canvas hands it, but it does catch a
 * render error so one broken module cannot blank the whole page. The
 * `data-module-id` is what the drag layer reads back off the DOM.
 */
export function ModuleFrame({ resolved, children, chrome, editing = false, className }: ModuleFrameProps) {
  return (
    <div
      data-module-id={resolved.moduleId}
      data-editing={editing || undefined}
      className={cn(
        "min-w-0",
        WIDTH_SPANS[resolved.width],
        chrome && "canvas-tile",
        editing && "module-frame--editing",
        className
      )}
    >
      {chrome && (
        // Its own boundary: a broken strip must not take the module, let
        // alone the page, down with it. Nothing is drawn in its place.
        <ModuleErrorBoundary title={`${resolved.definition.title} controls`} fallback={null}>
          {chrome}
        </ModuleErrorBoundary>
      )}
      {editing && (
        <p className="module-frame__caption eyebrow" aria-hidden="true">
          {resolved.definition.title} / {resolved.width}
        </p>
      )}
      <ModuleErrorBoundary title={resolved.definition.title}>{children}</ModuleErrorBoundary>
    </div>
  );
}

interface BoundaryProps {
  title: string;
  children: ReactNode;
  /** What to draw after a failure; the default is the "failed to render" panel. */
  fallback?: ReactNode;
}

interface BoundaryState {
  failed: boolean;
}

// React still has no hook for error boundaries, so this is the one class
// component in the dashboard. Exported for the wall, whose masonry cells are
// not frames but need the same protection.
export class ModuleErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Module "${this.props.title}" failed to render`, error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return (
      <div role="alert" className="cockpit-panel module-frame__error">
        <p className="eyebrow">{this.props.title}</p>
        <p>This module failed to render. The rest of the view is unaffected.</p>
      </div>
    );
  }
}
