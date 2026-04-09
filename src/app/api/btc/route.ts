export const dynamic = "force-dynamic";

const BTC_HOLDINGS = 0.75;

// In-memory cache (survives across requests, cleared on deploy)
let cache: { data: unknown; expires: number } | null = null;

async function fetchPrices(days: number) {
  const [eurRes, usdRes] = await Promise.all([
    fetch(`https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=eur&days=${days}`),
    fetch(`https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${days}`),
  ]);

  if (!eurRes.ok || !usdRes.ok) throw new Error("CoinGecko API failed");

  const eurData = await eurRes.json();
  const usdData = await usdRes.json();

  return { eur: eurData.prices, usd: usdData.prices };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30");

  // Cache for 10 minutes
  const cacheKey = `btc-${days}`;
  if (cache && cache.expires > Date.now()) {
    return Response.json(cache.data);
  }

  try {
    const { eur, usd } = await fetchPrices(days);

    // Merge EUR and USD into a single timeline
    const chart = (eur as [number, number][]).map((point, i) => {
      const usdPoint = (usd as [number, number][])[i];
      return {
        ts: point[0],
        date: new Date(point[0]).toISOString().split("T")[0],
        eur: Math.round(point[1]),
        usd: usdPoint ? Math.round(usdPoint[1]) : null,
      };
    });

    // Thin out data points for longer periods
    let thinned = chart;
    if (days > 7) {
      // Keep ~1 point per day
      const step = Math.max(1, Math.floor(chart.length / (days * 1)));
      thinned = chart.filter((_, i) => i % step === 0 || i === chart.length - 1);
    }

    const latest = chart[chart.length - 1];
    const first = chart[0];
    const changeEur = latest ? latest.eur - first.eur : 0;
    const changePct = first.eur > 0 ? ((changeEur / first.eur) * 100) : 0;

    const result = {
      holdings: BTC_HOLDINGS,
      current: {
        eur: latest?.eur ?? 0,
        usd: latest?.usd ?? 0,
        portfolioEur: Math.round((latest?.eur ?? 0) * BTC_HOLDINGS),
        portfolioUsd: Math.round((latest?.usd ?? 0) * BTC_HOLDINGS),
      },
      change: {
        eur: changeEur,
        pct: Math.round(changePct * 10) / 10,
      },
      chart: thinned,
      days,
    };

    cache = { data: result, expires: Date.now() + 600000 };
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
