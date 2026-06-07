"use client";

// Client-side helpers for the read-only file API. The browser holds the
// FS_ACCESS_KEY (entered once, stored locally) and sends it as x-fs-key.

export const FS_KEY_STORAGE = "cockpit:fsKey";

export function getFsKey(): string {
  try {
    return localStorage.getItem(FS_KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

export function setFsKey(k: string): void {
  try {
    localStorage.setItem(FS_KEY_STORAGE, k);
  } catch {
    /* ignore */
  }
}

export interface FsEntry {
  name: string;
  path: string;
  type: "dir" | "file";
  size?: number;
  mtime?: number;
}

export interface FsList {
  path: string;
  entries: FsEntry[];
}

export interface FsFile {
  path: string;
  size: number;
  truncated: boolean;
  content: string;
}

async function fsFetch(endpoint: string): Promise<Response> {
  return fetch(endpoint, { headers: { "x-fs-key": getFsKey() }, cache: "no-store" });
}

export async function fsLs(path: string): Promise<FsList> {
  const r = await fsFetch(`/api/fs/ls?path=${encodeURIComponent(path)}`);
  const data = await r.json();
  if (!r.ok) throw Object.assign(new Error(data.error || `HTTP ${r.status}`), { status: r.status });
  return data;
}

export async function fsCat(path: string): Promise<FsFile> {
  const r = await fsFetch(`/api/fs/cat?path=${encodeURIComponent(path)}`);
  const data = await r.json();
  if (!r.ok) throw Object.assign(new Error(data.error || `HTTP ${r.status}`), { status: r.status });
  return data;
}
