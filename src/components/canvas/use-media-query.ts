"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A media query as React state.
 *
 * `useSyncExternalStore` rather than an effect: matchMedia is an external
 * store, and reading it during render (with a server snapshot of false)
 * means the first client paint is already correct instead of flipping one
 * render later. That flip is not cosmetic here, because the canvas mounts a
 * grid that measures and centres itself; doing that twice against two
 * different layouts is how you get a board that opens in the wrong place.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query]
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    // The server has no window. False means the stack renders first and the
    // plane takes over on the client, which is the safe way round.
    () => false
  );
}

/**
 * The canvas is a desktop instrument: a plane you scroll in two directions
 * needs a pointer and room. Below this the page falls back to one column.
 */
export const CANVAS_MIN_WIDTH = "(min-width: 1024px)";
