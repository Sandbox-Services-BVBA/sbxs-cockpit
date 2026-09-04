"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { WIDTH_SPANS } from "@/lib/layout/grid";
import type { ResolvedModule } from "@/lib/layout/types";
import { cn } from "@/lib/utils";

interface ModuleFrameProps {
  resolved: ResolvedModule;
  children: ReactNode;
  /** Reserved for the layout editor; normal mode renders nothing extra. */
  editing?: boolean;
  className?: string;
}

/**
 * The placement wrapper: the only thing that owns a module's grid span.
 * Legacy widgets still draw their own WidgetTile, so the frame adds no chrome
 * of its own, but it does catch a render error so one broken module cannot
 * blank the whole view.
 */
export function ModuleFrame({ resolved, children, editing = false, className }: ModuleFrameProps) {
  return (
    <div
      data-module-id={resolved.moduleId}
      data-editing={editing || undefined}
      className={cn("min-w-0", WIDTH_SPANS[resolved.width], className)}
    >
      <ModuleErrorBoundary title={resolved.definition.title}>{children}</ModuleErrorBoundary>
    </div>
  );
}

interface BoundaryProps {
  title: string;
  children: ReactNode;
}

interface BoundaryState {
  failed: boolean;
}

// React still has no hook for error boundaries, so this is the one class
// component in the dashboard.
class ModuleErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Module "${this.props.title}" failed to render`, error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="cockpit-panel module-frame__error">
        <p className="eyebrow">{this.props.title}</p>
        <p>This module failed to render. The rest of the view is unaffected.</p>
      </div>
    );
  }
}
