export type Candidate = {
  title: string;
  price: number;
  currency: string | null;
  retailer: string;
  url: string | null;
};

type Offer = {
  price?: number | { price?: number; amount?: number; currency?: string };
  currency?: string;
  domain?: string;
  merchant_name?: string;
  url?: string;
};
type Product = { title?: string; offers?: Offer[] };

// Returns the top results in Channel3's own relevance order (not sorted by price,
// because the cheapest hit is often an unrelated accessory). The coordinator picks one.
export async function searchProducts(query: string, take = 3): Promise<Candidate[]> {
  if (!process.env.CHANNEL3_API_KEY) throw new Error('CHANNEL3_API_KEY is not set');
  const r = await fetch('https://api.trychannel3.com/v1/search', {
    method: 'POST',
    headers: { 'x-api-key': process.env.CHANNEL3_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit: 6 }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Channel3 ${r.status}`);

  const { products = [] } = (await r.json()) as { products?: Product[] };
  const out: Candidate[] = [];
  for (const p of products) {
    const o = p.offers?.[0];
    const raw = o?.price;
    const price = typeof raw === 'number' ? raw : Number(raw?.price ?? raw?.amount);
    if (!p.title || !Number.isFinite(price) || price <= 0) continue;
    const currency = (typeof raw === 'object' ? raw?.currency : o?.currency) ?? null;
    out.push({
      title: p.title,
      price,
      currency: currency ? currency.toUpperCase() : null,
      retailer: o?.domain || o?.merchant_name || 'channel3',
      url: o?.url || null,
    });
    if (out.length === take) break;
  }
  return out;
}
