export type Fx = { rate: number; source: string; asOf: string; live: boolean };

let cache: (Fx & { at: number }) | null = null;
const FALLBACK = Number(process.env.NPR_PER_USD) || 142;

// USD to NPR for display only. Cached for an hour; falls back to a fixed rate if the lookup fails.
export async function usdToNpr(): Promise<Fx> {
  if (cache && Date.now() - cache.at < 3_600_000) return cache;
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    const j = await r.json();
    const v = j?.rates?.NPR;
    if (typeof v === 'number' && v > 50 && v < 500) {
      cache = { rate: v, source: 'open.er-api.com', asOf: new Date().toISOString(), live: true, at: Date.now() };
      return cache;
    }
  } catch {
    /* fall through to the cached or fixed rate */
  }
  return cache ?? { rate: FALLBACK, source: 'fixed fallback rate', asOf: new Date().toISOString(), live: false };
}
