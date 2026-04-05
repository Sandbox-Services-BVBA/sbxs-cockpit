const UMAMI_URL = process.env.UMAMI_URL || "https://analytics.sbxs.io";
const UMAMI_USER = process.env.UMAMI_USER || "admin";
const UMAMI_PASSWORD = process.env.UMAMI_PASSWORD || "";

let cachedToken: { token: string; expires: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now()) {
    return cachedToken.token;
  }

  const res = await fetch(`${UMAMI_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: UMAMI_USER, password: UMAMI_PASSWORD }),
  });

  if (!res.ok) throw new Error(`Umami auth failed: ${res.status}`);
  const data = await res.json();
  cachedToken = { token: data.token, expires: Date.now() + 3600000 }; // 1h
  return data.token;
}

export interface UmamiStats {
  pageviews: { value: number; prev: number };
  visitors: { value: number; prev: number };
  visits: { value: number; prev: number };
  bounces: { value: number; prev: number };
  totaltime: { value: number; prev: number };
}

export async function getUmamiStats(websiteId: string, period: "day" | "week" | "month" = "day"): Promise<UmamiStats | null> {
  if (!UMAMI_PASSWORD) return null;

  try {
    const token = await getToken();
    const now = Date.now();
    const startAt = period === "day" ? now - 86400000 : period === "week" ? now - 604800000 : now - 2592000000;

    const res = await fetch(
      `${UMAMI_URL}/api/websites/${websiteId}/stats?startAt=${startAt}&endAt=${now}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export const UMAMI_SITES = {
  plaqstudio: "7c5ac766-20d6-4851-87c4-94eaa479c088",
  bookyourbox: "6aac5ab3-b993-40af-81d9-56c79f4564ea",
};
