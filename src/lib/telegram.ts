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

export function formatAlert(severity: string, category: string, source: string, message: string): string {
  const icon = severity === "critical" ? "CRITICAL" : "WARNING";
  return `<b>[${icon}] ${category}</b>\n${source}: ${message}`;
}

export function formatRecovery(category: string, source: string, message: string): string {
  return `<b>[RESOLVED] ${category}</b>\n${source}: ${message}`;
}
