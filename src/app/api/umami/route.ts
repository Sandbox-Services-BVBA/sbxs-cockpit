import { getUmamiStats, UMAMI_SITES } from "@/lib/umami";

export const dynamic = "force-dynamic";

export async function GET() {
  const [plaq, byb] = await Promise.all([
    getUmamiStats(UMAMI_SITES.plaqstudio, "day"),
    getUmamiStats(UMAMI_SITES.bookyourbox, "day"),
  ]);

  const [plaqWeek, bybWeek] = await Promise.all([
    getUmamiStats(UMAMI_SITES.plaqstudio, "week"),
    getUmamiStats(UMAMI_SITES.bookyourbox, "week"),
  ]);

  return Response.json({
    plaqstudio: { today: plaq, week: plaqWeek },
    bookyourbox: { today: byb, week: bybWeek },
  });
}
