'use client';
import { useState } from 'react';
import { AgStudio, AgStudioProvider } from 'ag-studio-react';

// Licence key comes from the environment, never from git. Without it Studio runs with a watermark.
const LICENCE = process.env.NEXT_PUBLIC_AG_STUDIO_LICENCE || '';

// Sample data for the first test. The next step replaces this with real donations and needs.
const SAMPLE = {
  sources: [
    {
      id: 'donations',
      data: [
        { need: 'Water filters', amount: 120, status: 'Delivered' },
        { need: 'Tarpaulin sheets', amount: 340, status: 'Funded' },
        { need: 'Wool blankets', amount: 210, status: 'Funded' },
        { need: 'Medical kits', amount: 160, status: 'Purchased' },
      ],
    },
  ],
};

export default function StudioClient() {
  // useState keeps the object stable across renders, as Studio requires.
  const [data] = useState(SAMPLE);

  const studio = (
    <div style={{ height: 'calc(100vh - 140px)', minHeight: 560, width: '100%' }}>
      <AgStudio data={data} mode="edit" />
    </div>
  );

  return LICENCE ? <AgStudioProvider licenseKey={LICENCE}>{studio}</AgStudioProvider> : studio;
}
