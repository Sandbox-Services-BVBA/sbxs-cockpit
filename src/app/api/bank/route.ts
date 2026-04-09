export const dynamic = "force-dynamic";

const OFFICE_URL = "https://office.sbxs.io";
const OFFICE_API_KEY = process.env.OFFICE_API_KEY || "";

let cache: { data: unknown; expires: number } | null = null;

export async function GET() {
  // Cache for 15 minutes
  if (cache && cache.expires > Date.now()) {
    return Response.json(cache.data);
  }

  if (!OFFICE_API_KEY) {
    return Response.json({ error: "OFFICE_API_KEY not configured" }, { status: 500 });
  }

  const headers = { "x-api-key": OFFICE_API_KEY };

  try {
    const [balanceRes, transactionsRes] = await Promise.all([
      fetch(`${OFFICE_URL}/api/bank/balance`, { headers }),
      fetch(`${OFFICE_URL}/api/bank/transactions?limit=90`, { headers }),
    ]);

    if (!balanceRes.ok) throw new Error(`Balance API: ${balanceRes.status}`);
    const balance = await balanceRes.json();

    // Build a running balance chart from transactions
    let chart: { date: string; balance: number }[] = [];

    if (transactionsRes.ok) {
      const transactions = await transactionsRes.json();
      const txList = Array.isArray(transactions) ? transactions : transactions.data || [];

      if (txList.length > 0) {
        // Transactions are newest first, reverse to chronological
        const sorted = [...txList].reverse();

        // Work backwards from current balance to compute historical balances
        let runningBalance = balance.currentBalance;
        const dailyBalances: Record<string, number> = {};

        // Current day
        const today = new Date().toISOString().split("T")[0];
        dailyBalances[today] = runningBalance;

        // Subtract each transaction going backward to reconstruct daily balances
        for (const tx of txList) {
          const amount = parseFloat(tx.amount);
          runningBalance -= amount;
          const date = tx.date?.split("T")[0] || today;
          dailyBalances[date] = runningBalance;
        }

        // Convert to sorted chart array
        chart = Object.entries(dailyBalances)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, bal]) => ({ date, balance: Math.round(bal * 100) / 100 }));
      }
    }

    const result = { balance, chart };
    cache = { data: result, expires: Date.now() + 900000 };
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
