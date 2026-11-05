'use client';

import './story.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, ValueFormatterParams } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

type Contribution = {
  id: string; contributor: string; type: string; scope: string;
  amountLabel: string; nprMillion: number; nprArba: number | null; notes: string | null;
};
type Snapshot = { id: string; daysAfterEvent: number; nprBillion: number };

// ── THEME ────────────────────────────────────────────────────────────────
function useTheme() {
  const [dark, setDark] = useState(true);
  const toggle = useCallback(() => setDark(d => !d), []);
  useEffect(() => {
    document.documentElement.setAttribute('data-story-theme', dark ? 'dark' : 'light');
    return () => { document.documentElement.removeAttribute('data-story-theme'); };
  }, [dark]);
  return { dark, toggle };
}

// ── REVEAL ───────────────────────────────────────────────────────────────
function useReveal() {
  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('s-visible'); obs.unobserve(e.target); } }),
      { threshold: 0.07 }
    );
    document.querySelectorAll('.s-reveal').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);
}

// ── CHARTS ───────────────────────────────────────────────────────────────
type ChartRefs = {
  inflowRef: React.RefObject<HTMLCanvasElement>;
  donutRef:  React.RefObject<HTMLCanvasElement>;
  sectorRef: React.RefObject<HTMLCanvasElement>;
  casualtyRef: React.RefObject<HTMLCanvasElement>;
  buildingRef: React.RefObject<HTMLCanvasElement>;
};

function useCharts(snapshots: Snapshot[], dark: boolean): ChartRefs {
  const inflowRef   = useRef<HTMLCanvasElement>(null);
  const donutRef    = useRef<HTMLCanvasElement>(null);
  const sectorRef   = useRef<HTMLCanvasElement>(null);
  const casualtyRef = useRef<HTMLCanvasElement>(null);
  const buildingRef = useRef<HTMLCanvasElement>(null);
  const instances   = useRef<unknown[]>([]);

  useEffect(() => {
    import('chart.js/auto').then(({ Chart }) => {
      instances.current.forEach((c: unknown) => (c as { destroy(): void })?.destroy?.());
      instances.current = [];

      const amber  = '#e8a020';
      const warm   = '#d4845a';
      const green  = '#6fcf7a';
      const dim    = dark ? '#6e8fa3' : '#4b6070';
      const grid   = dark ? 'rgba(197,216,230,0.07)' : 'rgba(0,0,0,0.07)';
      Chart.defaults.color      = dim;
      Chart.defaults.borderColor = grid;
      Chart.defaults.font.family = "'Inter', system-ui, sans-serif";

      // 1. Inflow line
      if (inflowRef.current) instances.current.push(new Chart(inflowRef.current, {
        type: 'line',
        data: {
          labels: snapshots.map(s => `Day ${s.daysAfterEvent}`),
          datasets: [{ label: 'Cumulative (रू Billion)', data: snapshots.map(s => s.nprBillion),
            borderColor: amber, backgroundColor: 'rgba(232,160,32,0.08)', fill: true,
            tension: 0.4, pointBackgroundColor: amber, pointRadius: 4, borderWidth: 2 }],
        },
        options: { responsive: true, plugins: { legend: { display: false } },
          scales: { x: { grid: { color: grid }, ticks: { font: { size: 11 } } },
            y: { grid: { color: grid }, ticks: { callback: v => `रू ${v}B`, font: { size: 11 } } } } },
      }));

      // 2. Donut — fund allocation
      if (donutRef.current) instances.current.push(new Chart(donutRef.current, {
        type: 'doughnut',
        data: {
          labels: ['NPR accounts (रू 11.14B)', 'USD accounts (~रू 3.3B)', 'Released (रू 1B)'],
          datasets: [{ data: [11.14, 3.3, 1],
            backgroundColor: ['rgba(232,160,32,0.75)', 'rgba(197,216,230,0.22)', 'rgba(111,207,122,0.6)'],
            borderColor: [amber, 'transparent', green], borderWidth: 1 }],
        },
        options: { responsive: true, cutout: '62%',
          plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 12, boxWidth: 10 } } } },
      }));

      // 3. Sector horizontal bar
      if (sectorRef.current) instances.current.push(new Chart(sectorRef.current, {
        type: 'bar',
        data: {
          labels: ['Digital giving', 'Corporate', 'Banking', 'Civil society', 'Telecom', 'Trade'],
          datasets: [{ label: 'NPR Million', data: [1960, 195, 137.2, 14.1, 10, 6.43],
            backgroundColor: ['rgba(232,160,32,0.75)','rgba(212,132,90,0.6)','rgba(197,216,230,0.3)',
              'rgba(197,216,230,0.2)','rgba(197,216,230,0.15)','rgba(197,216,230,0.12)'],
            borderWidth: 0, borderRadius: 2 }],
        },
        options: { responsive: true, indexAxis: 'y' as const,
          plugins: { legend: { display: false } },
          scales: { x: { grid: { color: grid }, ticks: { callback: v => Number(v) >= 1000 ? `${Number(v)/1000}B` : `${v}M`, font: { size: 10 } } },
            y: { grid: { display: false }, ticks: { font: { size: 10 }, color: dim } } } },
      }));

      // 4. Casualty progression — 3 snapshots
      if (casualtyRef.current) instances.current.push(new Chart(casualtyRef.current, {
        type: 'bar',
        data: {
          labels: ['29 Aug', '10 Sep', '20 Sep'],
          datasets: [
            { label: 'Bodies recovered', data: [626, 1377, 1451], backgroundColor: 'rgba(212,132,90,0.75)', borderRadius: 2, borderWidth: 0 },
            { label: 'Missing', data: [2400, 5130, 5786], backgroundColor: 'rgba(232,160,32,0.6)', borderRadius: 2, borderWidth: 0 },
            { label: 'Treated / rescued', data: [4450, 13656, 10178], backgroundColor: 'rgba(197,216,230,0.25)', borderRadius: 2, borderWidth: 0 },
          ],
        },
        options: { responsive: true,
          plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 12, boxWidth: 10 } } },
          scales: { x: { grid: { display: false } }, y: { grid: { color: grid }, ticks: { font: { size: 10 } } } } },
      }));

      // 5. Building damage — Copernicus data
      if (buildingRef.current) instances.current.push(new Chart(buildingRef.current, {
        type: 'bar',
        data: {
          labels: ['Syabrubesi', 'Timure'],
          datasets: [
            { label: 'Affected', data: [433, 431], backgroundColor: 'rgba(212,132,90,0.75)', borderRadius: 2, borderWidth: 0 },
            { label: 'Total assessed', data: [559, 441], backgroundColor: 'rgba(197,216,230,0.15)', borderRadius: 2, borderWidth: 0 },
          ],
        },
        options: { responsive: true,
          plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 12, boxWidth: 10 } },
            title: { display: true, text: 'Copernicus EMS satellite assessment', font: { size: 10 }, color: dim, padding: { bottom: 8 } } },
          scales: { x: { grid: { display: false } }, y: { grid: { color: grid }, ticks: { font: { size: 10 } } } } },
      }));
    });
  }, [snapshots, dark]);

  return { inflowRef, donutRef, sectorRef, casualtyRef, buildingRef };
}

// ── AG GRID ───────────────────────────────────────────────────────────────
const intlCols: ColDef[] = [
  { field: 'contributor', headerName: 'Contributor / Organization', flex: 2, sortable: true, filter: true },
  { field: 'type',        headerName: 'Type',    flex: 1, sortable: true, filter: true },
  { field: 'amountLabel', headerName: 'Amount',  flex: 1, cellStyle: { fontWeight: '500' } },
  { field: 'nprArba',     headerName: 'रू Arba', flex: 1, sortable: true,
    valueFormatter: (p: ValueFormatterParams) => p.value ? `रू ${p.value}` : '—',
    cellStyle: { color: '#e8a020', fontVariantNumeric: 'tabular-nums' } },
];
const natCols: ColDef[] = [
  { field: 'contributor', headerName: 'Contributor', flex: 2, sortable: true, filter: true },
  { field: 'type',        headerName: 'Sector', flex: 1, sortable: true, filter: true },
  { field: 'amountLabel', headerName: 'Amount', flex: 1, cellStyle: { fontWeight: '500' } },
  { field: 'nprMillion',  headerName: 'NPR (M)', flex: 1, sortable: true,
    valueFormatter: (p: ValueFormatterParams) => `रू ${p.value}M`,
    cellStyle: { color: '#e8a020', fontVariantNumeric: 'tabular-nums' } },
  { field: 'notes', headerName: 'Notes', flex: 1,
    valueFormatter: (p: ValueFormatterParams) => p.value ?? '',
    cellStyle: { fontSize: '0.78rem', color: '#6e8fa3' } },
];

// ── TABS ─────────────────────────────────────────────────────────────────
const TABS = ['Timeline', 'Contributors', 'Impact', 'Fund status'] as const;
type Tab = typeof TABS[number];

// ── COMPONENT ─────────────────────────────────────────────────────────────
export function StoryClient({ contributions, snapshots }: {
  contributions: Contribution[];
  snapshots: Snapshot[];
}) {
  const { dark, toggle } = useTheme();
  useReveal();

  const [activeTab, setActiveTab] = useState<Tab>('Timeline');
  const intlData = contributions.filter(c => c.scope === 'international');
  const natData  = contributions.filter(c => c.scope === 'national');
  const { inflowRef, donutRef, sectorRef, casualtyRef, buildingRef } = useCharts(snapshots, dark);

  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!barRef.current) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && barRef.current) {
        setTimeout(() => { if (barRef.current) barRef.current.style.width = '7%'; }, 400);
        obs.disconnect();
      }
    }, { threshold: 0.5 });
    obs.observe(barRef.current);
    return () => obs.disconnect();
  }, []);

  const gridTheme = dark ? 'ag-theme-quartz-dark' : 'ag-theme-quartz';

  return (
    <div className="story-root">

      {/* THEME TOGGLE */}
      <button className="theme-toggle" onClick={toggle} aria-label={dark ? 'Light mode' : 'Dark mode'}>
        {dark ? '☀︎' : '☽'}
      </button>

      {/* HERO */}
      <section className="s-hero">
        <div className="s-hero-river" aria-hidden />
        <div className="s-hero-overlay" aria-hidden />
        <div className="s-hero-content">
          <p className="s-dateline">Rasuwa District, Nepal · 26 August 2026</p>
          <h1>The river arrived<br /><em>before anyone could run.</em></h1>
          <p className="s-sub">
            At 8:40 on the morning of August 26, 2026, a glacial lake
            high in the Himalayas collapsed — and the Bhotekoshi River
            swallowed everything below. What happened next, and what didn't,
            is why this platform exists.
          </p>
          <div className="s-scroll-cue" aria-hidden>
            <svg width="14" height="20" viewBox="0 0 14 20" fill="none">
              <path d="M7 3v14M1 11l6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Read the story
          </div>
        </div>
      </section>

      {/* CH 1 — THE EVENT */}
      <section className="s-chapter s-reveal">
        <div className="s-inner">
          <p className="s-label">The event</p>
          <h2>A glacial lake. A collapse. A wave 10 metres high.</h2>
          <p>
            The Himalayas hold thousands of glacial lakes — bodies of meltwater
            dammed behind unstable moraines of ice and rock. As the planet warms,
            these lakes grow. When their walls give way, the result is a
            Glacial Lake Outburst Flood: a GLOF.
          </p>
          <p>
            On August 26, an approximately <strong>1 km² slope section</strong> collapsed
            into the upper Lhende Khola watershed on the Nepal-Tibet border —
            generating a debris-laden flood wave that reached the Rasuwagadhi
            checkpoint at an estimated <strong>8 to 10 metres high</strong>.
            Syabrubesi — the trailhead town for the Langtang Valley Trek —
            was swallowed within the hour. 433 of its 559 assessed buildings
            were damaged or destroyed. In Timure, the customs town upstream,
            431 of 441 buildings were affected.
          </p>
          <p>
            Crucially, <strong>no heavy rainfall was reported</strong> at the source area.
            The flood came not from the monsoon — but from the mountains themselves,
            accelerated by decades of glacial retreat. This was the second time
            the same watershed had done this in 13 months.
          </p>
          <div className="s-stat-row">
            {[
              { n: '1,451', label: 'Bodies recovered (20 Sep snapshot)', warm: true },
              { n: '5,786', label: 'People missing (20 Sep snapshot)', amber: true },
              { n: '10,178', label: 'Injured or treated' },
              { n: '90,000+', label: 'People affected across 7 districts' },
            ].map(({ n, label, amber, warm }) => (
              <div key={n} className="s-stat-cell">
                <span className={`s-num${amber ? ' s-amber' : warm ? ' s-warm' : ''}`}>{n}</span>
                <span className="s-stat-label">{label}</span>
              </div>
            ))}
          </div>
          <p className="s-caveat">
            Figures are dated response snapshots, not final confirmed totals.
            Numbers continued to evolve as search operations progressed.
          </p>
        </div>
      </section>

      {/* CH 2 — THE ROUTES */}
      <section className="s-chapter s-alt s-reveal">
        <div className="s-inner">
          <p className="s-label">Langtang &amp; Gosaikunda</p>
          <h2>It wasn't only Nepali families.<br />It was everyone's families.</h2>
          <div className="s-route-row">
            {['🏔️ Langtang Valley Trek', '🏞️ Gosaikunda Pilgrimage Route', '🛤️ Kailash overland gateway'].map(r => (
              <span key={r} className="s-route-pill">{r}</span>
            ))}
          </div>
          <p>
            The <strong>Langtang Valley Trek</strong> draws thousands of trekkers each year.
            Its guesthouses were full that Tuesday night. The <strong>Gosaikunda route</strong> —
            a sacred alpine lake at 4,380 metres — was equally alive with Hindu and
            Buddhist pilgrims during Janai Purnima season. Many were elderly, travelling
            in family groups. The route has few escape points once a flood enters the valley.
          </p>
          <blockquote className="s-pull">
            <p>"384 tourists reported missing. 291 of them foreign nationals — from Australia, the United States, Britain, Malaysia, South Korea."</p>
          </blockquote>
          <p>
            <strong>21,146 security personnel</strong> were deployed. Military helicopters
            searched the access tunnels of the Langtang Khola Hydropower Project —
            60 construction workers had been inside when the flood struck.
            In Kathmandu and in cities across five continents, families were
            waiting by phones, refreshing pages that weren't updated.
          </p>
        </div>
      </section>

      {/* CH 3 — THE MONEY + TABS */}
      <section className="s-chapter s-dark s-reveal" id="the-money">
        <div className="s-inner">
          <p className="s-label">The response</p>
          <h2>The world gave. Fast. Generously.<br />And then it waited.</h2>
          <p>
            Within 36 hours, <strong>रू 1.91 Billion</strong> had been deposited
            into the Prime Minister's Disaster Relief Fund. Within two weeks,
            the total exceeded <strong>रू 11.95 Billion</strong>. International pledges
            pushed it above <strong>रू 14 Arba (~USD 66 million)</strong>.
          </p>

          {/* TABS */}
          <div className="s-tabs-wrap s-reveal">
            <div className="s-tabs" role="tablist">
              {TABS.map(tab => (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={activeTab === tab}
                  className={`s-tab${activeTab === tab ? ' s-tab-active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* TIMELINE */}
            <div role="tabpanel" hidden={activeTab !== 'Timeline'} className="s-tab-panel">
              <p className="s-chart-label">Contribution inflow — first 30 days (रू Billion)</p>
              <div className="s-chart-full"><canvas ref={inflowRef} height={200} /></div>
              <div className="s-charts-grid">
                <div className="s-chart-card">
                  <p className="s-chart-label">Casualty progression — dated snapshots</p>
                  <canvas ref={casualtyRef} height={220} />
                </div>
                <div className="s-chart-card">
                  <p className="s-chart-label">Building damage — Copernicus EMS</p>
                  <canvas ref={buildingRef} height={220} />
                </div>
              </div>
            </div>

            {/* CONTRIBUTORS */}
            <div role="tabpanel" hidden={activeTab !== 'Contributors'} className="s-tab-panel">
              <div className="s-grid-wrap">
                <p className="s-grid-label">International contributions &amp; pledges</p>
                <div className={gridTheme} style={{ height: 280 }}>
                  <AgGridReact columnDefs={intlCols} rowData={intlData}
                    defaultColDef={{ resizable: true }} suppressCellFocus />
                </div>
              </div>
              <div className="s-grid-wrap">
                <p className="s-grid-label">National &amp; corporate contributions</p>
                <div className={gridTheme} style={{ height: 360 }}>
                  <AgGridReact columnDefs={natCols} rowData={natData}
                    defaultColDef={{ resizable: true }} suppressCellFocus />
                </div>
              </div>
            </div>

            {/* IMPACT */}
            <div role="tabpanel" hidden={activeTab !== 'Impact'} className="s-tab-panel">
              <div className="s-charts-grid">
                <div className="s-chart-card">
                  <p className="s-chart-label">Sector contributions breakdown</p>
                  <canvas ref={sectorRef} height={260} />
                </div>
                <div className="s-chart-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <p className="s-chart-label">Infrastructure impact</p>
                  {[
                    { label: 'Syabrubesi buildings affected', pct: Math.round(433/559*100) },
                    { label: 'Timure buildings affected',     pct: Math.round(431/441*100) },
                    { label: 'Mass movement area mapped',     pct: 100, note: '237 ha across 2 settlements' },
                    { label: 'Pasang Lhamu Highway',         pct: 100, note: 'Cut at multiple points' },
                  ].map(({ label, pct, note }) => (
                    <div key={label}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.78rem', marginBottom:'0.3rem' }}>
                        <span style={{ color:'var(--s-mist)' }}>{label}</span>
                        <span style={{ color:'var(--s-amber)', fontWeight:600 }}>{note ?? `${pct}%`}</span>
                      </div>
                      <div className="s-bar-track">
                        <div className="s-bar-fill" style={{ width:`${pct}%`, transition:'width 0.8s ease', background: pct > 90 ? '#d4845a' : '#e8a020' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* FUND STATUS */}
            <div role="tabpanel" hidden={activeTab !== 'Fund status'} className="s-tab-panel">
              <div className="s-charts-grid">
                <div className="s-chart-card">
                  <p className="s-chart-label">Fund allocation breakdown</p>
                  <canvas ref={donutRef} height={240} />
                </div>
                <div className="s-chart-card">
                  <p className="s-chart-label">Release status</p>
                  <div style={{ padding:'1rem 0' }}>
                    {[
                      { label: 'Total collected',       val: 'रू 14+ Arba', pct: 100,  color: 'rgba(197,216,230,0.2)' },
                      { label: 'NPR accounts (9 banks)',val: 'रू 11.14B',   pct: 79.6, color: '#e8a020' },
                      { label: 'USD accounts',          val: '~रू 3.3B',    pct: 23.6, color: 'rgba(197,216,230,0.35)' },
                      { label: 'Released to NDRRMA',    val: 'रू 1B',       pct: 7.1,  color: '#6fcf7a' },
                    ].map(({ label, val, pct, color }) => (
                      <div key={label} style={{ marginBottom:'1.2rem' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.8rem', marginBottom:'0.35rem' }}>
                          <span style={{ color:'var(--s-mist)' }}>{label}</span>
                          <span style={{ color:'var(--s-text)', fontWeight:600 }}>{val}</span>
                        </div>
                        <div className="s-bar-track">
                          <div className="s-bar-fill" ref={label === 'Released to NDRRMA' ? barRef : undefined}
                            style={{ width:`${pct}%`, background: color, transition:'width 1.2s ease' }} />
                        </div>
                      </div>
                    ))}
                    <p className="s-bar-note" style={{ marginTop:'1.5rem' }}>
                      रू 11.14B in NPR accounts · USD 24.47M in foreign currency accounts · as of late 2026
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CH 4 — THE GAP */}
      <section className="s-chapter s-reveal">
        <div className="s-inner">
          <p className="s-label">The gap</p>
          <h2>Billions collected.<br />Families still waiting.</h2>
          <p>
            The funds are real. The need is real. The distance between them is bureaucracy.
            After the 2015 Gorkha earthquake — 8,896 dead, NPR 706 billion in losses —
            reconstruction funds were delayed for years. The same pattern is repeating.
          </p>
          <div className="s-locked-box s-reveal">
            <p>
              <strong>The problem isn't generosity.</strong> More than 800,000 Nepalis
              donated via QR code. Pilgrims coming down from Gosaikunda gave at checkpoints.
              Trekkers abroad sent funds from their phones. The money arrived.
              But relief funds, once collected, disappear into accounts with no public trail.
              Families in Rasuwa cannot see whether a donation made in their name is
              still sitting in a bank, has been disbursed, or what it bought.
            </p>
          </div>
        </div>
      </section>

      {/* CH 5 — PLATFORM */}
      <section className="s-chapter s-alt s-reveal">
        <div className="s-inner">
          <p className="s-label">The response — this platform</p>
          <h2>What if every rupee had a proof trail?</h2>
          <p>
            Resurgence is a public relief ledger. A coordinator posts a need.
            Real products are priced from live suppliers. A donor pays.
            Proof closes the loop — purchased, delivered, verified.
            Nothing is marked done until someone records evidence.
            Anything unverified says so, clearly, in public.
          </p>
          <div className="s-stat-row">
            {[
              { n: '4',    label: 'Steps from request to verified delivery', amber: true },
              { n: 'Open', label: 'Every need readable without an account' },
              { n: 'Live', label: 'Needs update as funds arrive', warm: true },
            ].map(({ n, label, amber, warm }) => (
              <div key={n} className="s-stat-cell">
                <span className={`s-num${amber ? ' s-amber' : warm ? ' s-warm' : ''}`}>{n}</span>
                <span className="s-stat-label">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="s-cta s-reveal">
        <div className="s-cta-inner">
          <div>
            <h2>Follow the relief,<br />need by need.</h2>
            <p>Browse active needs, read proof trails, and see where every contribution stands.</p>
          </div>
          <div className="s-cta-btns">
            <a href="/needs"     className="s-btn-primary">Browse needs</a>
            <a href="/donations" className="s-btn-outline">Donation ledger</a>
            <a href="/"          className="s-btn-ghost">Back to dashboard</a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="s-footer">
        <p>Data: NDRRMA, OPMCM, Copernicus EMS, Nepal MoFA. Figures as of late 2026.</p>
        <div className="s-sponsor-row">
          <span className="s-sponsor-label">Built with</span>
          <span className="s-sponsor-badge">AG Grid</span>
          <span className="s-sponsor-badge">Bryntum</span>
          <span className="s-sponsor-badge">Channel3</span>
        </div>
      </footer>
    </div>
  );
}
