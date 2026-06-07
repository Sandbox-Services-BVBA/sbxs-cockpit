"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";
import { fsLs, fsCat, getFsKey, setFsKey, type FsEntry, type FsFile } from "@/lib/fs-client";
import { useFileViewer } from "@/lib/file-viewer-store";

function shortPath(p: string): string {
  return p.replace(/^\/home\/dev-server\//, "~/").replace(/^\/home\/[^/]+\//, "~/");
}

function fmtSize(n?: number): string {
  if (!n) return "";
  if (n < 1024) return `${n}b`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}k`;
  return `${(n / 1024 / 1024).toFixed(1)}M`;
}

const MAX_LINES = 5000;

export function FileExplorer() {
  const [unlocked, setUnlocked] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [cwd, setCwd] = useState("");
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [listErr, setListErr] = useState("");
  const [selected, setSelected] = useState("");
  const [file, setFile] = useState<FsFile | null>(null);
  const [fileErr, setFileErr] = useState("");
  const [loadingFile, setLoadingFile] = useState(false);
  const requested = useFileViewer();
  const lastNonce = useRef(0);

  const loadDir = useCallback(async (path: string) => {
    setListErr("");
    try {
      const data = await fsLs(path);
      setCwd(data.path || "");
      setEntries(data.entries);
    } catch (e) {
      const err = e as { status?: number; message?: string };
      if (err.status === 401) {
        setFsKey("");
        setUnlocked(false);
        setListErr("Wrong access key.");
      } else {
        setListErr(err.message || "Failed to list");
      }
    }
  }, []);

  const openPath = useCallback(async (path: string) => {
    setSelected(path);
    setFile(null);
    setFileErr("");
    setLoadingFile(true);
    try {
      setFile(await fsCat(path));
    } catch (e) {
      setFileErr((e as Error).message || "Failed to open");
    } finally {
      setLoadingFile(false);
    }
  }, []);

  // Initial unlock state (client only).
  useEffect(() => {
    if (getFsKey()) {
      setUnlocked(true);
      loadDir("");
    }
  }, [loadDir]);

  // Cross-widget: a File Activity path click requests a file.
  useEffect(() => {
    if (!requested.path || requested.nonce === lastNonce.current) return;
    lastNonce.current = requested.nonce;
    if (!getFsKey()) {
      setUnlocked(false);
      return;
    }
    setUnlocked(true);
    const dir = requested.path.replace(/\/[^/]+$/, "");
    loadDir(dir);
    openPath(requested.path);
  }, [requested, loadDir, openPath]);

  const submitKey = () => {
    if (!keyInput.trim()) return;
    setFsKey(keyInput.trim());
    setUnlocked(true);
    setKeyInput("");
    loadDir("");
  };

  const rel = cwd ? shortPath(cwd).replace(/^~\//, "").replace(/\/$/, "") : "";
  const crumbs = rel ? rel.split("/") : [];
  const homePrefix = cwd.slice(0, cwd.length - rel.length); // e.g. "/home/dev-server/"
  const crumbPath = (i: number) => homePrefix + crumbs.slice(0, i + 1).join("/");

  if (!unlocked) {
    return (
      <WidgetTile title="Files" size="sm" className="sm:col-span-2 lg:col-span-4 xl:col-span-6">
        <div className="flex flex-col gap-2 max-w-sm py-2">
          <p className="text-[11px] text-muted-foreground">
            Read-only file browser. Enter the access key to unlock.
          </p>
          {listErr && <p className="text-[11px] text-red-400">{listErr}</p>}
          <div className="flex gap-1">
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitKey()}
              placeholder="FS access key"
              className="flex-1 bg-input border-2 border-border px-2 py-1 text-xs font-mono focus:outline-none focus:border-primary"
            />
            <button
              onClick={submitKey}
              className="px-3 py-1 text-[11px] font-bold uppercase bg-primary text-primary-foreground border-2 border-primary"
            >
              Unlock
            </button>
          </div>
        </div>
      </WidgetTile>
    );
  }

  const lines = file ? file.content.split("\n") : [];
  const shown = lines.slice(0, MAX_LINES);

  return (
    <WidgetTile title="Files" size="sm" className="sm:col-span-2 lg:col-span-4 xl:col-span-6">
      <div className="flex h-[72vh] gap-2">
        {/* Navigator */}
        <div className="w-64 shrink-0 border-r border-border pr-2 flex flex-col">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1 flex-wrap">
            <button onClick={() => loadDir("")} className="hover:text-foreground">~</button>
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                <span>/</span>
                <button onClick={() => loadDir(crumbPath(i))} className="hover:text-foreground truncate max-w-[90px]">
                  {c}
                </button>
              </span>
            ))}
          </div>
          {listErr && <p className="text-[11px] text-red-400">{listErr}</p>}
          <div className="overflow-y-auto flex-1 font-mono text-[11px]">
            {entries.map((e) => (
              <button
                key={e.path}
                onClick={() => (e.type === "dir" ? loadDir(e.path) : openPath(e.path))}
                className={cn(
                  "flex w-full items-center gap-1.5 px-1 py-0.5 text-left hover:bg-muted/50",
                  selected === e.path && "bg-primary/15"
                )}
              >
                <span className={cn("shrink-0", e.type === "dir" ? "text-amber-400" : "text-muted-foreground/60")}>
                  {e.type === "dir" ? "▸" : " "}
                </span>
                <span className={cn("flex-1 truncate", e.type === "dir" ? "text-foreground" : "text-foreground/80")}>
                  {e.name}
                </span>
                {e.type === "file" && (
                  <span className="shrink-0 text-[9px] text-muted-foreground/50">{fmtSize(e.size)}</span>
                )}
              </button>
            ))}
            {entries.length === 0 && !listErr && (
              <p className="text-[11px] text-muted-foreground px-1">empty</p>
            )}
          </div>
        </div>

        {/* Viewer */}
        <div className="flex-1 min-w-0 flex flex-col">
          {selected ? (
            <div className="text-[10px] text-muted-foreground mb-1 flex items-center justify-between gap-2">
              <span className="truncate" title={selected}>{shortPath(selected)}</span>
              {file && (
                <span className="shrink-0 tabular-nums">
                  {fmtSize(file.size)}{file.truncated && " · truncated"}
                  {lines.length > MAX_LINES && ` · showing ${MAX_LINES} of ${lines.length} lines`}
                </span>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">Select a file to read.</p>
          )}

          {loadingFile && <p className="text-[11px] text-muted-foreground">Loading...</p>}
          {fileErr && <p className="text-[11px] text-red-400">{fileErr}</p>}

          {file && (
            <div className="overflow-auto flex-1 border border-border bg-background">
              <div className="flex font-mono text-[11px] leading-[1.5]">
                <pre className="text-right pr-2 pl-2 py-1 text-muted-foreground/40 select-none border-r border-border/50">
                  {shown.map((_, i) => i + 1).join("\n")}
                </pre>
                <pre className="flex-1 py-1 pl-2 whitespace-pre">{shown.join("\n")}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </WidgetTile>
  );
}
