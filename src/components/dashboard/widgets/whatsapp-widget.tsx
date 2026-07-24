"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Paperclip, Search } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Chat {
  room_id: string;
  name: string;
  followed: boolean;
  followed_since: string | null;
  message_count: number;
  last_message_at: string | null;
}

interface Msg {
  timestamp: string;
  chat: string;
  room_id: string;
  sender: string;
  sender_name: string;
  direction: "in" | "out";
  msgtype: string | null;
  text: string;
  media: { path?: string; mimetype?: string | null; encrypted?: boolean } | null;
  event_id: string;
}

type ChatsResponse = Chat[] | { error: string };
type FeedResponse = { messages: Msg[] } | { error: string };

function isError(d: unknown): d is { error: string } {
  return !!d && typeof d === "object" && "error" in (d as Record<string, unknown>);
}

/** HH:MM for today, else DD/MM. */
function shortTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("nl-BE", { day: "2-digit", month: "2-digit" });
}

/** Strip the "(WA)" suffix the bridge puts on WhatsApp contact names. */
function cleanName(n: string) {
  return n.replace(/\s*\(WA\)\s*$/, "");
}

export function WhatsAppWidget() {
  const [tab, setTab] = useState<"log" | "chats">("log");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: chats, mutate: mutateChats } = useSWR<ChatsResponse>("/api/whatsapp", fetcher, {
    refreshInterval: 60000,
    keepPreviousData: true,
  });
  const { data: feed, mutate: mutateFeed } = useSWR<FeedResponse>(
    tab === "log" ? "/api/whatsapp?feed=1&limit=40" : null,
    fetcher,
    { refreshInterval: 20000, keepPreviousData: true }
  );

  const chatList = Array.isArray(chats) ? chats : [];
  const followed = chatList.filter((c) => c.followed);
  const messages = feed && !isError(feed) ? feed.messages : [];

  const visibleChats = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return chatList;
    return chatList.filter((c) => c.name.toLowerCase().includes(needle));
  }, [chatList, q]);

  const toggle = async (c: Chat) => {
    setBusy(c.room_id);
    try {
      await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: c.room_id, name: c.name, enabled: !c.followed }),
      });
      await mutateChats();
      await mutateFeed();
    } finally {
      setBusy(null);
    }
  };

  const err = isError(chats) ? chats.error : isError(feed) ? feed.error : null;
  if (err) {
    return (
      <WidgetTile title="WhatsApp" size="md">
        <p className="text-petite text-[#ff4444]">Bridge: {err}</p>
      </WidgetTile>
    );
  }

  return (
    <WidgetTile
      title="WhatsApp"
      size="md"
      headerRight={
        <div className="flex items-center gap-1">
          <span className="text-mini font-mono text-muted-foreground">{followed.length} followed</span>
          <div className="ml-1 flex overflow-hidden rounded border border-border/65">
            {(["log", "chats"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "px-2 py-0.5 text-mini font-mono uppercase transition-colors",
                  tab === t ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {tab === "log" ? (
        followed.length === 0 ? (
          <p className="text-petite text-muted-foreground">
            No conversations followed. Switch to CHATS to pick which ones to watch.
          </p>
        ) : messages.length === 0 ? (
          <p className="text-petite text-muted-foreground">
            Nothing logged yet. Only messages sent after a chat is followed are captured.
          </p>
        ) : (
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {[...messages].reverse().map((m) => (
              <div key={m.event_id} className="flex gap-2 text-petite leading-snug">
                <span className="w-9 shrink-0 font-mono text-mini text-muted-foreground tabular-nums">
                  {shortTime(m.timestamp)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className={cn(
                        "truncate font-semibold",
                        m.direction === "out" ? "text-primary" : "text-foreground"
                      )}
                    >
                      {cleanName(m.sender_name || m.sender)}
                    </span>
                    {followed.length > 1 && (
                      <span className="truncate text-mini font-mono text-muted-foreground">
                        {cleanName(m.chat)}
                      </span>
                    )}
                    {m.media && <Paperclip className="size-3 shrink-0 text-muted-foreground" />}
                  </div>
                  <p className="break-words text-muted-foreground">{m.text}</p>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 rounded border border-border/65 px-2 py-1">
            <Search className="size-3 shrink-0 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter conversations"
              className="w-full bg-transparent text-petite outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-80 space-y-0.5 overflow-y-auto">
            {visibleChats.map((c) => (
              <button
                key={c.room_id}
                onClick={() => toggle(c)}
                disabled={busy === c.room_id}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-primary/10",
                  busy === c.room_id && "opacity-50"
                )}
              >
                {c.followed ? (
                  <Eye className="size-3.5 shrink-0 text-primary" />
                ) : (
                  <EyeOff className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-petite",
                    c.followed ? "font-semibold text-foreground" : "text-muted-foreground"
                  )}
                >
                  {cleanName(c.name)}
                </span>
                {c.message_count > 0 && (
                  <span className="shrink-0 font-mono text-mini text-muted-foreground tabular-nums">
                    {c.message_count}
                  </span>
                )}
                <span className="w-9 shrink-0 text-right font-mono text-mini text-muted-foreground tabular-nums">
                  {shortTime(c.last_message_at)}
                </span>
              </button>
            ))}
            {visibleChats.length === 0 && (
              <p className="text-petite text-muted-foreground">No conversations match.</p>
            )}
          </div>
          <p className="text-mini text-muted-foreground">
            Only followed chats are logged. Capture starts when you follow.
          </p>
        </div>
      )}
    </WidgetTile>
  );
}
