'use client';

import Link from 'next/link';

const STATS = [
  { n: '90,000+', label: 'people affected' },
  { n: 'रू 14 Arba', label: 'in relief funds collected' },
  { n: '7%', label: 'of funds released to date' },
];

export function DisasterBanner() {
  return (
    <div className="disaster-banner" role="note" aria-label="Active disaster relief context">
      <div className="disaster-banner-inner">
        <div className="disaster-banner-left">
          <span className="disaster-banner-pulse" aria-hidden="true" />
          <span className="disaster-banner-text">
            <strong>Active relief operation</strong>
            {' · '}
            <span>Rasuwa, Nepal · August 2026 flood</span>
          </span>
        </div>
        <div className="disaster-banner-stats">
          {STATS.map(({ n, label }) => (
            <span key={label} className="disaster-banner-stat">
              <strong>{n}</strong>
              <span>{label}</span>
            </span>
          ))}
        </div>
        <Link href="/story" className="disaster-banner-link">
          Read the story →
        </Link>
      </div>
    </div>
  );
}
