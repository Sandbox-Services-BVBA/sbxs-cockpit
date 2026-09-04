"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The count line a list module prints at summary density: how many rows are
 * healthy, and the control that expands them in place. Expansion is local
 * component state in the caller, never a layout override, so it does not
 * touch the saved profile and resets on reload.
 */
export function DensityFold({
  label,
  total,
  expanded,
  onToggle,
}: {
  label: string;
  total: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="fold">
      <span className="fold__count">{label}</span>
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="fold__toggle">
        <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} aria-hidden="true" />
        {expanded ? "Show fewer" : `Show all ${total}`}
      </button>
    </div>
  );
}
