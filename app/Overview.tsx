'use client';

import { useMemo } from 'react';
import type { Donation, NeedRow } from '@/lib/types';

type Props = {
  needs: NeedRow[];
  donations: Donation[];
  money: (v: number) => string;
  onPick: (id: string) => void;
};

const URGENCY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

const stageOf = (n: NeedRow) =>
  n.target <= 0 ? 'Not priced' : n.status === 'FUNDED' ? 'Funded' : n.raised > 0 ? 'Partial' : 'Unfunded';

const slug = (s: string) => s.toLowerCase().replace(/\s+/g, '-');
const STAGES = ['Not priced', 'Unfunded', 'Partial', 'Funded'];

export default function Overview({ needs, donations, money, onPick }: Props) {
  const sorted = useMemo(
    () =>
      [...needs].sort(
        (a, b) =>
          (URGENCY_ORDER[a.urgency] ?? 9) - (URGENCY_ORDER[b.urgency] ?? 9) ||
          Number(a.status === 'FUNDED') - Number(b.status === 'FUNDED')
      ),
    [needs]
  );

  const days = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const d of donations) {
      const key = new Date(d.createdAt).toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + d.amount);
    }
    return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-10);
  }, [donations]);
  const max = Math.max(1, ...days.map(([, v]) => v));

  const counts = STAGES.map((s) => [s, needs.filter((n) => stageOf(n) === s).length] as const);

  return (
    <div className="ov-grid">
      <div className="panel">
        <h2>Needs, most urgent first</h2>
        <p className="note">Select a need to open its proof trail.</p>
        {sorted.length === 0 && <p className="note">No needs yet.</p>}
        <ul className="needlist">
          {sorted.map((n) => {
            const stage = stageOf(n);
            const pct = n.target > 0 ? Math.min(100, (n.raised / n.target) * 100) : 0;
            return (
              <li key={n.id}>
                <button className="needrow" data-urgency={n.urgency} onClick={() => onPick(n.id)}>
                  <span className="nr-main">
                    <b>{n.title}</b>
                    <small>
                      {n.location} · {n.families} families · {n.urgency}
                    </small>
                  </span>
                  <span className="nr-side">
                    <span className={`chip chip-${slug(stage)}`}>{stage}</span>
                    {n.target > 0 && (
                      <span className="mini-meter" aria-hidden="true">
                        <span style={{ width: `${pct}%` }} />
                      </span>
                    )}
                    <small>{n.target > 0 ? `${money(n.raised)} of ${money(n.target)}` : 'Awaiting pricing'}</small>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <div className="panel">
          <h2>Money in, by day</h2>
          <p className="note">Captured sandbox payments. Hover a bar for the exact amount.</p>
          {days.length === 0 ? (
            <p className="note">No donations yet. The first sandbox payment will appear here.</p>
          ) : (
            <svg
              viewBox="0 0 480 170"
              className="chart"
              role="img"
              aria-label={`Donations by day, last ${days.length} days with payments`}
            >
              <line x1="0" y1="140" x2="480" y2="140" className="baseline" />
              {days.map(([key, v], i) => {
                const slot = 480 / days.length;
                const h = (v / max) * 110;
                const x = i * slot + slot * 0.2;
                const w = slot * 0.6;
                return (
                  <g key={key}>
                    <rect x={x} y={140 - h} width={w} height={h} rx="2" className="bar">
                      <title>{`${key}: ${money(v)}`}</title>
                    </rect>
                    <text x={x + w / 2} y={140 - h - 5} textAnchor="middle" className="val">
                      {Math.round(v)}
                    </text>
                    <text x={x + w / 2} y={158} textAnchor="middle" className="axis">
                      {key.slice(5)}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        <div className="panel">
          <h2>Where the needs stand</h2>
          {needs.length > 0 && (
            <div className="stack" role="img" aria-label="Needs by funding stage">
              {counts.map(([s, c]) =>
                c > 0 ? <span key={s} className={`seg seg-${slug(s)}`} style={{ flex: c }} title={`${s}: ${c}`} /> : null
              )}
            </div>
          )}
          <ul className="legend">
            {counts.map(([s, c]) => (
              <li key={s}>
                <span className={`chip chip-${slug(s)}`}>{s}</span> {c}
              </li>
            ))}
          </ul>
          <p className="note">Purchase and delivery stay unverified until an admin records evidence.</p>
        </div>
      </div>
    </div>
  );
}
