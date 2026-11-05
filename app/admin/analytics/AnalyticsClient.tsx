'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgCharts } from 'ag-charts-react';
import type { AgChartOptions } from 'ag-charts-community';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { send } from '@/lib/client';
import { URGENCY_ORDER, makeMoney } from '@/lib/ledger';
import './analytics.css';

type Overview = {
  currency: string; totalNeeds: number; openNeeds: number; fundedNeeds: number; totalFamilies: number;
  totalRaised: number; totalTarget: number; fundingCompletionPct: number; totalDonations: number;
};
type Urgency = { urgency: string; count: number };
type Status = { status: string; count: number };
type Day = { date: string; amount: number; count: number };
type Loc = { location: string; count: number; families: number; raised: number };
type Verif = { type: string; count: number };
type Gap = { needId: string; title: string; target: number; raised: number; gap: number; families: number };
type Snapshot = { id: string; snapshotDate: string; bodiesRecovered: number | null; missing: number | null; rescued: number | null; injured: number | null; source: string };
type Damage = { id: string; settlement: string; totalAssessed: number; affected: number; source: string };
type Disaster = {
  name: string; date: string; triggerType: string; glacierName: string | null; collapseAreaKm2: number | null;
  waveHeightM: number | null; priorRainfallReported: boolean; previousGLOF: string | null;
  casualtySnapshots: Snapshot[]; buildingDamage: Damage[];
} | null;

type Data = {
  overview: Overview; urgency: Urgency[]; status: Status[]; days: Day[]; locations: Loc[];
  verification: Verif[]; gaps: Gap[]; disaster: Disaster;
};

const ENDPOINTS = [
  'overview', 'needs-by-urgency', 'needs-by-status', 'donations-over-time',
  'needs-by-location', 'verification-progress', 'funding-gap', 'disaster-summary',
] as const;

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: 'Submitted', PRODUCTS_MATCHED: 'Priced', PARTIALLY_FUNDED: 'Partly funded', FUNDED: 'Funded',
  PAYMENT_FAILED: 'Payment failed', PURCHASED: 'Purchased', DELIVERED: 'Delivered',
};
const EVENT_LABEL: Record<string, string> = {
  ...STATUS_LABEL, PRODUCTS_MATCHED: 'Products approved', PURCHASED: 'Purchase evidence', DELIVERED: 'Delivery evidence',
};
// Same order as URGENCY_ORDER, so the donut colours always match the level.
const URGENCY_FILLS = ['#b83f0c', '#d98a2b', '#d9b72f', '#1f6b4f'];
const PALETTE = ['#b83f0c', '#1b6f8a', '#1f6b4f', '#d9b72f', '#4b5560'];
const day = (iso: string) => iso.slice(0, 10);

const frame = { background: { visible: false }, theme: { palette: { fills: PALETTE, strokes: PALETTE } } } as const;

export default function AnalyticsClient() {
  const [data, setData] = useState<Data | null>(null);
  const [denied, setDenied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [stamp, setStamp] = useState('');
  const [busy, setBusy] = useState(false);
  const grid = useRef<AgGridReact<Gap>>(null);

  const load = useCallback(async () => {
    setBusy(true);
    const res = await Promise.all(ENDPOINTS.map((e) => send(`/api/admin/analytics/${e}`, undefined, 'GET')));
    setBusy(false);
    if (res.some((r) => !r.ok && (r.j.error === 'Please log in.' || r.j.error === 'Not allowed.'))) return setDenied(true);
    if (res.some((r) => !r.ok)) return setFailed(true);
    setFailed(false);
    const [overview, urgency, status, days, locations, verification, gaps, disaster] = res.map((r) => r.j);
    setData({ overview, urgency, status, days, locations, verification, gaps, disaster: disaster && disaster.id ? disaster : null });
    setStamp(new Date().toLocaleTimeString());
  }, []);

  useEffect(() => { load(); }, [load]);

  const money = useMemo(() => makeMoney(data?.overview.currency ?? 'USD'), [data?.overview.currency]);

  const insights = useMemo(() => {
    if (!data) return [];
    const out: { head: string; body: string }[] = [];
    const g = data.gaps[0];
    out.push({
      head: 'Biggest funding gap',
      body: g && g.gap > 0 ? `${g.title}: ${money(g.gap)} still needed for ${g.families} families.` : 'Every priced need is fully funded.',
    });
    const l = data.locations[0];
    out.push({
      head: 'Most families waiting',
      body: l ? `${l.location}: ${l.families} families across ${l.count} need${l.count === 1 ? '' : 's'}.` : 'No needs listed yet.',
    });
    const count = (t: string) => data.verification.find((v) => v.type === t)?.count ?? 0;
    const { fundedNeeds } = data.overview;
    out.push({
      head: 'Evidence on record',
      body: `${count('PURCHASED')} of ${fundedNeeds} funded needs have purchase evidence; ${count('DELIVERED')} have delivery evidence.`,
    });
    return out;
  }, [data, money]);

  const cols = useMemo<ColDef<Gap>[]>(
    () => [
      { field: 'title', headerName: 'Need', flex: 2, minWidth: 180 },
      { field: 'families', headerName: 'Families', flex: 1, minWidth: 100 },
      { field: 'target', headerName: 'Target', flex: 1, minWidth: 110, valueFormatter: (p) => money(p.value) },
      { field: 'raised', headerName: 'Raised', flex: 1, minWidth: 110, valueFormatter: (p) => money(p.value) },
      {
        field: 'gap', headerName: 'Gap', flex: 1, minWidth: 110, sort: 'desc',
        valueFormatter: (p) => money(p.value),
        cellClassRules: { 'gap-open': (p) => p.value > 0, 'gap-closed': (p) => p.value === 0 },
      },
    ],
    [money]
  );

  if (denied) {
    return (
      <div className="wrap page narrow">
        <p className="kicker">Admin</p>
        <h1 className="page-title">Admin access required</h1>
        <p className="note">Your session has ended or this account is not an admin. <Link href="/staff">Go to staff login</Link>.</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="wrap page">
        <p className="kicker">Admin</p>
        <h1 className="page-title">Analytics</h1>
        <p className={failed ? 'err' : 'note'} role={failed ? 'alert' : undefined}>
          {failed ? 'Could not load analytics. Try again in a moment.' : 'Loading analytics…'}
        </p>
        {failed && <button className="alt" onClick={load}>Retry</button>}
      </div>
    );
  }

  const { overview: o, disaster } = data;
  const moneyAxis = { type: 'number' as const, position: 'left' as const, label: { formatter: (p: { value: number }) => money(p.value) } };

  const donationsOpt: AgChartOptions = {
    ...frame,
    data: data.days,
    series: [{ type: 'line', xKey: 'date', yKey: 'amount', yName: 'Captured', marker: { enabled: true } }],
    axes: [{ type: 'category', position: 'bottom' }, moneyAxis],
    legend: { enabled: false },
  };

  const urgencyData = ['Critical', 'High', 'Medium', 'Low'].map((u) => ({
    urgency: u, count: data.urgency.find((x) => x.urgency === u)?.count ?? 0,
  }));
  const extraUrgency = data.urgency.filter((x) => URGENCY_ORDER[x.urgency] === undefined);
  const urgencyOpt: AgChartOptions = {
    ...frame,
    data: [...urgencyData, ...extraUrgency],
    series: [{ type: 'donut', calloutLabelKey: 'urgency', angleKey: 'count', innerRadiusRatio: 0.6, fills: URGENCY_FILLS, strokes: ['#fbf8f1'] }],
    legend: { enabled: true, position: 'right' },
  };

  const statusOpt: AgChartOptions = {
    ...frame,
    data: data.status.map((s) => ({ label: STATUS_LABEL[s.status] ?? s.status, count: s.count })),
    series: [{ type: 'bar', xKey: 'label', yKey: 'count', yName: 'Needs' }],
    axes: [{ type: 'category', position: 'bottom' }, { type: 'number', position: 'left', interval: { minSpacing: 40 } }],
    legend: { enabled: false },
  };

  const locationOpt: AgChartOptions = {
    ...frame,
    data: data.locations,
    series: [{ type: 'bar', direction: 'horizontal', xKey: 'location', yKey: 'families', yName: 'Families' }],
    axes: [{ type: 'category', position: 'left' }, { type: 'number', position: 'bottom' }],
    legend: { enabled: false },
  };

  const verifOpt: AgChartOptions = {
    ...frame,
    data: data.verification.map((v) => ({ label: EVENT_LABEL[v.type] ?? v.type, count: v.count })),
    series: [{ type: 'bar', xKey: 'label', yKey: 'count', yName: 'Events recorded' }],
    axes: [{ type: 'category', position: 'bottom' }, { type: 'number', position: 'left' }],
    legend: { enabled: false },
  };

  const casualtyOpt: AgChartOptions | null = disaster && {
    ...frame,
    data: disaster.casualtySnapshots.map((s) => ({ date: day(s.snapshotDate), ...s })),
    series: [
      { type: 'bar', xKey: 'date', yKey: 'bodiesRecovered', yName: 'Bodies recovered' },
      { type: 'bar', xKey: 'date', yKey: 'missing', yName: 'Missing' },
      { type: 'bar', xKey: 'date', yKey: 'rescued', yName: 'Rescued' },
      { type: 'bar', xKey: 'date', yKey: 'injured', yName: 'Injured' },
    ],
    axes: [{ type: 'category', position: 'bottom' }, { type: 'number', position: 'left' }],
    legend: { enabled: true, position: 'bottom' },
  };

  const buildingOpt: AgChartOptions | null = disaster && {
    ...frame,
    data: disaster.buildingDamage,
    series: [
      { type: 'bar', xKey: 'settlement', yKey: 'totalAssessed', yName: 'Buildings assessed' },
      { type: 'bar', xKey: 'settlement', yKey: 'affected', yName: 'Affected' },
    ],
    axes: [{ type: 'category', position: 'bottom' }, { type: 'number', position: 'left' }],
    legend: { enabled: true, position: 'bottom' },
  };

  const kpis: [string, string][] = [
    ['Total needs', String(o.totalNeeds)],
    ['Families listed', o.totalFamilies.toLocaleString()],
    ['Total raised', money(o.totalRaised)],
    ['Funding complete', `${o.fundingCompletionPct}%`],
  ];

  function exportGap() {
    grid.current?.api.exportDataAsCsv({
      fileName: 'resurgence-funding-gap-sandbox.csv',
      processCellCallback: (c) => (typeof c.value === 'string' && /^[=+\-@\t\r]/.test(c.value) ? `'${c.value}` : c.value),
    });
  }

  return (
    <div className="wrap page">
      <div className="an-head">
        <div>
          <p className="kicker">Admin</p>
          <h1 className="page-title">Funding analytics</h1>
          <p className="page-lead">
            Where money has landed, where it has not, and what has been verified. Sandbox payments only.
          </p>
        </div>
        <div>
          <p className="an-stamp">Updated {stamp}</p>
          <button className="alt" onClick={load} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </div>
      {failed && <p className="err" role="alert">Some data could not be refreshed. Showing the last good copy.</p>}

      <dl className="stats an-kpis">
        {kpis.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
      <p className="note">
        {o.totalDonations} captured donation{o.totalDonations === 1 ? '' : 's'} · {money(o.totalRaised)} of {money(o.totalTarget)} priced ·
        {' '}{o.fundedNeeds} funded, {o.openNeeds} open
      </p>

      <ul className="an-insights">
        {insights.map((i) => (
          <li key={i.head}><b>{i.head}</b>{i.body}</li>
        ))}
      </ul>

      <div className="an-grid">
        <div className="panel wide">
          <h2>Donations over time</h2>
          <p className="note">Captured sandbox payments per day.</p>
          {data.days.length ? <div className="an-chart"><AgCharts options={donationsOpt} /></div> : <p className="note an-empty">No donations yet.</p>}
        </div>

        <div className="panel">
          <h2>Needs by urgency</h2>
          <p className="note">How the open workload splits by the level coordinators set.</p>
          {o.totalNeeds ? <div className="an-chart"><AgCharts options={urgencyOpt} /></div> : <p className="note an-empty">No needs yet.</p>}
        </div>

        <div className="panel">
          <h2>Needs by status</h2>
          <p className="note">Where each need sits between request and funded.</p>
          {data.status.length ? <div className="an-chart"><AgCharts options={statusOpt} /></div> : <p className="note an-empty">No needs yet.</p>}
        </div>

        <div className="panel">
          <h2>Families by location</h2>
          <p className="note">Where need is clustered.</p>
          {data.locations.length ? <div className="an-chart"><AgCharts options={locationOpt} /></div> : <p className="note an-empty">No needs yet.</p>}
        </div>

        <div className="panel">
          <h2>Verification activity</h2>
          <p className="note">Audit events actually recorded. Purchase and delivery appear only with admin evidence.</p>
          {data.verification.length ? <div className="an-chart"><AgCharts options={verifOpt} /></div> : <p className="note an-empty">No events yet.</p>}
        </div>
      </div>

      <div className="panel an-grid-wrap">
        <h2>Funding gap by need</h2>
        <p className="note">Priced needs only, largest gap first.</p>
        <div className="toolbar"><button className="alt" onClick={exportGap}>Export CSV</button></div>
        <div className="ag-theme-quartz">
          <AgGridReact<Gap> ref={grid} rowData={data.gaps} columnDefs={cols} defaultColDef={{ sortable: true }} overlayNoRowsTemplate="No priced needs yet." />
        </div>
      </div>

      {disaster && casualtyOpt && buildingOpt && (
        <section className="an-section" aria-labelledby="an-disaster">
          <p className="kicker">Event context</p>
          <h2 id="an-disaster">{disaster.name}</h2>
          <dl className="an-facts">
            <div><dt>Trigger</dt><dd>{disaster.triggerType}</dd></div>
            {disaster.glacierName && <div><dt>Source</dt><dd>{disaster.glacierName}</dd></div>}
            {disaster.waveHeightM != null && <div><dt>Wave height (est.)</dt><dd>{disaster.waveHeightM} m</dd></div>}
            <div><dt>Local rainfall</dt><dd>{disaster.priorRainfallReported ? 'Reported' : 'None reported'}</dd></div>
            {disaster.previousGLOF && <div><dt>Previous event</dt><dd>{disaster.previousGLOF}</dd></div>}
          </dl>
          <div className="an-grid">
            <div className="panel">
              <h2>Casualty progression</h2>
              <p className="note">Dated snapshots, not final totals. A missing bar means that figure was not reported on that date. Source: {disaster.casualtySnapshots[0]?.source}.</p>
              <div className="an-chart tall"><AgCharts options={casualtyOpt} /></div>
            </div>
            <div className="panel">
              <h2>Building damage</h2>
              <p className="note">Satellite assessment per settlement. Source: {disaster.buildingDamage[0]?.source}.</p>
              <div className="an-chart tall"><AgCharts options={buildingOpt} /></div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
