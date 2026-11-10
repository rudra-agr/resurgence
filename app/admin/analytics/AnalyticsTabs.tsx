'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import AnalyticsClient from './AnalyticsClient';

// Studio is browser-only, so it never renders on the server.
const StudioPanel = dynamic(() => import('./StudioPanel'), {
  ssr: false,
  loading: () => <div className="wrap an-panel"><p className="note">Loading Studio…</p></div>,
});

export type Tab = 'overview' | 'studio';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'studio', label: 'Studio' },
];

export default function AnalyticsTabs({ initialTab }: { initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);

  // Only the open tab is mounted, so a closed tab never polls the server in the background.
  function pick(next: Tab) {
    setTab(next);
    const url = next === 'overview' ? window.location.pathname : `${window.location.pathname}?tab=${next}`;
    window.history.replaceState(null, '', url);
  }

  function onKey(e: KeyboardEvent<HTMLButtonElement>) {
    const i = TABS.findIndex((t) => t.id === tab);
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = TABS[(i + step + TABS.length) % TABS.length].id;
    pick(next);
    requestAnimationFrame(() => document.getElementById(`an-tab-${next}`)?.focus());
  }

  return (
    <>
      <div className="wrap an-tabs-wrap">
        <div className="an-tabs" role="tablist" aria-label="Analytics views">
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`an-tab-${t.id}`}
              type="button"
              role="tab"
              className="an-tab"
              aria-selected={tab === t.id}
              aria-controls="an-tabpanel"
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => pick(t.id)}
              onKeyDown={onKey}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div id="an-tabpanel" role="tabpanel" aria-labelledby={`an-tab-${tab}`}>
        {tab === 'overview' && <AnalyticsClient />}
        {tab === 'studio' && <StudioPanel />}
      </div>
    </>
  );
}
