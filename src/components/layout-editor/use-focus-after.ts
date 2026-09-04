"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Reordering a list re-parents the focused button. Browsers blur an element
// the moment it is moved in the DOM, so a keyboard user who pressed "Move up"
// would land nowhere. This hook remembers which control should have focus
// after the next commit and puts it back, skipping any candidate that has
// become disabled (a row that just reached the top loses its "up" button).
//
// It also owns the polite live region text, because every focus restore in
// the editor is paired with an announcement of what just happened.

export function useFocusAfter() {
  const nodes = useRef(new Map<string, HTMLElement>());
  const pending = useRef<string[] | null>(null);
  const [announcement, setAnnouncement] = useState("");

  // A stable ref callback per key; React calls it with null on unmount.
  const refs = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const register = useCallback((key: string) => {
    let ref = refs.current.get(key);
    if (!ref) {
      ref = (el) => {
        if (el) nodes.current.set(key, el);
        else nodes.current.delete(key);
      };
      refs.current.set(key, ref);
    }
    return ref;
  }, []);

  const focusAfter = useCallback((message: string, ...keys: string[]) => {
    pending.current = keys;
    setAnnouncement(message);
  }, []);

  useEffect(() => {
    if (!pending.current) return;
    for (const key of pending.current) {
      const el = nodes.current.get(key);
      if (el && !(el as HTMLButtonElement).disabled) {
        el.focus();
        break;
      }
    }
    pending.current = null;
  });

  return { register, focusAfter, announcement };
}
