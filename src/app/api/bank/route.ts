export const dynamic = "force-dynamic";

const OFFICE_URL = "https://office.sbxs.io";
const OFFICE_API_KEY = process.env.OFFICE_API_KEY || "";

const periodLimits: Record<string, number> = {
  "1w": 30,
  "1m": 120,
  "3m": 400,
  "1y": 1500,
};

const cache: Record<string, { data: unknown; expires: number }> = {};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const period = url.searchParams.get("period") || "1m";
  const limit = periodLimits[period] || 120;

  const cacheKey = `bank-${period}`;
  if (cache[cacheKey] && cache[cacheKey].expires > Date.now()) {
    return Response.json(cache[cacheKey].data);
  }

  if (!OFFICE_API_KEY) {
    return Response.json({ error: "OFFICE_API_KEY not configured" }, { status: 500 });
  }

  const headers = { "x-api-key": OFFICE_API_KEY };

  try {
    const [balanceRes, transactionsRes] = await Promise.all([
      fetch(`${OFFICE_URL}/api/bank/balance`, { headers }),
      fetch(`${OFFICE_URL}/api/bank/transactions?limit=${limit}`, { headers }),
    ]);

    if (!balanceRes.ok) throw new Error(`Balance API: ${balanceRes.status}`);
    const balance = await balanceRes.json();

    let chart: { date: string; balance: number }[] = [];

    if (transactionsRes.ok) {
      const transactions = await transactionsRes.json();
      const txList = Array.isArray(transactions) ? transactions : transactions.data || [];

      if (txList.length > 0) {
        let runningBalance = balance.currentBalance;
        const dailyBalances: Record<string, number> = {};

        const today = new Date().toISOString().split("T")[0];
        dailyBalances[today] = runningBalance;

        for (const tx of txList) {
          const amount = parseFloat(tx.amount);
          runningBalance -= amount;
          const date = tx.date?.split("T")[0] || today;
          dailyBalances[date] = runningBalance;
        }

        chart = Object.entries(dailyBalances)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, bal]) => ({ date, balance: Math.round(bal * 100) / 100 }));
      }
    }

    const result = { balance, chart, period };
    cache[cacheKey] = { data: result, expires: Date.now() + 900000 };
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
