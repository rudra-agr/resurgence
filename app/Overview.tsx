'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Donation, NeedRow } from '@/lib/types';
import { STAGES, URGENCY_ORDER, slug, stageOf } from '@/lib/ledger';

type Props = {
  needs: NeedRow[];
  donations: Donation[];
  money: (v: number) => string;
  onPick: (id: string) => void;
};


const TOGGLE_ROOM = 44; // height of the "Show all" button and its gap, in px

// useLayoutEffect measures before the first paint in the browser; on the server it would only warn.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

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

  // Closed, the needs list stops at the last need that ends level with the panels on the right, so it
  // never runs on far below them. "Show all" opens the whole list. Opening a need is unchanged.
  const rightRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [fit, setFit] = useState<{ px: number; count: number } | null>(null);

  useIsoLayoutEffect(() => {
    const right = rightRef.current;
    const list = listRef.current;
    if (!right || !list) return;
    const measure = () => {
      const panels = right.lastElementChild;
      if (!panels) return;
      const top = list.getBoundingClientRect().top;
      const levelWith = panels.getBoundingClientRect().bottom - top;
      // The whole list already ends level with the right side (or the columns are stacked): no toggle.
      if (list.scrollHeight <= levelWith + 1) return setFit(null);
      let px = 0;
      let count = 0;
      for (const li of Array.from(list.children)) {
        const bottom = li.getBoundingClientRect().bottom - top;
        if (bottom > levelWith - TOGGLE_ROOM) break; // keep room for the "Show all" button underneath
        px = bottom;
        count++;
      }
      setFit(count >= 1 && count < list.children.length ? { px, count } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(right);
    ro.observe(list);
    return () => ro.disconnect();
  }, [sorted]);
  const collapsed = !open && fit !== null;

  const counts = STAGES.map((s) => [s, needs.filter((n) => stageOf(n) === s).length] as const);

  return (
    <div className="ov-grid">
      <div className="panel">
        <h2>Needs, most urgent first</h2>
        <p className="note">Select a need to open its proof trail.</p>
        {sorted.length === 0 && <p className="note">No needs yet.</p>}
        <ul id="needlist" ref={listRef} className="needlist" style={collapsed ? { maxHeight: fit.px, overflow: 'hidden' } : undefined}>
          {sorted.map((n, i) => {
            const stage = stageOf(n);
            const pct = n.target > 0 ? Math.min(100, (n.raised / n.target) * 100) : 0;
            return (
              <li key={n.id} aria-hidden={collapsed && i >= fit.count ? true : undefined}>
                <button className="needrow" data-urgency={n.urgency} onClick={() => onPick(n.id)} tabIndex={collapsed && i >= fit.count ? -1 : undefined}>
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
        {fit !== null && (
          <button type="button" className="linkbtn needs-toggle" aria-expanded={open} aria-controls="needlist" onClick={() => setOpen(!open)}>
            {open ? 'Show fewer needs' : `Show all ${sorted.length} needs`}
          </button>
        )}
      </div>

      <div ref={rightRef}>
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
