"use client";

import { useSyncExternalStore } from "react";

// Tiny shared store so any widget (e.g. File Activity) can request a file to be
// opened in the File Explorer. The Explorer and the Dashboard both subscribe.

interface ViewerState {
  path: string;
  nonce: number; // bumps every request so re-clicking the same path re-triggers
}

let state: ViewerState = { path: "", nonce: 0 };
const listeners = new Set<() => void>();

export function openFile(path: string): void {
  state = { path, nonce: state.nonce + 1 };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

function getSnapshot(): ViewerState {
  return state;
}

export function useFileViewer(): ViewerState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
