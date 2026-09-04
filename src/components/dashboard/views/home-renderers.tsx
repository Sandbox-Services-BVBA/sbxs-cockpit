"use client";

import type { ReactNode } from "react";
import type { ModuleDensity } from "@/lib/layout/types";

export interface HomeRenderContext {
  density: ModuleDensity;
}

/**
 * Home's renderers live apart from the shared map because they read the Home
 * console's context rather than the /api/dashboard payload. Returns null for
 * anything that is not a Home module.
 */
export function homeModuleNode(id: string, ctx: HomeRenderContext): ReactNode {
  void id;
  void ctx;
  return null;
}
