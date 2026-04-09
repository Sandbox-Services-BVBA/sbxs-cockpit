import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

const UMAMI_URL = process.env.UMAMI_URL || "https://analytics.sbxs.io";
const UMAMI_USER = process.env.UMAMI_USER || "admin";
const UMAMI_PASSWORD = process.env.UMAMI_PASSWORD || "";

const SITES = {
  plaqstudio: "7c5ac766-20d6-4851-87c4-94eaa479c088",
  bookyourbox: "6aac5ab3-b993-40af-81d9-56c79f4564ea",
};

const EU_COUNTRIES = new Set([
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE",
  "IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE",
  "NO","CH","GB","IS","LI","UA","RS","BA","ME","MK","AL","MD","XK",
]);

let cachedToken: { token: string; expires: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now()) return cachedToken.token;
  if (!UMAMI_PASSWORD) throw new Error("No Umami password");

  const res = await fetch(`${UMAMI_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: UMAMI_USER, password: UMAMI_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Umami auth failed: ${res.status}`);
  const data = await res.json();
  cachedToken = { token: data.token, expires: Date.now() + 3600000 };
  return data.token;
}

async function fetchSiteData(websiteId: string, token: string) {
  const now = Date.now();
  const weekAgo = now - 7 * 86400000;
  const dayAgo = now - 86400000;

  const headers = { Authorization: `Bearer ${token}` };

  const [stats, dailyPv, countries] = await Promise.all([
    fetch(`${UMAMI_URL}/api/websites/${websiteId}/stats?startAt=${dayAgo}&endAt=${now}`, { headers }).then(r => r.json()),
    fetch(`${UMAMI_URL}/api/websites/${websiteId}/pageviews?startAt=${weekAgo}&endAt=${now}&unit=day`, { headers }).then(r => r.json()),
    fetch(`${UMAMI_URL}/api/websites/${websiteId}/metrics?startAt=${weekAgo}&endAt=${now}&type=country`, { headers }).then(r => r.json()),
  ]);

  // Filter countries to EU only
  const euCountries = (countries as { x: string; y: number }[])
    .filter(c => EU_COUNTRIES.has(c.x))
    .map(c => ({ country: c.x, visitors: c.y }));

  const euTotal = euCountries.reduce((sum, c) => sum + c.visitors, 0);

  // Daily visitors (sessions) for the week
  const daily = (dailyPv.sessions as { x: string; y: number }[]).map(d => ({
    date: d.x.split("T")[0],
    visitors: d.y,
  }));

  return {
    today: stats.visitors || 0,
    pageviews: stats.pageviews || 0,
    daily,
    euVisitors: euTotal,
    topCountries: euCountries.slice(0, 5),
  };
}

export async function GET() {
  if (!UMAMI_PASSWORD) {
    return Response.json({ plaqstudio: null, bookyourbox: null });
  }

  try {
    const token = await getToken();
    const [plaq, byb] = await Promise.all([
      fetchSiteData(SITES.plaqstudio, token),
      fetchSiteData(SITES.bookyourbox, token),
    ]);

    return Response.json({ plaqstudio: plaq, bookyourbox: byb });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
