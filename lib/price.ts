import { UA } from './idx';

/** Harga penutupan terakhir dari Yahoo Finance (tidak resmi, tanpa API key). BBCA → BBCA.JK, kurs → USDIDR=X. */
export async function lastPrice(symbol: string): Promise<number | undefined> {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`, {
      headers: { 'User-Agent': UA },
      cache: 'no-store',
    });
    if (!res.ok) return;
    const p = (await res.json())?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof p === 'number' ? p : undefined;
  } catch {
    return;
  }
}
