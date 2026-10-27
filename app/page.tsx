'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { send } from '@/lib/client';
import ProductPanel from './ProductPanel';
import CoordinatorForm from './CoordinatorForm';
import type { Donation, EventRow, LedgerData, Me, NeedRow } from '@/lib/types';

const LABEL: Record<string, string> = {
  SUBMITTED: 'Needs review: submitted',
  PRODUCTS_MATCHED: 'Approved: products matched',
  PARTIALLY_FUNDED: 'Partially funded',
  FUNDED: 'Funded (sandbox payment confirmed)',
  PAYMENT_FAILED: 'Payment not completed',
  PURCHASED: 'Purchased',
  DELIVERED: 'Delivered',
};

const fundingStatus = (n: NeedRow) =>
  n.target <= 0 ? 'Not priced' : n.status === 'FUNDED' ? 'Funded' : n.raised > 0 ? 'Partial' : 'Unfunded';

export default function Home() {
  const [data, setData] = useState<LedgerData>({ region: null, needs: [], donations: [] });
  const [selId, setSelId] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [login, setLogin] = useState({ email: '', password: '' });
  const [loginMsg, setLoginMsg] = useState('');
  const [amount, setAmount] = useState('25');
  const [msg, setMsg] = useState('');
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [offline, setOffline] = useState(false);

  const cur = data.region?.currency ?? 'USD';
  const sel = data.needs.find((n) => n.id === selId) ?? null;
  const canEdit = !!me && !!sel && (me.role === 'ADMIN' || me.coordinatorId === sel.coordinatorId);

  // Always read the newest ledger data. The same call runs on a timer (below).
  const refresh = useCallback(async () => {
    const { ok, j } = await send('/api/needs', undefined, 'GET');
    setOffline(!ok);
    if (ok) setData(j);
  }, []);

  useEffect(() => {
    refresh();
    send('/api/auth/me', undefined, 'GET').then(({ j }) => setMe(j.user ?? null));
    const t = setInterval(refresh, 8000); // the ledger updates on its own
    return () => clearInterval(t);
  }, [refresh]);

  // Reload the timeline when a different need is picked or its funding changes.
  useEffect(() => {
    if (!sel) return setEvents([]);
    send(`/api/needs/${sel.id}/events`, undefined, 'GET').then(({ ok, j }) => ok && setEvents(j));
  }, [sel?.id, sel?.raised, sel?.target]); // eslint-disable-line react-hooks/exhaustive-deps

  async function doLogin() {
    const { ok, j } = await send('/api/auth/login', login);
    if (!ok) return setLoginMsg(j.error || 'Login failed.');
    setLoginMsg('');
    setLogin({ email: '', password: '' });
    const r = await send('/api/auth/me', undefined, 'GET');
    setMe(r.j.user ?? null);
  }

  async function doLogout() {
    await send('/api/auth/logout');
    setMe(null);
  }

  const money = (v: number) => new Intl.NumberFormat('en', { style: 'currency', currency: cur }).format(v);

  const needCols = useMemo<ColDef<NeedRow>[]>(
    () => [
      { field: 'title', headerName: 'Need', flex: 1.2 },
      { field: 'location', flex: 1 },
      { field: 'urgency', width: 105, cellStyle: (p) => (p.value === 'Critical' ? { color: '#c2410c', fontWeight: 600 } : null) },
      { field: 'families', width: 95 },
      { field: 'raised', width: 105, valueFormatter: (p) => money(p.value) },
      { field: 'target', width: 105, valueFormatter: (p) => (p.value ? money(p.value) : '—') },
      { headerName: 'Funding', width: 115, valueGetter: (p) => (p.data ? fundingStatus(p.data) : '') },
      {
        headerName: 'Verification',
        flex: 1.3,
        valueGetter: (p) =>
          p.data ? (p.data.verified ? `Verified by ${p.data.authority} (mock)` : 'Unverified') : '',
      },
    ],
    [cur] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const donCols = useMemo<ColDef<Donation>[]>(
    () => [
      { field: 'createdAt', headerName: 'When', flex: 1, valueFormatter: (p) => new Date(p.value).toLocaleString() },
      { field: 'needTitle', headerName: 'Need', flex: 1 },
      { field: 'payer' },
      { field: 'amount', valueFormatter: (p) => money(p.value) },
      { field: 'paypalCaptureId', headerName: 'PayPal capture (sandbox)', flex: 1 },
    ],
    [cur] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Quick filter: urgent needs that are not fully funded yet.
  const rows = useMemo(
    () =>
      urgentOnly
        ? data.needs.filter((n) => (n.urgency === 'Critical' || n.urgency === 'High') && n.status !== 'FUNDED')
        : data.needs,
    [data.needs, urgentOnly]
  );

  const has = (t: string) => events.some((e) => e.type === t);
  const remaining = sel ? Math.max(0, sel.target - sel.raised) : 0;
  const open = !!sel && sel.target > 0 && sel.status !== 'FUNDED';

  return (
    <main>
      <div className="banner">Sandbox demo: no real money moves and no real aid is delivered.</div>
      <h1>ReliefLoop</h1>
      <p className="sub">
        {data.region ? `${data.region.name}, ${data.region.country}. ` : ''}Pick a need, see the real
        products your money buys, and donate.
      </p>
      {offline && <p className="err">Cannot reach the server. Showing the last data received.</p>}

      <p className="note">
        {me ? (
          <>
            Logged in as {me.name} ({me.role.toLowerCase()}) <button className="alt" onClick={doLogout}>Log out</button>
          </>
        ) : (
          <>
            Coordinator or admin?{' '}
            <input placeholder="Email" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} />
            <input
              placeholder="Password"
              type="password"
              value={login.password}
              onChange={(e) => setLogin({ ...login, password: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && doLogin()}
            />
            <button onClick={doLogin}>Log in</button> {loginMsg && <span className="err">{loginMsg}</span>}
          </>
        )}
      </p>

      <div className="cols">
        <section>
          <div className="panel">
            <h2>Needs ledger</h2>
            <label>
              <input type="checkbox" checked={urgentOnly} onChange={(e) => setUrgentOnly(e.target.checked)} /> Urgent and not yet funded
            </label>
            <div className="ag-theme-quartz" style={{ height: 280 }}>
              <AgGridReact<NeedRow>
                rowData={rows}
                columnDefs={needCols}
                defaultColDef={{ sortable: true, filter: true }}
                getRowId={(p) => p.data.id}
                rowSelection="single"
                onRowClicked={(e) => {
                  setSelId(e.data?.id ?? null);
                  setMsg('');
                }}
              />
            </div>
          </div>
          <div className="panel">
            <h2>Donations ledger</h2>
            <div className="ag-theme-quartz" style={{ height: 220 }}>
              <AgGridReact<Donation>
                rowData={data.donations}
                columnDefs={donCols}
                defaultColDef={{ sortable: true, filter: true }}
                overlayNoRowsTemplate="No donations yet. Be the first."
              />
            </div>
          </div>
        </section>

        <section>
          <div className="panel">
            <h2>{sel ? sel.title : 'Select a need'}</h2>
            {!sel && <p>Click a row in the needs ledger.</p>}
            {sel && (
              <>
                <p>
                  {sel.location} · {sel.families} families · {sel.urgency} ·{' '}
                  {sel.verified ? `Verified by ${sel.authority} (mock)` : 'Unverified'}
                </p>
                <p className="note">Raised {money(sel.raised)} of {sel.target ? money(sel.target) : 'not priced yet'}</p>

                <ProductPanel
                  key={sel.id}
                  need={sel}
                  canEdit={canEdit}
                  currency={cur}
                  onChanged={refresh}
                />

                <h2 style={{ marginTop: 16 }}>Donate ({cur})</h2>
                {!open ? (
                  <p className="note">
                    {sel.status === 'FUNDED' ? 'Fully funded (sandbox).' : 'Donations open after products are approved.'}
                  </p>
                ) : (
                  <>
                    <input
                      type="number"
                      min="1"
                      max={remaining}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      aria-label={`Amount in ${cur}`}
                    />
                    {data.region && (
                      <PayPalScriptProvider
                        key={cur}
                        options={{ clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || 'test', currency: cur }}
                      >
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
                {msg && <p className="err">{msg}</p>}
                <p className="note">Supplier payouts are simulated in this prototype.</p>
              </>
            )}
          </div>

          {sel && (
            <div className="panel">
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
            </div>
          )}

          {me?.coordinatorId && <CoordinatorForm onPosted={(id) => { setSelId(id); refresh(); }} />}
        </section>
      </div>
    </main>
  );
}
