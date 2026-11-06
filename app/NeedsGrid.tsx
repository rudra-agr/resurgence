'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { slug, stageOf } from '@/lib/ledger';
import type { NeedRow } from '@/lib/types';

function FundingCell(p: ICellRendererParams<NeedRow>) {
  const n = p.data;
  if (!n) return null;
  const label = stageOf(n);
  const pctN = n.target > 0 ? Math.min(100, (n.raised / n.target) * 100) : 0;
  return (
    <span className="fund-cell">
      <span className={`chip chip-${slug(label)}`}>{label}</span>
      {n.target > 0 && (
        <span className="mini-meter" aria-hidden="true">
          <span style={{ width: `${pctN}%` }} />
        </span>
      )}
    </span>
  );
}

function VerifyCell(p: ICellRendererParams<NeedRow>) {
  const n = p.data;
  if (!n) return null;
  return n.verified ? (
    <span className="chip chip-mock">Verified by {n.authority} (mock)</span>
  ) : (
    <span className="chip chip-unverified">Unverified</span>
  );
}

function UrgencyCell(p: ICellRendererParams<NeedRow>) {
  return p.value ? <span className={`chip urg-${slug(String(p.value))}`}>{p.value}</span> : null;
}

// Loaded with next/dynamic so AG Grid stays out of the landing page bundle.
export default function NeedsGrid({ needs, money }: { needs: NeedRow[]; money: (v: number) => string }) {
  const router = useRouter();
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [q, setQ] = useState('');

  const cols = useMemo<ColDef<NeedRow>[]>(
    () => [
      { field: 'title', headerName: 'Need', flex: 1.2, minWidth: 170 },
      { field: 'location', flex: 1, minWidth: 130 },
      { field: 'urgency', width: 120, cellRenderer: UrgencyCell },
      { field: 'families', width: 95 },
      { field: 'raised', width: 105, valueFormatter: (p) => money(p.value) },
      { field: 'target', width: 105, valueFormatter: (p) => (p.value ? money(p.value) : '-') },
      { headerName: 'Funding', width: 125, valueGetter: (p) => (p.data ? stageOf(p.data) : ''), cellRenderer: FundingCell },
      {
        headerName: 'Verification',
        flex: 1.3,
        minWidth: 320,
        valueGetter: (p) => (p.data ? (p.data.verified ? `Verified by ${p.data.authority} (mock)` : 'Unverified') : ''),
        cellRenderer: VerifyCell,
      },
    ],
    [money]
  );

  const rows = useMemo(
    () =>
      urgentOnly ? needs.filter((n) => (n.urgency === 'Critical' || n.urgency === 'High') && n.status !== 'FUNDED') : needs,
    [needs, urgentOnly]
  );

  return (
    <div>
      <div className="toolbar">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search needs" aria-label="Search needs" />
        <label className="check">
          <input type="checkbox" checked={urgentOnly} onChange={(e) => setUrgentOnly(e.target.checked)} /> Urgent and not yet funded
        </label>
      </div>
      <p className="note">Select a row to open its proof trail.</p>
      <div className="ag-theme-quartz" style={{ height: 420 }}>
        <AgGridReact<NeedRow>
          rowData={rows}suppressMovableColumns
          columnDefs={cols}
          defaultColDef={{ sortable: true, resizable:false }}
          quickFilterText={q}
          getRowId={(p) => p.data.id}
          rowSelection="single"
          onRowClicked={(e) => e.data && router.push(`/needs/${e.data.id}`)}
          onCellKeyDown={(e) => {
          const ev = e.event as KeyboardEvent | null;
          if (ev?.key === 'Enter' && e.data) router.push(`/needs/${e.data.id}`);
        }}
       />
      </div>
    </div>
  );
}
