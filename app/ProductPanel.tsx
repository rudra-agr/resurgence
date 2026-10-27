'use client';

import { useEffect, useState } from 'react';
import { send } from '@/lib/client';
import type { NeedRow, ProductsView } from '@/lib/types';

type Choice = { mode: 'match' | 'manual'; matchId?: string; name: string; price: string };

const fmt = (v: number, cur: string) =>
  new Intl.NumberFormat('en', { style: 'currency', currency: cur }).format(v);

// Donors see the approved products read-only. The owning coordinator (or an admin)
// can also run the Channel3 search and approve one product per item.
export default function ProductPanel({
  need,
  canEdit,
  currency,
  onChanged,
}: {
  need: NeedRow;
  canEdit: boolean;
  currency: string;
  onChanged: () => void;
}) {
  const [view, setView] = useState<ProductsView | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = need.raised > 0; // the server enforces this too

  function initChoices(v: ProductsView) {
    const c: Record<string, Choice> = {};
    for (const it of v.items) {
      const ok = it.matches.find((m) => m.approved) ?? it.matches.find((m) => !m.manual);
      c[it.id] = ok
        ? { mode: 'match', matchId: ok.id, name: '', price: '' }
        : { mode: 'manual', name: '', price: '' };
    }
    setChoices(c);
  }

  async function load() {
    const { ok, j } = await send(`/api/needs/${need.id}/products`, undefined, 'GET');
    if (ok) {
      setView(j);
      initChoices(j);
    }
  }

  useEffect(() => {
    setView(null);
    setMsg('');
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [need.id]);

  async function search() {
    setBusy(true);
    setMsg('Searching retailers via Channel3…');
    const { ok, j } = await send(`/api/needs/${need.id}/products`);
    setBusy(false);
    if (!ok) return setMsg(j.error || 'Search failed.');
    setView(j);
    initChoices(j);
    setMsg(j.failed?.length ? `Search failed for: ${j.failed.join(', ')}. Enter those manually.` : '');
  }

  async function approve() {
    if (!view) return;
    const list = [];
    for (const it of view.items) {
      const c = choices[it.id];
      if (c?.mode === 'match' && c.matchId) list.push({ itemId: it.id, matchId: c.matchId });
      else if (c?.mode === 'manual' && c.name.trim() && Number(c.price) > 0)
        list.push({ itemId: it.id, manual: { productName: c.name.trim(), price: Number(c.price) } });
      else return setMsg(`Choose or enter a product for "${it.name}".`);
    }
    setBusy(true);
    const { ok, j } = await send(`/api/needs/${need.id}/products/approve`, { choices: list });
    setBusy(false);
    if (!ok) return setMsg(j.error || 'Could not approve.');
    setMsg('Products approved. Donations are now open.');
    await load();
    onChanged();
  }

  const set = (id: string, patch: Partial<Choice>) =>
    setChoices((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  if (!view) return <p className="note">Loading products…</p>;

  // Donor view: only approved products, with source and time retrieved.
  if (!canEdit) {
    if (!view.approved) {
      return <p className="note">Products are not approved yet. Funding stays closed until a coordinator approves them.</p>;
    }
    return (
      <table>
        <thead>
          <tr><th>Item</th><th>Product</th><th>Unit</th><th>Total</th></tr>
        </thead>
        <tbody>
          {view.items.map((it) => {
            const m = it.matches.find((x) => x.approved)!;
            return (
              <tr key={it.id}>
                <td>{it.quantity} × {it.name}</td>
                <td>
                  {m.productName}
                  <br />
                  <small>
                    {m.manual ? 'MANUAL entry' : `${m.source}, retrieved ${new Date(m.retrievedAt).toLocaleString()}`}
                  </small>
                </td>
                <td>{fmt(m.price, m.currency)}</td>
                <td>{fmt(m.price * it.quantity, m.currency)}</td>
              </tr>
            );
          })}
          <tr><th colSpan={3}>Full cost</th><th>{fmt(view.total, currency)}</th></tr>
        </tbody>
      </table>
    );
  }

  // Coordinator view.
  return (
    <div>
      <button onClick={search} disabled={busy || locked}>Find live products (Channel3)</button>
      {locked && <p className="note">Donations exist, so products are locked.</p>}
      {msg && <p className="err">{msg}</p>}
      {view.items.map((it) => {
        const c = choices[it.id];
        const found = it.matches.filter((m) => !m.manual);
        return (
          <fieldset key={it.id} style={{ margin: '10px 0', border: '1px solid var(--line)', borderRadius: 6 }} disabled={locked}>
            <legend>{it.quantity} × {it.name}</legend>
            {found.length === 0 && <p className="note">No match available. Search, or enter a product manually.</p>}
            {found.map((m) => (
              <label key={m.id} style={{ display: 'block' }}>
                <input
                  type="radio"
                  name={it.id}
                  checked={c?.mode === 'match' && c.matchId === m.id}
                  onChange={() => set(it.id, { mode: 'match', matchId: m.id })}
                />{' '}
                {m.productName} · {fmt(m.price, m.currency)} · {m.source}
                <small> (retrieved {new Date(m.retrievedAt).toLocaleString()})</small>
              </label>
            ))}
            <label style={{ display: 'block' }}>
              <input type="radio" name={it.id} checked={c?.mode === 'manual'} onChange={() => set(it.id, { mode: 'manual' })} />{' '}
              Enter manually (labelled MANUAL)
            </label>
            {c?.mode === 'manual' && (
              <>
                <input placeholder="Product name" value={c.name} onChange={(e) => set(it.id, { name: e.target.value })} />
                <input placeholder={`Unit price (${currency})`} type="number" min="0.01" step="0.01" value={c.price} onChange={(e) => set(it.id, { price: e.target.value })} />
              </>
            )}
          </fieldset>
        );
      })}
      <button onClick={approve} disabled={busy || locked || view.items.length === 0}>Approve products</button>
    </div>
  );
}
