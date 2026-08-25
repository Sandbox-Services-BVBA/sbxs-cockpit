import { config } from "./config";

export async function sendTelegramMessage(text: string, parse_mode: "HTML" | "Markdown" = "HTML") {
  if (!config.telegramBotToken || !config.telegramChatId) {
    console.log("[Telegram] Not configured, would send:", text);
    return;
  }

  const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: config.telegramChatId,
      text,
      parse_mode,
    }),
  });

  if (!res.ok) {
    console.error("[Telegram] Failed to send:", await res.text());
  }
}

/**
 * Alert messages now carry agent-authored detail and fix steps, which contain
 * shell text like `&&` and `->`. Telegram rejects the whole message if that
 * reaches its HTML parser unescaped, and a rejected message is logged and then
 * marked notified — a silent failure in the very system meant to catch them.
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatAlert(severity: string, category: string, source: string, message: string): string {
  const icon = severity === "critical" ? "CRITICAL" : "WARNING";
  return `<b>[${icon}] ${escapeHtml(category)}</b>\n${escapeHtml(source)}: ${escapeHtml(message)}`;
}

export function formatRecovery(category: string, source: string, message: string): string {
  return `<b>[RESOLVED] ${escapeHtml(category)}</b>\n${escapeHtml(source)}: ${escapeHtml(message)}`;
}
