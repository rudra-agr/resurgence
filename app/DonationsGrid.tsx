'use client';

import { useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import type { Donation } from '@/lib/types';
import { send } from '@/lib/client';

export default function DonationsGrid({ donations, money, cur, isAdmin, onChanged }: {
  donations: Donation[]; money: (v: number) => string; cur: string; isAdmin?: boolean; onChanged?: () => void;
}) {
  const grid = useRef<AgGridReact<Donation>>(null);
  const [q, setQ] = useState('');

  async function refund(id: string) {
    if (!confirm('Refund this sandbox payment in full?')) return;
    const { ok, j } = await send('/api/admin/refund', { fundingId: id });
    if (!ok) alert(j.error || 'Refund failed.');
    onChanged?.();
  }
  const cols = useMemo<ColDef<Donation>[]>(
    () => [
      { field: 'createdAt', headerName: 'When', flex: 1, minWidth: 170, valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleString() : '') },
      { field: 'needTitle', headerName: 'Need', flex: 1, minWidth: 140 },
      { field: 'payer', minWidth: 100 },
      { field: 'amount', minWidth: 100, valueFormatter: (p) => money(p.value) },
      { field: 'paypalCaptureId', headerName: 'PayPal capture (sandbox)', flex: 1, minWidth: 190 },
            { field: 'status', headerName: 'Status', minWidth: 110 },
      ...(isAdmin
        ? [
            {
              headerName: '',
              minWidth: 110,
              sortable: false,
              cellRenderer: (p: { data?: Donation }) =>
                p.data && p.data.id !== 'total' && p.data.status !== 'REFUNDED' ? (
                  <button className="alt" onClick={() => refund(p.data!.id)}>Refund</button>
                ) : null,
            } as ColDef<Donation>,
          ]
        : []),
    ],
    [money, isAdmin]
  );

  
  const total = useMemo<Donation[]>(
    () => [
      {
        id: 'total',
        needId: '',
        needTitle: `Total (${donations.length} donations)`,
        amount: donations.filter((d) => d.status !== 'REFUNDED').reduce((a, d) => a + d.amount, 0),        currency: cur,
        payer: '',
        paypalOrderId: '',
        paypalCaptureId: '',
        createdAt: '',
      },
    ],
    [donations, cur]
  );

  function exportCsv() {
    grid.current?.api.exportDataAsCsv({
      fileName: 'resurgence-donations-sandbox.csv',
      skipPinnedBottom: true,
      // Stop spreadsheet formulas: a cell that starts with = + - @ is prefixed with an apostrophe.
      processCellCallback: (c) => (typeof c.value === 'string' && /^[=+\-@\t\r]/.test(c.value) ? `'${c.value}` : c.value),
    });
  }

  return (
    <div>
      <div className="toolbar">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search donations" aria-label="Search donations" />
        <button className="alt" onClick={exportCsv}>Export CSV</button>
      </div>
      <div className="ag-theme-quartz" style={{ height: 460 }}>
        <AgGridReact<Donation>
          ref={grid}
          rowData={donations}
          columnDefs={cols}
          defaultColDef={{ sortable: true }}
          quickFilterText={q}
          pinnedBottomRowData={total}
          overlayNoRowsTemplate="No donations yet. Be the first."
        />
      </div>
    </div>
  );
}
