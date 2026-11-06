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
import { useThemeMode } from '@/lib/theme';
import './analytics.css';

type Overview = {
  currency: string; totalNeeds: number; openNeeds: number; pricedNeeds: number; fundedNeeds: number; totalFamilies: number;
  totalRaised: number; totalTarget: number; fundingCompletionPct: number; totalDonations: number;
};
type Urgency = { urgency: string; count: number };
type Day = { date: string; amount: number; count: number };
type Loc = { location: string; count: number; families: number; raised: number };
type Verif = { type: string; count: number; needs: number };
type Gap = { needId: string; title: string; target: number; raised: number; gap: number; families: number };
type Snapshot = { id: string; snapshotDate: string; bodiesRecovered: number | null; missing: number | null; rescued: number | null; injured: number | null; source: string };
type Damage = { id: string; settlement: string; totalAssessed: number; affected: number; source: string };
type Disaster = {
  name: string; date: string; triggerType: string; glacierName: string | null; waveHeightM: number | null;
  priorRainfallReported: boolean; previousGLOF: string | null; casualtySnapshots: Snapshot[]; buildingDamage: Damage[];
} | null;
type Data = { overview: Overview; urgency: Urgency[]; days: Day[]; locations: Loc[]; verification: Verif[]; gaps: Gap[]; disaster: Disaster };

// The needs-by-status endpoint still exists; the dashboard shows the pipeline instead, because almost
// every need shares one status early on and a single bar says nothing.
const ENDPOINTS = ['overview', 'needs-by-urgency', 'donations-over-time', 'needs-by-location', 'verification-progress', 'funding-gap', 'disaster-summary'] as const;
const EVENT_LABEL: Record<string, string> = {
  SUBMITTED: 'Submitted', PRODUCTS_MATCHED: 'Products approved', PARTIALLY_FUNDED: 'Partly funded', FUNDED: 'Funded',
  PAYMENT_FAILED: 'Payment failed', REFUNDED: 'Refunded', PURCHASED: 'Purchase evidence', DELIVERED: 'Delivery evidence',
};
const URGENCY_FILLS = ['#b83f0c', '#d98a2b', '#d9b72f', '#1f6b4f'];
const PALETTE = ['#2f8f68', '#b83f0c', '#1b6f8a', '#d9b72f', '#6b7a88'];
const day = (iso: string) => iso.slice(0, 10);
const labelOf = (t: string) => EVENT_LABEL[t] ?? t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, ' ');
const Empty = ({ text }: { text: string }) => <div className="an-empty">{text}</div>;

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - (v / max) * 26}`).join(' ');
  return (
    <svg className="an-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} />
    </svg>
  );
}

function Gauge({ pct, raised, target }: { pct: number; raised: string; target: string }) {
  const len = Math.PI * 70;
  const p = Math.max(0, Math.min(100, pct));
  return (
    <>
      <svg className="an-gauge" viewBox="0 0 180 110" role="img" aria-label={`${Math.round(p)} percent of the funding target raised`}>
        <path className="track" d="M20 90 A70 70 0 0 1 160 90" fill="none" strokeWidth="16" strokeLinecap="round" />
        {p > 0 && <path className="fill" d="M20 90 A70 70 0 0 1 160 90" fill="none" strokeWidth="16" strokeLinecap="round" strokeDasharray={`${(len * p) / 100} ${len}`} />}
        <text className="big" x="90" y="82">{Math.round(p)}%</text>
        <text className="small" x="90" y="102">{raised} raised</text>
      </svg>
      <p className="an-gauge-note">of {target} priced so far</p>
    </>
  );
}

export default function AnalyticsClient() {
  const { mode } = useThemeMode();
  const [data, setData] = useState<Data | null>(null);
  const [denied, setDenied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [stamp, setStamp] = useState('');
  const [busy, setBusy] = useState(false);
  const grid = useRef<AgGridReact<Gap>>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setBusy(true);
    const res = await Promise.all(ENDPOINTS.map((e) => send(`/api/admin/analytics/${e}`, undefined, 'GET')));
    setBusy(false);
    if (res.some((r) => !r.ok && (r.j.error === 'Please log in.' || r.j.error === 'Not allowed.'))) return setDenied(true);
    if (res.some((r) => !r.ok)) return setFailed(true);
    setFailed(false);
    const [overview, urgency, days, locations, verification, gaps, disaster] = res.map((r) => r.j);
    setData({ overview, urgency, days, locations, verification, gaps, disaster: disaster && disaster.id ? disaster : null });
    setStamp(new Date().toLocaleTimeString());
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 30000);
    return () => clearInterval(t);
  }, [load]);

  const money = useMemo(() => makeMoney(data?.overview.currency ?? 'USD'), [data?.overview.currency]);

  const cols = useMemo<ColDef<Gap>[]>(
    () => [
      { field: 'title', headerName: 'Need', flex: 2, minWidth: 180 },
      { field: 'families', headerName: 'Families', flex: 1, minWidth: 100 },
      { field: 'target', headerName: 'Target', flex: 1, minWidth: 110, valueFormatter: (p) => money(p.value) },
      { field: 'raised', headerName: 'Raised', flex: 1, minWidth: 110, valueFormatter: (p) => money(p.value) },
      {
        field: 'gap', headerName: 'Gap', flex: 1, minWidth: 110, sort: 'desc', valueFormatter: (p) => money(p.value),
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
        {failed && <button className="alt" onClick={() => load()}>Retry</button>}
      </div>
    );
  }

  const { overview: o, disaster } = data;
  const stillNeeded = data.gaps.reduce((a, g) => a + g.gap, 0);
  let run = 0;
  const cumulative = data.days.map((d) => (run += d.amount));

  const needsWith = (t: string) => data.verification.find((v) => v.type === t)?.needs ?? 0;
  // Pipeline: how many needs have reached each stage. Purchase and delivery count only with evidence.
  const pipeline = [
    { stage: 'Requested', n: o.totalNeeds },
    { stage: 'Priced', n: o.pricedNeeds },
    { stage: 'Funded', n: o.fundedNeeds },
    { stage: 'Purchased', n: needsWith('PURCHASED') },
    { stage: 'Delivered', n: needsWith('DELIVERED') },
  ];
  const stuck = pipeline.findIndex((s, i) => i > 0 && s.n < pipeline[i - 1].n);
  const pipelineNote =
    stuck < 0 ? 'Every need has moved through every stage.' : `${pipeline[stuck - 1].n - pipeline[stuck].n} of ${pipeline[stuck - 1].n} needs have not reached "${pipeline[stuck].stage}" yet.`;

  const biggest = data.gaps[0];
  const top = data.locations[0];
  const reads = [
    ['Biggest funding gap', biggest && biggest.gap > 0 ? `${biggest.title}: ${money(biggest.gap)} for ${biggest.families} families.` : 'Every priced need is fully funded.'],
    ['Most families waiting', top ? `${top.location}: ${top.families} families across ${top.count} need${top.count === 1 ? '' : 's'}.` : 'No needs listed yet.'],
    ['Pipeline', pipelineNote],
  ];

  const base = {
    background: { visible: false },
    theme: { baseTheme: mode === 'dark' ? ('ag-default-dark' as const) : ('ag-default' as const), palette: { fills: PALETTE, strokes: PALETTE } },
  };
  const moneyAxis = { type: 'number' as const, position: 'left' as const, label: { formatter: (p: { value: number }) => money(p.value) } };

  const dayOpt: AgChartOptions = {
    ...base,
    data: data.days.slice(-14).map((d) => ({ ...d, label: d.date.slice(5) })),
    series: [{ type: 'bar', xKey: 'label', yKey: 'amount', yName: 'Captured' }],
    axes: [{ type: 'category', position: 'bottom' }, moneyAxis],
    legend: { enabled: false },
  };

  const pipelineOpt: AgChartOptions = {
    ...base,
    data: [...pipeline].reverse(),
    series: [{ type: 'bar', direction: 'horizontal', xKey: 'stage', yKey: 'n', yName: 'Needs', label: { enabled: true, formatter: (p) => String(Math.round(p.value)) } }],
    axes: [{ type: 'category', position: 'left' }, { type: 'number', position: 'bottom', min: 0, interval: { minSpacing: 30 } }],
    legend: { enabled: false },
  };

  const urgencyData = ['Critical', 'High', 'Medium', 'Low'].map((u) => ({ urgency: u, count: data.urgency.find((x) => x.urgency === u)?.count ?? 0 }));
  const urgencyOpt: AgChartOptions = {
    ...base,
    data: [...urgencyData, ...data.urgency.filter((x) => URGENCY_ORDER[x.urgency] === undefined)],
    series: [{ type: 'donut', calloutLabelKey: 'urgency', angleKey: 'count', innerRadiusRatio: 0.62, fills: URGENCY_FILLS, strokeWidth: 0 }],
    legend: { enabled: true, position: 'bottom' },
  };

  const locationOpt: AgChartOptions = {
    ...base,
    data: data.locations.slice(0, 8),
    series: [{ type: 'bar', direction: 'horizontal', xKey: 'location', yKey: 'families', yName: 'Families' }],
    axes: [{ type: 'category', position: 'left' }, { type: 'number', position: 'bottom' }],
    legend: { enabled: false },
  };

  const verifOpt: AgChartOptions = {
    ...base,
    data: data.verification.map((v) => ({ label: labelOf(v.type), count: v.count })),
    series: [{ type: 'bar', direction: 'horizontal', xKey: 'label', yKey: 'count', yName: 'Events recorded' }],
    axes: [{ type: 'category', position: 'left' }, { type: 'number', position: 'bottom', interval: { minSpacing: 30 } }],
    legend: { enabled: false },
  };

  const casualtyOpt: AgChartOptions | null = disaster && {
    ...base,
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
    ...base,
    data: disaster.buildingDamage,
    series: [
      { type: 'bar', xKey: 'settlement', yKey: 'totalAssessed', yName: 'Buildings assessed' },
      { type: 'bar', xKey: 'settlement', yKey: 'affected', yName: 'Affected' },
    ],
    axes: [{ type: 'category', position: 'bottom' }, { type: 'number', position: 'left' }],
    legend: { enabled: true, position: 'bottom' },
  };

  function exportGap() {
    grid.current?.api.exportDataAsCsv({
      fileName: 'resurgence-funding-gap-sandbox.csv',
      processCellCallback: (c) => (typeof c.value === 'string' && /^[=+\-@\t\r]/.test(c.value) ? `'${c.value}` : c.value),
    });
  }

  const gridH = Math.min(440, 56 + Math.max(2, data.gaps.length) * 42);

  return (
    <div className="wrap page an-page">
      <header className="an-head">
        <div>
          <p className="kicker">Admin</p>
          <h1 className="page-title">Funding analytics</h1>
        </div>
        <div className="an-tools">
          <span className="an-chip">Sandbox · test money</span>
          <span className="an-stamp">Updated {stamp}</span>
          <button className="alt" onClick={() => load()} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </header>

      <div className="an-progress">
        <div className="an-bar" role="img" aria-label={`${o.fundingCompletionPct} percent of the priced target raised`}>
          <span style={{ width: `${Math.min(100, o.fundingCompletionPct)}%` }} />
        </div>
        <p>{o.fundingCompletionPct}% of {money(o.totalTarget)} priced · {o.fundedNeeds} of {o.totalNeeds} needs funded · sandbox payments only</p>
      </div>
      {failed && <p className="err" role="alert">Some data could not be refreshed. Showing the last good copy.</p>}

      <div className="an-board">
        {reads.map(([h, b]) => (
          <div key={h} className="an-card an-take s4"><b>{h}</b><p>{b}</p></div>
        ))}

        <div className="an-card an-kpi good s2"><span>Raised</span><strong>{money(o.totalRaised)}</strong><Spark values={cumulative} /></div>
        <div className="an-card an-kpi s2"><span>Of target</span><strong>{o.fundingCompletionPct}%</strong></div>
        <div className="an-card an-kpi warn s2"><span>Still needed</span><strong>{money(stillNeeded)}</strong></div>
        <div className="an-card an-kpi s2"><span>Families listed</span><strong>{o.totalFamilies.toLocaleString()}</strong></div>
        <div className="an-card an-kpi s2"><span>Needs funded</span><strong>{o.fundedNeeds} of {o.totalNeeds}</strong></div>
        <div className="an-card an-kpi s2"><span>Donations</span><strong>{o.totalDonations}</strong></div>

        <div className="an-card s3 o-1">
          <h2>Progress to target</h2>
          <p className="an-sub">Priced needs only</p>
          <Gauge pct={o.fundingCompletionPct} raised={money(o.totalRaised)} target={money(o.totalTarget)} />
        </div>
        <div className="an-card s6 o-3">
          <h2>Money in, by day</h2>
          <p className="an-sub">Captured sandbox payments, last 14 days with activity</p>
          {data.days.length ? <div className="an-chart"><AgCharts options={dayOpt} /></div> : <Empty text="No donations yet. Bars appear after the first sandbox payment." />}
        </div>
        <div className="an-card s3 o-2">
          <h2>Relief pipeline</h2>
          <p className="an-sub">Needs that reached each stage</p>
          {o.totalNeeds ? <div className="an-chart"><AgCharts options={pipelineOpt} /></div> : <Empty text="No needs yet." />}
          <p className="an-sub an-after">{pipelineNote}</p>
        </div>

        <div className="an-card s4">
          <h2>Needs by urgency</h2>
          <p className="an-sub">As set by coordinators</p>
          {o.totalNeeds ? <div className="an-chart"><AgCharts options={urgencyOpt} /></div> : <Empty text="No needs yet." />}
        </div>
        <div className="an-card s4">
          <h2>Families by location</h2>
          <p className="an-sub">Where need is clustered</p>
          {data.locations.length ? <div className="an-chart"><AgCharts options={locationOpt} /></div> : <Empty text="No needs yet." />}
        </div>
        <div className="an-card s4">
          <h2>Verification activity</h2>
          <p className="an-sub">Audit events actually recorded</p>
          {data.verification.length ? <div className="an-chart"><AgCharts options={verifOpt} /></div> : <Empty text="No events yet." />}
        </div>

        <div className="an-card s12">
          <div className="an-card-head">
            <div>
              <h2>Funding gap by need</h2>
              <p className="an-sub">Priced needs only, largest gap first.</p>
            </div>
            <button className="alt" onClick={exportGap}>Export CSV</button>
          </div>
          <div className="ag-theme-quartz" style={{ height: gridH }}>
            <AgGridReact<Gap> ref={grid} rowData={data.gaps} suppressMovableColumns columnDefs={cols} defaultColDef={{ sortable: true }} overlayNoRowsTemplate="No priced needs yet." />
          </div>
        </div>

        {disaster && casualtyOpt && buildingOpt && (
          <>
            <div className="an-event s12">
              <p className="kicker">Event context</p>
              <h2 id="an-disaster">{disaster.name}</h2>
              <dl className="an-facts">
                <div><dt>Trigger</dt><dd>{disaster.triggerType}</dd></div>
                {disaster.glacierName && <div><dt>Source</dt><dd>{disaster.glacierName}</dd></div>}
                {disaster.waveHeightM != null && <div><dt>Wave height (est.)</dt><dd>{disaster.waveHeightM} m</dd></div>}
                <div><dt>Local rainfall</dt><dd>{disaster.priorRainfallReported ? 'Reported' : 'None reported'}</dd></div>
                {disaster.previousGLOF && <div><dt>Previous event</dt><dd>{disaster.previousGLOF}</dd></div>}
              </dl>
            </div>
            <div className="an-card s7">
              <h2>Casualty progression</h2>
              <p className="an-sub">Dated snapshots, not final totals. A missing bar means not reported that date. Source: {disaster.casualtySnapshots[0]?.source}.</p>
              <div className="an-chart tall"><AgCharts options={casualtyOpt} /></div>
            </div>
            <div className="an-card s5">
              <h2>Building damage</h2>
              <p className="an-sub">Satellite assessment per settlement. Source: {disaster.buildingDamage[0]?.source}.</p>
              <div className="an-chart tall"><AgCharts options={buildingOpt} /></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
