'use client';

import dynamic from 'next/dynamic';
import { useLedger } from '../Providers';

const DonationsGrid = dynamic(() => import('../DonationsGrid'), { ssr: false, loading: () => <p className="note">Loading ledger…</p> });

export default function DonationsPage() {
  const { data, money, cur, me, refresh } = useLedger();
  return (
    <div className="wrap page">
      <p className="kicker">Public ledger</p>
      <h1 className="page-title">Donations</h1>
      <p className="page-lead">Every captured sandbox payment, with its masked PayPal reference.</p>
      <DonationsGrid donations={data.donations} money={money} cur={cur} isAdmin={me?.role === 'ADMIN'} onChanged={refresh} />
    </div>
  );
}
