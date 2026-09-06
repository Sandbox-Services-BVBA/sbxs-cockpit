"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
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
  /**
   * True on the plane, where the tile has been given a height and the
   * module has to live inside it. False in the stacked phone fallback,
   * where a tile is as tall as its contents.
   */
  fill?: boolean;
  className?: string;
}

/**
 * The wrapper between a placed tile and the module inside it.
 *
 * On the plane the outer element's size is set by the grid, so the frame's
 * whole job is to divide that box: a fixed strip of chrome on top and the
 * module filling what is left. `min-h-0` on the module row is what actually
 * makes the widget's internal scrollbar work; without it the flex child
 * refuses to shrink below its content and the tile grows instead.
 *
 * It also catches a render error, so one broken module cannot blank the
 * board. The `data-module-id` the grid reads back off the DOM belongs to the
 * element the grid positions, one level up, so it is not repeated here.
 */
export function ModuleFrame({ resolved, children, chrome, fill = false, className }: ModuleFrameProps) {
  return (
    <div className={cn("flex min-w-0 flex-col", fill && "h-full min-h-0", className)}>
      {chrome && (
        // Its own boundary: a broken strip must not take the module, let
        // alone the page, down with it. Nothing is drawn in its place.
        <ModuleErrorBoundary title={`${resolved.definition.title} controls`} fallback={null}>
          <div className="shrink-0">{chrome}</div>
        </ModuleErrorBoundary>
      )}
      <div className={cn("min-w-0", fill && "min-h-0 flex-1")}>
        <ModuleErrorBoundary title={resolved.definition.title}>{children}</ModuleErrorBoundary>
      </div>
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
