// One place for the rupee-to-dollar conversion shown on the Rasuwa story page.
// 152 is the rate implied by the story's own seed data (USD 10 Million = रू 1,520 Million).
// It is an approximation for context, not a quote: change it here and every figure follows.
export const NPR_PER_USD = 152;

const trim = (n: number, d: number) => n.toFixed(d).replace(/\.0+$/, '');

// Compact dollar string for a rupee amount, e.g. 14e9 -> "$92M".
export function usd(npr: number, rate = NPR_PER_USD): string {
  const v = npr / rate;
  if (v >= 1e9) return `$${trim(v / 1e9, 1)}B`;
  if (v >= 1e8) return `$${Math.round(v / 1e6)}M`;
  if (v >= 1e6) return `$${trim(v / 1e6, 1)}M`;
  if (v >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${Math.round(v)}`;
}
