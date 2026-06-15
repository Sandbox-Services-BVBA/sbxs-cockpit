"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { WidgetTile } from "../widget-tile";
import type { LayoutMode } from "@/lib/widget-registry";
import { cn } from "@/lib/utils";
import { fsLs, fsCat, getFsKey, setFsKey, type FsEntry, type FsFile } from "@/lib/fs-client";
import { openFile, useFileViewer } from "@/lib/file-viewer-store";

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

// ─── Reusable tree navigator (no file contents) ─────────────────────────────
function FileTree({
  startPath = "",
  selected,
  onOpenFile,
}: {
  startPath?: string;
  selected?: string;
  onOpenFile: (path: string) => void;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [cwd, setCwd] = useState(startPath);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [err, setErr] = useState("");

  const loadDir = useCallback(async (path: string) => {
    setErr("");
    try {
      const d = await fsLs(path);
      setCwd(d.path || "");
      setEntries(d.entries);
    } catch (e) {
      const er = e as { status?: number; message?: string };
      if (er.status === 401) {
        setFsKey("");
        setUnlocked(false);
        setErr("Wrong access key.");
      } else {
        setErr(er.message || "Failed to list");
      }
    }
  }, []);

  useEffect(() => {
    if (getFsKey()) {
      setUnlocked(true);
      loadDir(startPath);
    }
  }, [loadDir, startPath]);

  const submitKey = () => {
    if (!keyInput.trim()) return;
    setFsKey(keyInput.trim());
    setUnlocked(true);
    setKeyInput("");
    loadDir(startPath);
  };

  const rel = cwd ? shortPath(cwd).replace(/^~\//, "").replace(/\/$/, "") : "";
  const crumbs = rel ? rel.split("/") : [];
  const homePrefix = cwd.slice(0, cwd.length - rel.length);
  const crumbPath = (i: number) => homePrefix + crumbs.slice(0, i + 1).join("/");

  if (!unlocked) {
    return (
      <div className="flex flex-col gap-2 max-w-sm py-2">
        <p className="text-petite text-muted-foreground">Read-only file browser. Enter the access key to unlock.</p>
        {err && <p className="text-petite text-red-400">{err}</p>}
        <div className="flex gap-1">
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitKey()}
            placeholder="FS access key"
            className="flex-1 bg-input border-2 border-border px-2 py-1 text-xs font-mono focus:outline-none focus:border-primary"
          />
          <button onClick={submitKey} className="px-3 py-1 text-petite font-bold uppercase bg-primary text-primary-foreground border-2 border-primary">
            Unlock
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-1 text-tiny text-muted-foreground mb-1 flex-wrap shrink-0">
        <button onClick={() => loadDir("")} className="hover:text-foreground">~</button>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            <span>/</span>
            <button onClick={() => loadDir(crumbPath(i))} className="hover:text-foreground truncate max-w-[90px]">{c}</button>
          </span>
        ))}
      </div>
      {err && <p className="text-petite text-red-400 shrink-0">{err}</p>}
      <div className="overflow-y-auto flex-1 min-h-0 font-mono text-petite">
        {entries.map((e) => (
          <button
            key={e.path}
            onClick={() => (e.type === "dir" ? loadDir(e.path) : onOpenFile(e.path))}
            className={cn(
              "flex w-full items-center gap-1.5 px-1 py-0.5 text-left hover:bg-muted/50",
              selected === e.path && "bg-primary/15"
            )}
          >
            <span className={cn("shrink-0", e.type === "dir" ? "text-amber-400" : "text-muted-foreground/60")}>
              {e.type === "dir" ? "▸" : " "}
            </span>
            <span className={cn("flex-1 truncate", e.type === "dir" ? "text-foreground" : "text-foreground/80")}>{e.name}</span>
            {e.type === "file" && <span className="shrink-0 text-mini text-muted-foreground/50">{fmtSize(e.size)}</span>}
          </button>
        ))}
        {entries.length === 0 && !err && <p className="text-petite text-muted-foreground px-1">empty</p>}
      </div>
    </div>
  );
}

// ─── Reusable read-only content viewer ──────────────────────────────────────
function FileViewer({ path }: { path: string }) {
  const [file, setFile] = useState<FsFile | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!path) {
      setFile(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setErr("");
    setFile(null);
    fsCat(path)
      .then((f) => alive && setFile(f))
      .catch((e) => alive && setErr((e as Error).message || "Failed to open"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [path]);

  const lines = file ? file.content.split("\n") : [];
  const shown = lines.slice(0, MAX_LINES);

  return (
    <div className="flex flex-col h-full min-h-0">
      {path ? (
        <div className="text-tiny text-muted-foreground mb-1 flex items-center justify-between gap-2 shrink-0">
          <span className="truncate" title={path}>{shortPath(path)}</span>
          {file && (
            <span className="shrink-0 tabular-nums">
              {fmtSize(file.size)}{file.truncated && " · truncated"}
              {lines.length > MAX_LINES && ` · ${MAX_LINES}/${lines.length} lines`}
            </span>
          )}
        </div>
      ) : (
        <p className="text-petite text-muted-foreground">Select a file to read.</p>
      )}
      {loading && <p className="text-petite text-muted-foreground">Loading...</p>}
      {err && <p className="text-petite text-red-400">{err}</p>}
      {file && (
        <div className="overflow-auto flex-1 min-h-0 border border-border bg-background">
          <div className="flex font-mono text-petite leading-[1.5]">
            <pre className="text-right pr-2 pl-2 py-1 text-muted-foreground/40 select-none border-r border-border/50">
              {shown.map((_, i) => i + 1).join("\n")}
            </pre>
            <pre className="flex-1 py-1 pl-2 whitespace-pre">{shown.join("\n")}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Lightweight dashboard widget: tree only, opens files in the modal ───────
export function FileTreeWidget({ layout = "grid" }: { layout?: LayoutMode }) {
  return (
    <WidgetTile title="Files" size="sm" className="sm:col-span-2 lg:col-span-3 xl:col-span-3">
      <div className={cn(layout === "columns" ? "h-[calc(100vh-168px)]" : layout === "wall" ? "h-[420px]" : "h-[60vh]")}>
        <FileTree onOpenFile={openFile} />
      </div>
    </WidgetTile>
  );
}

// ─── Full explorer in a modal, opened by clicking a file anywhere ───────────
export function FileModal() {
  const req = useFileViewer();
  const [open, setOpen] = useState(false);
  const [viewPath, setViewPath] = useState("");
  const lastNonce = useRef(0);

  useEffect(() => {
    if (req.path && req.nonce !== lastNonce.current) {
      lastNonce.current = req.nonce;
      setViewPath(req.path);
      setOpen(true);
    }
  }, [req]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;
  const dir = viewPath.replace(/\/[^/]+$/, "");

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-6"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-card border-2 border-border w-[94vw] h-[88vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b-2 border-border px-3 py-1.5 shrink-0">
          <h3 className="text-tiny font-bold text-muted-foreground tracking-widest uppercase">File Explorer</h3>
          <button onClick={() => setOpen(false)} className="h-5 w-5 flex items-center justify-center border border-border hover:bg-accent">
            <X className="h-3 w-3" />
          </button>
        </div>
        <div className="flex flex-1 min-h-0">
          <div className="w-64 shrink-0 border-r-2 border-border p-2 overflow-hidden">
            <FileTree startPath={dir} selected={viewPath} onOpenFile={setViewPath} />
          </div>
          <div className="flex-1 min-w-0 p-2 overflow-hidden">
            <FileViewer path={viewPath} />
          </div>
        </div>
      </div>
    </div>
  );
}
