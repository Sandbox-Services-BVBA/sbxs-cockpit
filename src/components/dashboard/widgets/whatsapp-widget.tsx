"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";
import { AlertTriangle, Eye, EyeOff, Paperclip, Search } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Nothing is ingested while the phone link is down, and /api/chats keeps
// answering calmly the whole time. The link state has to be read from the
// bridge's own /health or the widget renders a dead feed as a quiet one.
const STALE_WARNING_DAYS = 3;

const RELINK_STEPS = [
  "cd ~/services/whatsapp-bridge && docker compose up -d element",
  "open http://100.96.197.107:8009, log in as bob (password in that service's .env)",
  "start a chat with @whatsappbot:wa.local, send: login qr",
  "scan from phone: WhatsApp -> Settings -> Linked Devices -> Link a Device",
  "afterwards docker compose stop element",
];

interface BridgeHealth {
  status?: string;
  whatsapp_linked?: boolean;
  rooms_seen?: number;
  followed_count?: number;
  last_sync_at?: string | null;
  logged_total?: number;
  error?: string;
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return (Date.now() - parsed) / 86400000;
}

function humanSince(iso: string | null | undefined): string {
  const days = daysSince(iso);
  if (days === null) return "unknown";
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`;
  return `${Math.round(days)} days`;
}

function LinkBanner({ health }: { health: BridgeHealth | undefined }) {
  if (!health) return null;

  const linked = health.whatsapp_linked === true;
  const quietDays = daysSince(health.last_sync_at);
  const unreachable = !!health.error;
  const neverSynced = linked && !health.last_sync_at;
  const stale = linked && quietDays !== null && quietDays >= STALE_WARNING_DAYS;

  if (!unreachable && linked && !neverSynced && !stale) return null;

  // last_sync_at resets when the bridge restarts, so "no sync yet" is amber:
  // it is a bridge that just came up as often as it is one that is stuck.
  const critical = unreachable || !linked;

  const headline = unreachable
    ? "Bridge unreachable"
    : !linked
      ? "WhatsApp is NOT linked"
      : neverSynced
        ? "Linked, but nothing has ever synced"
        : `Linked, but silent for ${humanSince(health.last_sync_at)}`;

  const body = unreachable
    ? `The cockpit cannot reach whatsapp-bridge (${health.error}). Nothing below is current.`
    : !linked
      ? `Nothing is being captured, and nothing has been since ${
          health.last_sync_at ? `the last sync ${humanSince(health.last_sync_at)} ago` : "the link was lost"
        }. Claude sessions cannot read followed chats until this is re-linked.${
          health.followed_count ? ` ${health.followed_count} chat(s) are followed and receiving nothing.` : ""
        }`
      : neverSynced
        ? "The bridge reports a link but has not completed a sync since it started, so nothing is being ingested yet. If this persists past a restart, the sync loop is stuck."
        : `The last sync was ${humanSince(health.last_sync_at)} ago. Either the followed chats are quiet or ingestion has stopped.`;

  return (
    <div
      className={cn(
        "mb-3 rounded-lg border px-3 py-2.5",
        critical
          ? "border-red-600/45 bg-red-600/[0.09] text-red-800 dark:text-red-200"
          : "border-amber-600/45 bg-amber-600/[0.09] text-amber-800 dark:text-amber-200"
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-petite font-bold uppercase tracking-[0.06em]">{headline}</p>
          <p className="mt-1 text-mini leading-snug">{body}</p>
          {!unreachable && (
            <ol className="mt-2 space-y-0.5">
              {RELINK_STEPS.map((step, index) => (
                <li key={step} className="flex items-start gap-1.5 text-mini leading-snug">
                  <span className="w-3 shrink-0 text-right font-mono tabular-nums opacity-70">{index + 1}</span>
                  <code className="min-w-0 flex-1 break-words font-mono">{step}</code>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

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
  const { data: health } = useSWR<BridgeHealth>("/api/whatsapp/health", fetcher, {
    refreshInterval: 60000,
    keepPreviousData: true,
  });

  const chatList = useMemo(() => (Array.isArray(chats) ? chats : []), [chats]);
  const followed = chatList.filter((c) => c.followed);
  const messages = feed && !isError(feed) ? feed.messages : [];
  const linkBroken = !!health && (health.whatsapp_linked !== true || !!health.error);

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
        <LinkBanner health={health} />
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
          <span
            className={cn(
              "text-mini font-mono",
              linkBroken ? "font-bold text-red-600 dark:text-red-400" : "text-muted-foreground"
            )}
          >
            {linkBroken ? "not linked" : `${followed.length} followed`}
          </span>
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
      <LinkBanner health={health} />
      {tab === "log" ? (
        followed.length === 0 ? (
          <p className="text-petite text-muted-foreground">
            No conversations followed. Switch to CHATS to pick which ones to watch.
          </p>
        ) : messages.length === 0 ? (
          // The calm explanation is only true when the link is up. With a dead
          // link it read as normal, which is how weeks of silence went unseen.
          linkBroken ? null : (
            <p className="text-petite text-muted-foreground">
              Nothing logged yet. Only messages sent after a chat is followed are captured.
            </p>
          )
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
