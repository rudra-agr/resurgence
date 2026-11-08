'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import './coordinator.css';
import { useLedger } from '../Providers';
import { send } from '@/lib/client';
import { LABEL, makeMoney } from '@/lib/ledger';
import type { ActivityRow, CoordinatorData, CoordinatorNeed } from '@/lib/coordinator';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'No activity yet');
const eventLabel = (t: string) => LABEL[t] ?? t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, ' ');
const TASK_LABEL: Record<string, string> = { PURCHASE: 'Purchase', DISPATCH: 'Dispatch', DELIVERY: 'Delivery', VERIFICATION: 'Verification' };

type Msg = { kind: 'ok' | 'err'; text: string } | null;

export default function CoordinatorClient() {
  const { data: ledger } = useLedger();
  const [data, setData] = useState<CoordinatorData | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [q, setQ] = useState('');
  const grid = useRef<AgGridReact<ActivityRow>>(null);

  const money = useMemo(() => makeMoney(ledger.region?.currency ?? 'USD'), [ledger.region?.currency]);

  const load = useCallback(async () => {
    const { ok, j } = await send('/api/coordinator/needs', undefined, 'GET');
    if (!ok) return setError(j?.error || 'Could not load your dashboard.');
    setError('');
    setData(j);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function postUpdate(n: CoordinatorNeed) {
    if (text.trim().length < 10) return setMsg({ kind: 'err', text: 'Write at least 10 characters.' });
    setBusy(n.id);
    setMsg(null);
    const { ok, j } = await send(`/api/coordinator/needs/${n.id}/update`, { message: text.trim() });
    setBusy(null);
    if (!ok) return setMsg({ kind: 'err', text: j?.error || 'Could not post the update.' });
    setText('');
    setOpen(null);
    setMsg({ kind: 'ok', text: `Update posted. It is now on the public timeline for “${n.title}”.` });
    load();
  }

  async function markReady(n: CoordinatorNeed) {
    setBusy(n.id);
    setMsg(null);
    const { ok, j } = await send(`/api/coordinator/needs/${n.id}/ready`, undefined, 'PATCH');
    setBusy(null);
    if (!ok) return setMsg({ kind: 'err', text: j?.error || 'Could not mark this need ready.' });
    setMsg({ kind: 'ok', text: `Marked “${n.title}” ready for dispatch. The admin will see it on the timeline.` });
    load();
  }

  const cols = useMemo<ColDef<ActivityRow>[]>(
    () => [
      { field: 'createdAt', headerName: 'When', minWidth: 185, valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleString() : '') },
      { field: 'needTitle', headerName: 'Need', flex: 1, minWidth: 170 },
      { field: 'type', headerName: 'Event', minWidth: 190, valueFormatter: (p) => eventLabel(p.value) },
      { field: 'actor', headerName: 'By', minWidth: 130 },
      { field: 'message', headerName: 'Details', flex: 2, minWidth: 260, tooltipField: 'message' },
    ],
    []
  );

  function exportCsv() {
    grid.current?.api.exportDataAsCsv({
      fileName: 'resurgence-my-needs-activity-sandbox.csv',
      // Stop spreadsheet formulas: a cell that starts with = + - @ is prefixed with an apostrophe.
      processCellCallback: (c) => (typeof c.value === 'string' && /^[=+\-@\t\r]/.test(c.value) ? `'${c.value}` : c.value),
    });
  }

  if (error) return <div className="wrap page"><p className="err" role="alert">{error}</p></div>;
  if (!data) return <div className="wrap page"><p className="note">Loading your dashboard…</p></div>;

  return (
    <div className="wrap co-page">
      <header className="co-head">
        <div>
          <p className="kicker">Coordinator</p>
          <h1 className="page-title">Welcome back, {data.coordinator.name}</h1>
          <p className="co-lede">
            {data.coordinator.region} <span className="co-role">COORDINATOR</span>
          </p>
        </div>
        <div className="co-actions">
          <span className="co-chip">Sandbox · no real money or aid</span>
          <Link href="/post" className="co-post">Post a need</Link>
        </div>
      </header>

      <div className="co-kpis">
        <div><span>Needs posted</span><strong>{data.stats.needs}</strong></div>
        <div><span>Raised across your needs (sandbox)</span><strong>{money(data.stats.raised)}</strong></div>
        <div><span>Families on your needs</span><strong>{data.stats.families.toLocaleString()}</strong></div>
      </div>

      <p className={msg ? (msg.kind === 'err' ? 'err co-msg' : 'co-msg co-ok') : 'co-msg'} role="status" aria-live="polite">
        {msg?.text ?? ''}
      </p>

      <h2 className="co-h2">Your needs</h2>
      {data.needs.length === 0 ? (
        <div className="co-empty">
          You have not posted a need yet. <Link href="/post">Post your first need</Link> and it will appear here.
        </div>
      ) : (
        <ul className="co-list">
          {data.needs.map((n) => {
            const pct = n.target > 0 ? Math.min(100, (n.raised / n.target) * 100) : 0;
            const isOpen = open === n.id;
            return (
              <li key={n.id} className="co-card">
                <div className="co-card-top">
                  <div>
                    <h3><Link href={`/needs/${n.id}`}>{n.title}</Link></h3>
                    <p className="co-loc">{n.location || 'No location given'} · {n.urgency} urgency</p>
                  </div>
                  <div className="co-badges">
                    <span className={`co-badge s-${n.status.toLowerCase()}`}>{LABEL[n.status] ?? n.status}</span>
                    {n.readyMarked && <span className="co-badge ready">Ready for dispatch</span>}
                  </div>
                </div>

                <div className="co-meter-wrap">
                  <div className="co-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Funding progress">
                    <i style={{ width: `${pct}%` }} />
                  </div>
                  <p>
                    {n.target > 0 ? (
                      <>{money(n.raised)} of {money(n.target)} (sandbox) · {Math.round(pct)}%</>
                    ) : (
                      <>Not priced yet. Products must be approved before funding opens.</>
                    )}
                  </p>
                </div>

                <dl className="co-facts">
                  <div><dt>Families</dt><dd>{n.families.toLocaleString()}</dd></div>
                  <div><dt>Last activity</dt><dd>{when(n.lastEventAt)}</dd></div>
                  <div>
                    <dt>Next scheduled</dt>
                    <dd>
                      {n.nextTask
                        ? `${TASK_LABEL[n.nextTask.type] ?? n.nextTask.type}, ${new Date(n.nextTask.startDate).toLocaleString()}${n.nextTask.resource ? ` · ${n.nextTask.resource}` : ' · no team yet'}`
                        : 'Nothing scheduled yet'}
                    </dd>
                  </div>
                </dl>

                {n.lastUpdate && (
                  <p className="co-last"><b>Your last update</b> ({new Date(n.lastUpdate.createdAt).toLocaleDateString()}): {n.lastUpdate.message}</p>
                )}

                <div className="co-row">
                  <button className="alt" aria-expanded={isOpen} aria-controls={`upd-${n.id}`} onClick={() => { setOpen(isOpen ? null : n.id); setText(''); setMsg(null); }}>
                    {isOpen ? 'Close' : 'Post a situation update'}
                  </button>
                  {n.canMarkReady && (
                    <button disabled={busy === n.id} onClick={() => markReady(n)}>Mark ready for dispatch</button>
                  )}
                </div>

                {isOpen && (
                  <div id={`upd-${n.id}`} className="co-update">
                    <label htmlFor={`txt-${n.id}`}>What is the situation on the ground?</label>
                    <textarea id={`txt-${n.id}`} rows={4} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
                    <div className="co-row">
                      <button disabled={busy === n.id} onClick={() => postUpdate(n)}>Post update</button>
                      <small>{text.length}/500 · this is public and appears on the need’s timeline right away.</small>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="co-h2">Activity on your needs</h2>
      {data.activity.length === 0 ? (
        <div className="co-empty">No activity yet.</div>
      ) : (
        <>
          <div className="toolbar">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search activity" aria-label="Search activity" />
            <button onClick={exportCsv}>Export CSV</button>
          </div>
          <div className="ag-theme-quartz" style={{ height: Math.max(180, Math.min(data.activity.length * 48 + 100, 520)) }}>
            <AgGridReact<ActivityRow>
              ref={grid}
              rowData={data.activity}
              columnDefs={cols}
              defaultColDef={{ sortable: true, resizable: true }}
              quickFilterText={q}
              suppressMovableColumns
              overlayNoRowsTemplate="No activity yet."
            />
          </div>
        </>
      )}
    </div>
  );
}
