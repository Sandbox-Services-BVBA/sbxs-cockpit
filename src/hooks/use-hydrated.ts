"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

/**
 * False during server render and the hydration pass, true afterwards. Use it
 * for anything the server cannot know (the resolved theme, the current time)
 * so the first client render still matches the HTML that was sent.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, onClient, onServer);
}
