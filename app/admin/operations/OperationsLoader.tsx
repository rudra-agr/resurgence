'use client';

import dynamic from 'next/dynamic';

// Bryntum touches window and document, so it must never render on the server.
// ssr:false is only allowed inside a client component, which is why this small file exists.
const OperationsClient = dynamic(() => import('./OperationsClient'), {
  ssr: false,
  loading: () => (
    <div className="wrap" style={{ padding: '2rem 0' }}>
      <p>Loading the scheduler…</p>
    </div>
  ),
});

export default function OperationsLoader() {
  return <OperationsClient />;
}
