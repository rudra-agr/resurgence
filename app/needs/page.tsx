'use client';

import dynamic from 'next/dynamic';
import { useLedger } from '../Providers';

const NeedsGrid = dynamic(() => import('../NeedsGrid'), { ssr: false, loading: () => <p className="note">Loading ledger…</p> });

export default function NeedsPage() {
  const { data, money } = useLedger();
  return (
    <div className="wrap page">
      <p className="kicker">Public ledger</p>
      <h1 className="page-title">Needs</h1>
      <p className="page-lead">Every request, how far it is funded, and whether anyone has verified it. Anything unproven is labelled.</p>
      <NeedsGrid needs={data.needs} money={money} />
    </div>
  );
}
