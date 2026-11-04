'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { send } from '@/lib/client';
import { LABEL, pctOf, proofSteps } from '@/lib/ledger';
import type { EventRow } from '@/lib/types';
import ProductPanel from '../../ProductPanel';
import ProofTrail from '../../ProofTrail';
import { useLedger } from '../../Providers';

export default function NeedPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loaded, me, refresh, cur, money } = useLedger();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [amount, setAmount] = useState('25');
  const [msg, setMsg] = useState('');
  const [evNote, setEvNote] = useState('');
  const [evMsg, setEvMsg] = useState('');

  const sel = data.needs.find((n) => n.id === id) ?? null;
  const canEdit = !!me && !!sel && (me.role === 'ADMIN' || me.coordinatorId === sel.coordinatorId);

  // Reload the timeline when this need's funding changes.
  useEffect(() => {
    if (!sel) return setEvents([]);
    send(`/api/needs/${sel.id}/events`, undefined, 'GET').then(({ ok, j }) => ok && setEvents(j));
  }, [sel?.id, sel?.raised, sel?.target]); // eslint-disable-line react-hooks/exhaustive-deps

  async function recordEvidence(type: 'PURCHASED' | 'DELIVERED') {
    if (!sel) return;
    const { ok, j } = await send(`/api/needs/${sel.id}/evidence`, { type, note: evNote });
    if (!ok) return setEvMsg(j.error || 'Could not record the evidence.');
    setEvNote('');
    setEvMsg('');
    const r = await send(`/api/needs/${sel.id}/events`, undefined, 'GET');
    if (r.ok) setEvents(r.j);
  }

  if (!sel) {
    return (
      <div className="wrap page">
        <Link href="/needs" className="back">← All needs</Link>
        <p className="note">{loaded ? 'This need was not found.' : 'Loading…'}</p>
      </div>
    );
  }

  const has = (t: string) => events.some((e) => e.type === t);
  const remaining = Math.max(0, sel.target - sel.raised);
  const open = sel.target > 0 && sel.status !== 'FUNDED';
  const pct = pctOf(sel);

  return (
    <div className="wrap page">
      <Link href="/needs" className="back">← All needs</Link>
      <p className="kicker">
        {sel.location} · {sel.families} families · {sel.urgency}
      </p>
      <h1 className="page-title">{sel.title}</h1>
      <p className="page-lead">
        {sel.verified ? `Verified by ${sel.authority} (mock)` : 'Unverified'}. Raised {money(sel.raised)} of{' '}
        {sel.target ? money(sel.target) : 'not priced yet'}.
      </p>

      <div className="detail">
        <div>
          {sel.target > 0 && (
            <div className="meter" role="img" aria-label={`${Math.round(pct)}% funded`}>
              <span style={{ width: `${pct}%` }} />
            </div>
          )}
          <ProofTrail steps={proofSteps(sel, events)} />

          <h2>Products</h2>
          <ProductPanel key={sel.id} need={sel} canEdit={canEdit} currency={cur} onChanged={refresh} />

          <h2 style={{ marginTop: 32 }}>Donate ({cur})</h2>
          {!open ? (
            <p className="note">{sel.status === 'FUNDED' ? 'Fully funded (sandbox).' : 'Donations open after products are approved.'}</p>
          ) : (
            <>
              <label htmlFor="amount">Amount in {cur}</label>
              <input id="amount" type="number" min="1" max={remaining} value={amount} onChange={(e) => setAmount(e.target.value)} />
              {data.region && (
                <PayPalScriptProvider key={cur} options={{ clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || 'test', currency: cur }}>
                  <PayPalButtons
                    style={{ layout: 'vertical' }}
                    forceReRender={[amount, sel.id]}
                    createOrder={async () => {
                      const { ok, j } = await send('/api/paypal/create-order', { needId: sel.id, amount: Number(amount) });
                      if (!ok) {
                        setMsg(j.error || 'Could not start the payment.');
                        throw new Error(j.error);
                      }
                      return j.id as string;
                    }}
                    onApprove={async (d) => {
                      setMsg('Confirming payment…');
                      const { ok, j } = await send('/api/paypal/capture-order', { orderId: d.orderID });
                      setMsg(
                        ok
                          ? j.duplicate
                            ? 'This payment was already recorded. Counted once.'
                            : 'Thank you! Sandbox donation confirmed.'
                          : j.error || 'Payment failed.'
                      );
                      refresh();
                    }}
                    onCancel={() => setMsg('Payment cancelled. You were not charged.')}
                    onError={() => setMsg((m) => m || 'PayPal had a problem. You were not charged.')}
                  />
                </PayPalScriptProvider>
              )}
            </>
          )}
          {msg && <p className="err" role="status">{msg}</p>}
          <p className="note">Supplier payouts are simulated in this prototype.</p>
        </div>

        <aside aria-label="Timeline">
          <h2>Timeline</h2>
          <ol className="tl">
            {events.map((e) => (
              <li key={e.id}>
                <b>{LABEL[e.type] || e.type}</b>
                {e.isSimulated && <span className="tag">SIMULATED / TEST</span>}
                <span className="what">{e.message}</span>
                <small>
                  {e.actor} · {new Date(e.createdAt).toLocaleString()}
                </small>
              </li>
            ))}
            {/* A stage is only marked done when an evidence event exists for it. */}
            {!has('PURCHASED') && (
              <li className="pending">
                <b>Purchase unverified</b>
                <span className="what">No evidence recorded yet.</span>
              </li>
            )}
            {!has('DELIVERED') && (
              <li className="pending">
                <b>Delivery unverified</b>
                <span className="what">No evidence recorded yet.</span>
              </li>
            )}
          </ol>
          {me?.role === 'ADMIN' && sel.status === 'FUNDED' && !(has('PURCHASED') && has('DELIVERED')) && (
            <div>
              <label htmlFor="evidence">Evidence note</label>
              <input id="evidence" value={evNote} onChange={(e) => setEvNote(e.target.value)} placeholder="e.g. invoice reference" maxLength={300} />
              <button onClick={() => recordEvidence(has('PURCHASED') ? 'DELIVERED' : 'PURCHASED')}>
                Record {has('PURCHASED') ? 'delivery' : 'purchase'} (TEST evidence)
              </button>
              {evMsg && <p className="note">{evMsg}</p>}
              <p className="note">Admin only. Saved as test evidence, not a real purchase.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
