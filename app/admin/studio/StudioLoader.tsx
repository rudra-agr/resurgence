'use client';

import dynamic from 'next/dynamic';

// Studio is browser-only, so it never renders on the server.
const StudioClient = dynamic(() => import('./StudioClient'), {
  ssr: false,
  loading: () => (
    <div className="wrap" style={{ padding: '2rem 0' }}>
      <p>Loading Studio…</p>
    </div>
  ),
});

export default function StudioLoader() {
  return <StudioClient />;
}
