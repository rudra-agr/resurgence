'use client';
import './story.css';
/* resurgence-patch: unified-theme */


import { useEffect, useRef } from 'react';
import { useThemeMode } from '@/lib/theme';
import { NPR_PER_USD, usd } from '@/lib/fx';
/* resurgence-patch: usd-charts */
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, ValueFormatterParams } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

type Contribution = {
  id: string; contributor: string; type: string; scope: string;
  amountLabel: string; nprMillion: number; nprArba: number | null; notes: string | null;
};
type Snapshot = { id: string; daysAfterEvent: number; nprBillion: number };


function useReveal() {
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('s-visible'); obs.unobserve(e.target); } }),
      { threshold: 0.08 }
    );
    document.querySelectorAll('.s-reveal').forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);
}

// The story page has no toggle of its own: it follows the site-wide one
// (data-theme on <html>, set by the header button in SiteChrome).
function useTheme() {
  const { mode } = useThemeMode();
  return { dark: mode === 'dark' };
}


// Chart figures are kept in rupees; they are drawn in USD (NPR_PER_USD in lib/fx.ts)
// and every label/tooltip shows the rupee amount in brackets.
const usdMillion = (nprMillion: number) => nprMillion / NPR_PER_USD;
const FUND = [
  { name: 'NPR accounts',        billion: 11.14 },
  { name: 'USD accounts (est.)', billion: 3.3 },
  { name: 'Released to NDRRMA',  billion: 1 },
];
const SECTORS: [string, number][] = [
  ['Digital giving', 1960], ['Corporate', 195], ['Banking', 137.2],
  ['Civil society', 14.1], ['Telecom', 10], ['Trade', 6.43], ['Other', 3],
];
const axisUsd = (v: number | string) => {
  const n = Number(v);
  return n >= 1000 ? `$${n / 1000}B` : n >= 1 ? `$${Number(n.toFixed(1))}M` : `$${Math.round(n * 1000)}K`;
};

function useCharts(snapshots: Snapshot[], dark: boolean) {
  const inflowRef  = useRef<HTMLCanvasElement>(null);
  const donutRef   = useRef<HTMLCanvasElement>(null);
  const sectorRef  = useRef<HTMLCanvasElement>(null);
  const inflowInst = useRef<unknown>(null);
  const donutInst  = useRef<unknown>(null);
  const sectorInst = useRef<unknown>(null);

  useEffect(() => {
    
    import('chart.js/auto').then(({ Chart }) => {
      const text   = dark ? '#6e8fa3' : '#4b6070';
      const grid   = dark ? 'rgba(197,216,230,0.07)' : 'rgba(0,0,0,0.07)';
      const amber  = '#e8a020';
      const warm   = '#d4845a';
      const mistLo = dark ? 'rgba(197,216,230,0.22)' : 'rgba(0,60,100,0.12)';

      Chart.defaults.color         = text;
      Chart.defaults.borderColor   = grid;
      Chart.defaults.font.family   = "'Inter', system-ui, sans-serif";

  
      (inflowInst.current as { destroy?: () => void })?.destroy?.();
      (donutInst.current  as { destroy?: () => void })?.destroy?.();
      (sectorInst.current as { destroy?: () => void })?.destroy?.();

    
      if (inflowRef.current) {
        inflowInst.current = new Chart(inflowRef.current, {
          type: 'line',
          data: {
            labels: snapshots.map((s) => `Day ${s.daysAfterEvent}`),
            datasets: [{
              label: 'Cumulative (USD million)',
              data: snapshots.map((s) => usdMillion(s.nprBillion * 1000)),
              borderColor: amber, backgroundColor: 'rgba(232,160,32,0.08)',
              fill: true, tension: 0.4, pointBackgroundColor: amber,
              pointRadius: 4, borderWidth: 2,
            }],
          },
          options: {
            responsive: true,
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (c) => ` ${money(snapshots[c.dataIndex].nprBillion * 1000)}` } },
            },
            scales: {
              x: { grid: { color: grid }, ticks: { font: { size: 11 } } },
              y: { grid: { color: grid }, ticks: { callback: (v) => axisUsd(v), font: { size: 11 } } },
            },
          },
        });
      }


      if (donutRef.current) {
        donutInst.current = new Chart(donutRef.current, {
          type: 'doughnut',
          data: {
            labels: FUND.map((f) => `${f.name} — ${money(f.billion * 1000)}`),
            datasets: [{
              data: FUND.map((f) => usdMillion(f.billion * 1000)),
              backgroundColor: ['rgba(232,160,32,0.75)', mistLo, 'rgba(212,132,90,0.6)'],
              borderColor: [amber, 'transparent', warm],
              borderWidth: 1,
            }],
          },
          options: {
            responsive: true, cutout: '62%',
            plugins: {
              legend: {
                position: 'bottom',
                labels: { font: { size: 10 }, padding: 12, boxWidth: 10 },
              },
              tooltip: { callbacks: { label: (c) => ` ${money(FUND[c.dataIndex].billion * 1000)}` } },
            },
          },
        });
      }

      if (sectorRef.current) {
        sectorInst.current = new Chart(sectorRef.current, {
          type: 'bar',
          data: {
            labels: SECTORS.map(([name]) => name),
            datasets: [{
              label: 'USD million',
              data: SECTORS.map(([, m]) => usdMillion(m)),
              backgroundColor: [
                'rgba(232,160,32,0.75)', 'rgba(212,132,90,0.6)',
                'rgba(197,216,230,0.3)', 'rgba(197,216,230,0.2)',
                'rgba(197,216,230,0.15)', 'rgba(197,216,230,0.12)', 'rgba(197,216,230,0.08)',
              ],
              borderWidth: 0, borderRadius: 2,
            }],
          },
          options: {
            responsive: true, indexAxis: 'y' as const,
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (c) => ` ${money(SECTORS[c.dataIndex][1])}` } },
            },
            scales: {
              x: {
                grid: { color: grid },
                ticks: { callback: (v) => axisUsd(v), font: { size: 10 } },
              },
              y: { grid: { display: false }, ticks: { font: { size: 10 }, color: text } },
            },
          },
        });
      }
    });
  }, [snapshots, dark]);

  return { inflowRef, donutRef, sectorRef };
}

// ── Money: dollar first, rupee in brackets ──────────────────────────────
// Every figure is stored in NPR millions; usd() in lib/fx.ts converts at one
// shared rate (NPR_PER_USD), so changing it there updates the whole page.
const trim2 = (n: number) => String(Number(n.toFixed(2)));
const nprText = (million: number) =>
  million >= 1000 ? `रू ${trim2(million / 1000)} Arba` : `रू ${trim2(million)} Million`;
const money = (million: number | null | undefined) =>
  million == null ? '—' : `${usd(million * 1e6)} (${nprText(million)})`;

// Colours are theme variables, so they follow the light/dark switch.
const amountStyle = { color: 'var(--s-amber)', fontWeight: '500', fontVariantNumeric: 'tabular-nums' };

const intlCols: ColDef[] = [
  { field: 'contributor', headerName: 'Contributor / Organization', flex: 2, minWidth: 230 },
  { field: 'type',        headerName: 'Type', flex: 1, minWidth: 120 },
  { field: 'nprMillion',  headerName: 'Amount — USD (रू)', flex: 1.6, minWidth: 210,
    valueFormatter: (p: ValueFormatterParams) => money(p.value),
    cellStyle: amountStyle },
  { field: 'amountLabel', headerName: 'As pledged', flex: 1.2, minWidth: 160,
    cellStyle: { color: 'var(--s-dim)', fontSize: '0.82rem' } },
];

const natCols: ColDef[] = [
  { field: 'contributor', headerName: 'Contributor', flex: 2, minWidth: 230 },
  { field: 'type',        headerName: 'Sector', flex: 1, minWidth: 120 },
  { field: 'nprMillion',  headerName: 'Amount — USD (रू)', flex: 1.6, minWidth: 210,
    valueFormatter: (p: ValueFormatterParams) => money(p.value),
    cellStyle: amountStyle },
  { field: 'notes',       headerName: 'Notes', flex: 1.6, minWidth: 200, sortable: false,
    cellStyle: { color: 'var(--s-dim)', fontSize: '0.8rem' },
    valueFormatter: (p: ValueFormatterParams) => p.value ?? '' },
];

// One shared, locked-down configuration for both tables.
const defaultColDef: ColDef = {
  sortable: true,
  resizable: false,
  suppressMovable: true,
  filter: false,
  suppressHeaderMenuButton: true,
};

export function StoryClient({ contributions, snapshots }: {
  contributions: Contribution[];
  snapshots: Snapshot[];
}) {
  const { dark } = useTheme();
  useReveal();

  const intlData = contributions.filter((c) => c.scope === 'international');
  const natData  = contributions.filter((c) => c.scope === 'national');

  const { inflowRef, donutRef, sectorRef } = useCharts(snapshots, dark);

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

      {/* ── HERO ── */}
      <section className="s-hero">
        <div className="s-hero-river" aria-hidden />
        <div className="s-hero-overlay" aria-hidden />
        <div className="s-hero-content">
          <p className="s-dateline">Rasuwa District, Nepal</p>
          <h1>
            The river arrived<br />
            <em>before anyone could run.</em>
          </h1>
          <p className="s-sub">
            At 8:40 on the morning of August 26, 2026, the Bhotekoshi River
            swallowed Syabrubesi. What happened next — and what didn&apos;t —
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

      {/* ── CHAPTER 1: THE EVENT ── */}
      <section className="s-chapter s-reveal">
        <div className="s-inner">
          <p className="s-label">The event</p>
          <h2>A rock-ice avalanche the size of a small town</h2>
          <p>
            In the early hours of that Wednesday morning, a massive rock-ice avalanche
            collapsed into a glacial lake high in the Lhende valley —
            a transboundary tributary along the Nepal-China border.
            The flood pulse reached China&apos;s Gyirong Port in minutes,
            then tore down the Bhotekoshi-Trishuli corridor into Nepal.
          </p>
          <p>
            The wave struck the Rasuwagadhi checkpoint at an estimated{' '}
            <strong>8 to 10 metres high</strong>. Syabrubesi — the trailhead town
            for the Langtang Valley Trek — was swallowed within the hour.
            Both sides of the river. Gone.
          </p>
          <p>
            This was the second time the same watershed had done this. A nearly
            identical GLOF had struck just 13 months earlier, on July 8, 2025.
          </p>
          <div className="s-stat-row">
            {[
              { n: '903+',   label: 'Confirmed dead across Nepal and Tibet' },
              { n: '4,200+', label: 'People reported missing', amber: true },
              { n: '9,000+', label: 'Successfully rescued' },
              { n: '90,000', label: 'People affected across 7 districts', warm: true },
            ].map(({ n, label, amber, warm }) => (
              <div key={n} className="s-stat-cell">
                <span className={`s-num${amber ? ' s-amber' : warm ? ' s-warm' : ''}`}>{n}</span>
                <span className="s-stat-label">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CHAPTER 2: THE ROUTES ── */}
      <section className="s-chapter s-alt s-reveal">
        <div className="s-inner">
          <p className="s-label">Langtang &amp; Gosaikunda</p>
          <h2>It wasn&apos;t only Nepali families.<br />It was everyone&apos;s families.</h2>
          <p>
            The Rasuwa district is home to two of Nepal&apos;s most beloved mountain
            journeys — and both were in full season on August 26.
          </p>
          <div className="s-route-row">
            {['🏔️ Langtang Valley Trek', '🏞️ Gosaikunda Lake Route', '🛤️ Kailash overland gateway'].map((r) => (
              <span key={r} className="s-route-pill">{r}</span>
            ))}
          </div>
          <p>
            The <strong>Langtang Valley Trek</strong> draws thousands of trekkers each year —
            close to Kathmandu, high enough for glaciers, quiet enough to feel remote.
            Its guesthouses were full that Tuesday night, with hikers from across the world
            resting before early starts.
          </p>
          <p>
            Above Langtang, the <strong>Gosaikunda route</strong> was equally alive.
            Gosaikunda — a sacred alpine lake at 4,380 metres — is a destination for
            Hindu and Buddhist pilgrims, particularly during Janai Purnima season, which
            falls in August. Pilgrims from across Nepal and India were on that trail.
            Many were elderly. Many were travelling in family groups. The route has
            few escape points once a flood enters the valley.
          </p>
          <p>
            The same corridor also served as the overland gateway for Indian pilgrims
            travelling to Mount Kailash in Tibet, and for cross-border traders
            who had rebuilt their lives after the 2015 earthquake.
          </p>
          <blockquote className="s-pull">
            <p>
              &ldquo;384 tourists reported missing. 291 of them foreign nationals —
              from Australia, the United States, Britain, Malaysia, South Korea.&rdquo;
            </p>
          </blockquote>
          <p>
            <strong>21,146 security personnel</strong> were eventually deployed.
            Military helicopters searched the access tunnels of the Langtang Khola
            Hydropower Project — 60 construction workers had been inside when the flood struck.
            The Pasang Lhamu Highway, the only road to Rasuwa, was cut in multiple places.
            In Kathmandu and in cities on five continents, families were waiting by phones.
          </p>
        </div>
      </section>

      {/* ── CHAPTER 3: THE MONEY ── */}
      <section className="s-chapter s-dark s-reveal" id="the-money">
        <div className="s-inner">
          <p className="s-label">The response</p>
          <h2>The world gave. Fast. Generously.<br />And then it waited.</h2>
          <p>
            Within 36 hours of the government&apos;s appeal,{' '}
            <strong>$12.6M (रू 1.91 Billion)</strong> had been deposited.
            Within two weeks, the total exceeded <strong>$78.6M (रू 11.95 Billion)</strong>.
            International pledges pushed the tracked total above{' '}
            <strong>USD 66 million (रू 14 Arba)</strong>.
          </p>

          {/* Inflow chart */}
          <div className="s-chart-full s-reveal">
            <p className="s-chart-label">Contribution inflow — first 30 days (USD, रू in tooltip)</p>
            <canvas ref={inflowRef} height={180} />
          </div>

          {/* AG Grid — international */}
          <div className="s-grid-wrap s-reveal">
            <p className="s-grid-label">International contributions &amp; pledges</p>
            <div className="s-grid-scroll">
              <div className={`${gridTheme} s-grid-inner`}>
                <AgGridReact
                  columnDefs={intlCols}
                  rowData={intlData}
                  defaultColDef={defaultColDef}
                  domLayout="autoHeight"
                  suppressMovableColumns
                  suppressDragLeaveHidesColumns
                  suppressCellFocus
                />
              </div>
            </div>
          </div>

          {/* AG Grid — national */}
          <div className="s-grid-wrap s-reveal">
            <p className="s-grid-label">National &amp; corporate contributions</p>
            <div className="s-grid-scroll">
              <div className={`${gridTheme} s-grid-inner`}>
                <AgGridReact
                  columnDefs={natCols}
                  rowData={natData}
                  defaultColDef={defaultColDef}
                  domLayout="autoHeight"
                  suppressMovableColumns
                  suppressDragLeaveHidesColumns
                  suppressCellFocus
                />
              </div>
            </div>
          </div>

          {/* Charts row */}
          <div className="s-charts-grid s-reveal">
            <div className="s-chart-card">
              <p className="s-chart-label">Fund breakdown (USD, रू in brackets)</p>
              <canvas ref={donutRef} height={200} />
            </div>
            <div className="s-chart-card">
              <p className="s-chart-label">Sector contributions (USD, रू in tooltip)</p>
              <canvas ref={sectorRef} height={200} />
            </div>
          </div>

          {/* Fund release bar */}
          <div className="s-bar-wrap s-reveal">
            <div className="s-bar-row">
              <span>Total collected <strong>~USD 66M (रू 14+ Arba)</strong></span>
              <span>Released <strong>$6.6M (रू 1 Arba)</strong></span>
            </div>
            <div className="s-bar-track">
              <div className="s-bar-fill" ref={barRef} style={{ width: 0 }} />
            </div>
            <p className="s-bar-note">
              $6.6M (रू 1 Billion) released to NDRRMA out of ~$66M (रू 14+ Arba) collected.
              The remainder sits across nine commercial bank accounts.
            </p>
          </div>
        </div>
      </section>

      {/* ── CHAPTER 4: THE GAP ── */}
      <section className="s-chapter s-reveal">
        <div className="s-inner">
          <p className="s-label">The gap</p>
          <h2>Billions collected.<br />Families still waiting.</h2>
          <p>
            As of late 2026, <strong>$73.3M (रू 11.14 Billion)</strong> sits in nine
            commercial bank accounts. A further <strong>USD 24.47 Million (रू 3.72 Arba)</strong>
            is held in foreign currency accounts at Himalayan Bank and Laxmi Sunrise Bank.
            The funds are real. The need is real. The distance between them is bureaucracy.
          </p>
          <div className="s-locked-box s-reveal">
            <p>
              <strong>The problem isn&apos;t generosity.</strong> More than 800,000
              individual Nepalis donated via QR code. Pilgrims coming down from
              Gosaikunda gave what they could at checkpoints. Trekkers abroad sent
              funds from their phones. The money arrived. But relief funds, once
              collected, disappear into accounts with no public trail. Families in
              Rasuwa cannot see whether a donation made in their name is still sitting
              in a bank, has been disbursed, or what it bought.
            </p>
          </div>
          <p>
            After the 2015 Gorkha earthquake, reconstruction funds were delayed for years.
            The Rasuwa flood made the gap impossible to ignore. Those 800,000 donors
            deserve to know where it went.
          </p>
        </div>
      </section>

      {/* ── CHAPTER 5: THE PLATFORM ── */}
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
              { n: '4',      label: 'Steps from request to verified delivery', amber: true },
              { n: 'Open',   label: 'Every need and payment readable without an account' },
              { n: 'Live',   label: 'Needs update in real time as funds arrive', warm: true },
            ].map(({ n, label, amber, warm }) => (
              <div key={n} className="s-stat-cell">
                <span className={`s-num${amber ? ' s-amber' : warm ? ' s-warm' : ''}`}>{n}</span>
                <span className="s-stat-label">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
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

      {/* ── FOOTER ── */}
      <footer className="s-footer">
        <p>Data sourced from NDRRMA, OPMCM, and published humanitarian reports. Figures current as of late 2026.</p>
        <div className="s-sponsor-row">
          <span className="s-sponsor-label">Built with</span>
          <span className="s-sponsor-badge">AG Grid</span>
          <span className="s-sponsor-badge">Byrunti</span>
          <span className="s-sponsor-badge">Channel3</span>
        </div>
      </footer>
    </div>
  );
}
