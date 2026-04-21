import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";
import { config } from "@/lib/config";
import type { ServerHealth, Alert, UptimeCheck } from "@/types";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${config.apiKey}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const briefing = await buildBriefing();
  await sendTelegramMessage(briefing);

  return Response.json({ ok: true, briefing });
}

// GET for manual testing
export async function GET() {
  const briefing = await buildBriefing();
  return Response.json({ ok: true, briefing });
}

async function buildBriefing(): Promise<string> {
  const parts: string[] = [];
  parts.push("<b>Good morning, Bob</b>\n");

  // Weather
  const weather = await getWeather();
  if (weather) {
    parts.push(`${weather}\n`);
  }

  // Server status summary
  const db = getDb();
  const servers = db.prepare(`
    SELECT * FROM server_health
    WHERE id IN (SELECT MAX(id) FROM server_health GROUP BY server_name)
  `).all() as ServerHealth[];

  if (servers.length > 0) {
    parts.push("<b>Servers</b>");
    for (const s of servers) {
      const diskIcon = s.disk_usage_percent >= 80 ? "!" : "";
      parts.push(`${diskIcon} ${s.server_name}: disk ${s.disk_usage_percent.toFixed(0)}%, RAM ${s.ram_usage_percent.toFixed(0)}%`);
    }
    parts.push("");
  }

  // Uptime summary (check all paths, not just root)
  const downChecks = db.prepare(`
    SELECT * FROM uptime_checks
    WHERE id IN (SELECT MAX(id) FROM uptime_checks GROUP BY site_url, checked_path)
    AND is_up = 0
  `).all() as UptimeCheck[];

  if (downChecks.length > 0) {
    // Group by site for cleaner output
    const bySite = new Map<string, string[]>();
    for (const c of downChecks) {
      const paths = bySite.get(c.site_name) || [];
      paths.push(c.checked_path);
      bySite.set(c.site_name, paths);
    }
    parts.push("<b>Sites down</b>");
    for (const [name, paths] of bySite) {
      const detail = paths.includes("/") ? "(full outage)" : `(${paths.join(", ")})`;
      parts.push(`- ${name} ${detail}`);
    }
    parts.push("");
  } else {
    parts.push("All sites up\n");
  }

  // Active alerts
  const alerts = db.prepare(
    "SELECT * FROM alerts WHERE resolved = 0 ORDER BY severity DESC"
  ).all() as Alert[];

  if (alerts.length > 0) {
    parts.push(`<b>${alerts.length} active alert(s)</b>`);
    for (const a of alerts) {
      parts.push(`- [${a.severity}] ${a.source}: ${a.message}`);
    }
  } else {
    parts.push("No active alerts");
  }

  return parts.join("\n");
}

async function getWeather(): Promise<string | null> {
  if (!config.weatherApiKey) return null;

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(config.weatherCity)}&units=metric&appid=${config.weatherApiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const temp = Math.round(data.main.temp);
    const desc = data.weather?.[0]?.description || "";
    const feelsLike = Math.round(data.main.feels_like);

    return `${temp}C (feels ${feelsLike}C), ${desc}`;
  } catch {
    return null;
  }
}
