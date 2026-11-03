'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { send } from '@/lib/client';
import ProductPanel from './ProductPanel';
import CoordinatorForm from './CoordinatorForm';
import Overview from './Overview';
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

type View = 'overview' | 'needs' | 'donations' | 'post';

const slug = (v: string) => v.toLowerCase().replace(/\s+/g, '-');

function FundingCell(p: ICellRendererParams<NeedRow>) {
  const n = p.data;
  if (!n) return null;
  const label = fundingStatus(n);
  const pctN = n.target > 0 ? Math.min(100, (n.raised / n.target) * 100) : 0;
  return (
    <span className="fund-cell">
      <span className={`chip chip-${slug(label)}`}>{label}</span>
      {n.target > 0 && (
        <span className="mini-meter" aria-hidden="true">
          <span style={{ width: `${pctN}%` }} />
        </span>
      )}
    </span>
  );
}

function VerifyCell(p: ICellRendererParams<NeedRow>) {
  const n = p.data;
  if (!n) return null;
  return n.verified ? (
    <span className="chip chip-mock">Verified by {n.authority} (mock)</span>
  ) : (
    <span className="chip chip-unverified">Unverified</span>
  );
}

function UrgencyCell(p: ICellRendererParams<NeedRow>) {
  return p.value ? <span className={`chip urg-${slug(String(p.value))}`}>{p.value}</span> : null;
}

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
  const [needQ, setNeedQ] = useState('');
  const [donQ, setDonQ] = useState('');
  const [offline, setOffline] = useState(false);
  const [evNote, setEvNote] = useState('');
  const [evMsg, setEvMsg] = useState('');
  const [view, setView] = useState<View>('overview');
  const donGrid = useRef<AgGridReact<Donation>>(null);

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
      { field: 'title', headerName: 'Need', flex: 1.2, minWidth: 170 },
      { field: 'location', flex: 1, minWidth: 130 },
      { field: 'urgency', width: 120, cellRenderer: UrgencyCell },
      { field: 'families', width: 95 },
      { field: 'raised', width: 105, valueFormatter: (p) => money(p.value) },
      { field: 'target', width: 105, valueFormatter: (p) => (p.value ? money(p.value) : '—') },
      { headerName: 'Funding', width: 190, valueGetter: (p) => (p.data ? fundingStatus(p.data) : ''), cellRenderer: FundingCell },
      {
        headerName: 'Verification',
        flex: 1.3,
        minWidth: 240,
        valueGetter: (p) =>
          p.data ? (p.data.verified ? `Verified by ${p.data.authority} (mock)` : 'Unverified') : '',
        cellRenderer: VerifyCell,
      },
    ],
    [cur] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const donCols = useMemo<ColDef<Donation>[]>(
    () => [
      { field: 'createdAt', headerName: 'When', flex: 1, minWidth: 170, valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleString() : '') },
      { field: 'needTitle', headerName: 'Need', flex: 1, minWidth: 140 },
      { field: 'payer', minWidth: 100 },
      { field: 'amount', minWidth: 100, valueFormatter: (p) => money(p.value) },
      { field: 'paypalCaptureId', headerName: 'PayPal capture (sandbox)', flex: 1, minWidth: 190 },
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

  const totalRow = useMemo<Donation[]>(
    () => [
      {
        id: 'total',
        needId: '',
        needTitle: `Total (${data.donations.length} donations)`,
        amount: data.donations.reduce((a, d) => a + d.amount, 0),
        currency: cur,
        payer: '',
        paypalOrderId: '',
        paypalCaptureId: '',
        createdAt: '',
      },
    ],
    [data.donations, cur]
  );

  function exportCsv() {
    donGrid.current?.api.exportDataAsCsv({
      fileName: 'resurgence-donations-sandbox.csv',
      skipPinnedBottom: true,
      // Stop spreadsheet formulas: a cell that starts with = + - @ is prefixed with an apostrophe.
      processCellCallback: (c) => (typeof c.value === 'string' && /^[=+\-@\t\r]/.test(c.value) ? `'${c.value}` : c.value),
    });
  }

  async function recordEvidence(type: 'PURCHASED' | 'DELIVERED') {
    if (!sel) return;
    const { ok, j } = await send(`/api/needs/${sel.id}/evidence`, { type, note: evNote });
    if (!ok) return setEvMsg(j.error || 'Could not record the evidence.');
    setEvNote('');
    setEvMsg('');
    const r = await send(`/api/needs/${sel.id}/events`, undefined, 'GET');
    if (r.ok) setEvents(r.j);
  }

  const has = (t: string) => events.some((e) => e.type === t);
  const remaining = sel ? Math.max(0, sel.target - sel.raised) : 0;
  const open = !!sel && sel.target > 0 && sel.status !== 'FUNDED';
  const totalFamilies = data.needs.reduce((a, n) => a + n.families, 0);
  const totalRaised = data.needs.reduce((a, n) => a + n.raised, 0);
  const fundedCount = data.needs.filter((n) => n.status === 'FUNDED').length;
  const pct = sel && sel.target > 0 ? Math.min(100, (sel.raised / sel.target) * 100) : 0;
  const steps: [string, boolean, string][] = sel
    ? [
        ['Requested', true, 'Recorded'],
        ['Priced', sel.target > 0, sel.target > 0 ? 'Approved' : 'Pending'],
        ['Funded', sel.status === 'FUNDED', sel.status === 'FUNDED' ? 'Sandbox' : sel.raised > 0 ? `${Math.round(pct)}%` : 'Pending'],
        ['Purchased', has('PURCHASED'), has('PURCHASED') ? 'Test evidence' : 'Unverified'],
        ['Delivered', has('DELIVERED'), has('DELIVERED') ? 'Test evidence' : 'Unverified'],
      ]
    : [];

  return (
    <main>
      <div className="banner">Sandbox demo: no real money moves and no real aid is delivered.</div>
      {view === 'overview' ? (
        <header className="hero">
          <p className="kicker">{data.region ? `${data.region.name}, ${data.region.country}` : 'Disaster relief'} · public ledger</p>
          <h1>Resurgence</h1>
          <p className="lead">
            Follow every relief dollar from request to doorstep. After a major flood, money vanished into one account and
            no one could see where it went. Here every need has a public trail, and anything not yet proven says so.
          </p>
          <dl className="stats">
            <div>
              <dt>Needs listed</dt>
              <dd>{data.needs.length}</dd>
            </div>
            <div>
              <dt>Families listed</dt>
              <dd>{totalFamilies}</dd>
            </div>
            <div>
              <dt>Raised (sandbox)</dt>
              <dd>{money(totalRaised)}</dd>
            </div>
            <div>
              <dt>Fully funded</dt>
              <dd>
                {fundedCount} of {data.needs.length}
              </dd>
            </div>
          </dl>
        </header>
      ) : (
        <div className="topbar">
          <b>Resurgence</b>
          <span>{data.region ? `${data.region.name}, ${data.region.country}` : 'Disaster relief'} · public ledger</span>
        </div>
      )}
      {offline && <p className="err">Cannot reach the server. Showing the last data received.</p>}

      <nav className="tabs" aria-label="Sections">
        {(
          [
            ['overview', 'Overview'],
            ['needs', 'Needs'],
            ['donations', 'Donations ledger'],
            ...(me?.coordinatorId ? [['post', 'Post a need']] : []),
          ] as [View, string][]
        ).map(([v, label]) => (
          <button key={v} className={view === v ? 'tab on' : 'tab'} aria-current={view === v ? 'page' : undefined} onClick={() => setView(v)}>
            {label}
          </button>
        ))}
      </nav>

      {me ? (
        <p className="note staff">
          Logged in as {me.name} ({me.role.toLowerCase()}) <button className="alt" onClick={doLogout}>Log out</button>
        </p>
      ) : (
        <details className="staff">
          <summary>Staff login (coordinator or admin)</summary>
          <input placeholder="Email" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} />
          <input
            placeholder="Password"
            type="password"
            value={login.password}
            onChange={(e) => setLogin({ ...login, password: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && doLogin()}
          />
          <button onClick={doLogin}>Log in</button> {loginMsg && <span className="err">{loginMsg}</span>}
        </details>
      )}

      {view === 'overview' && (
        <Overview
          needs={data.needs}
          donations={data.donations}
          money={money}
          onPick={(id) => {
            setSelId(id);
            setMsg('');
            setView('needs');
          }}
        />
      )}

      {view === 'needs' && (
        <div className="cols">
          <section>
          <div className="panel">
            <h2>Needs ledger</h2>
            <label>
              <input type="checkbox" checked={urgentOnly} onChange={(e) => setUrgentOnly(e.target.checked)} /> Urgent and not yet funded
            </label>
            <input value={needQ} onChange={(e) => setNeedQ(e.target.value)} placeholder="Search needs" aria-label="Search needs" />
            <div className="ag-theme-quartz" style={{ height: 340 }}>
              <AgGridReact<NeedRow>
                rowData={rows}
                columnDefs={needCols}
                defaultColDef={{ sortable: true }}
                quickFilterText={needQ}
                getRowId={(p) => p.data.id}
                rowSelection="single"
                onRowClicked={(e) => {
                  setSelId(e.data?.id ?? null);
                  setMsg('');
                }}
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
                {sel.target > 0 && (
                  <div className="meter" role="img" aria-label={`${Math.round(pct)}% funded`}>
                    <span style={{ width: `${pct}%` }} />
                  </div>
                )}
                <ol className="proof" aria-label="Proof of aid">
                  {steps.map(([label, done, note]) => (
                    <li key={label} className={done ? 'done' : 'todo'}>
                      <span>{label}</span>
                      <small>{note}</small>
                    </li>
                  ))}
                </ol>

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
              {me?.role === 'ADMIN' && sel.status === 'FUNDED' && !(has('PURCHASED') && has('DELIVERED')) && (
                <div>
                  <input
                    value={evNote}
                    onChange={(e) => setEvNote(e.target.value)}
                    placeholder="Evidence note, e.g. invoice reference"
                    maxLength={300}
                  />
                  <button onClick={() => recordEvidence(has('PURCHASED') ? 'DELIVERED' : 'PURCHASED')}>
                    Record {has('PURCHASED') ? 'delivery' : 'purchase'} (TEST evidence)
                  </button>
                  {evMsg && <p className="note">{evMsg}</p>}
                  <p className="note">Admin only. Saved as test evidence, not a real purchase.</p>
                </div>
              )}
            </div>
          )}

          </section>
        </div>
      )}

      {view === 'donations' && (
        <div className="panel">
          <h2>Donations ledger</h2>
          <p className="note">Every captured sandbox payment, with its masked PayPal reference.</p>
          <div className="toolbar">
            <input value={donQ} onChange={(e) => setDonQ(e.target.value)} placeholder="Search donations" aria-label="Search donations" />
            <button className="alt" onClick={exportCsv}>Export CSV</button>
          </div>
          <div className="ag-theme-quartz" style={{ height: 420 }}>
            <AgGridReact<Donation>
              ref={donGrid}
              rowData={data.donations}
              columnDefs={donCols}
              defaultColDef={{ sortable: true }}
              quickFilterText={donQ}
              pinnedBottomRowData={totalRow}
              overlayNoRowsTemplate="No donations yet. Be the first."
            />
          </div>
        </div>
      )}

      {view === 'post' &&
        (me?.coordinatorId ? (
          <CoordinatorForm onPosted={(id) => { setSelId(id); refresh(); setView('needs'); }} />
        ) : (
          <p className="note">Log in as a coordinator to post a need.</p>
        ))}
    </main>
  );
}
