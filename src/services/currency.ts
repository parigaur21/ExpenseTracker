import axios from 'axios';

// Day-level cache for exchange rates
const rateCache = new Map<string, { rate: number; date: string }>();

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Fetch exchange rate from one currency to another.
 * Caches rates per day to avoid excessive API calls.
 */
export async function fetchRate(from: string, to: string): Promise<number> {
  if (from === to) return 1;

  const today = todayKey();
  const cacheKey = `${from}-${to}`;
  const cached = rateCache.get(cacheKey);

  if (cached && cached.date === today) {
    return cached.rate;
  }

  try {
    const apiUrl = process.env.EXCHANGE_RATE_API || 'https://api.exchangerate.host/latest';
    const resp = await axios.get(apiUrl, { params: { base: from, symbols: to } });
    const rate = Number(resp.data.rates?.[to] ?? 1);
    rateCache.set(cacheKey, { rate, date: today });
    return rate;
  } catch (err) {
    console.error(`Failed to fetch rate ${from}->${to}:`, err);
    // Fallback: return 1 to avoid breaking the flow
    return 1;
  }
}
