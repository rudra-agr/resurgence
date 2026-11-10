'use client';

import { useCallback, useRef, useState } from 'react';
import { studioTheme } from 'ag-studio';
import type { AgFieldDefinition } from 'ag-studio';
import { AgStudio, AgStudioProvider } from 'ag-studio-react';
import { send } from '@/lib/client';
import savedState from './studioDefaultState.json';
import { studioWidgets } from './studioWidgets';
import { INTERVALS, useLiveFeed } from './useLiveFeed';
import type { Interval } from './useLiveFeed';

// Licence key comes from the environment, never from git. Without it Studio runs with a watermark.
const LICENCE = process.env.NEXT_PUBLIC_AG_STUDIO_LICENCE || '';

// Quieter type than Studio's default: smaller, lighter widget titles in the site's own font.
// Chart text stays on Studio's default font, because charts draw on a canvas that cannot read CSS variables.
const lookAndFeel = studioTheme.withParams({
  studioWidgetTitleFontFamily: 'var(--font-body)',
  studioWidgetTitleFontSize: 14,
  studioWidgetTitleFontWeight: 600,
  studioWidgetSubtitleFontFamily: 'var(--font-body)',
  studioWidgetSubtitleFontSize: 12,
  studioWidgetSubtitleFontWeight: 400,
  studioWidgetPadding: 8,
  studioWidgetBorderRadius: 8,
});

// The reading view has no side panels: the filters sit inside the dashboard, like the AG Studio demo.
const PANELS = { view: { right: [] }, edit: { right: ['filters', 'edit', 'data'] } } as const;

// The dashboard is 32 rows tall at 20px a row, plus the canvas padding. The reading view is exactly that
// tall, so there is no blank strip underneath. If you change the layout's height, change this too.
const VIEW_HEIGHT = 32 * 20 + 28;

type Rows = Record<string, unknown>[];
type Source = { id: string; name?: string; data: Rows; fields?: AgFieldDefinition[] };
type StudioData = { sources: Source[] };

const money = { format: 'decimalFormat' as const, formatOptions: { format: '#,##0.00' } };

// Needs, with explicit types so money, counts and the funded percentage format the same everywhere.
const NEEDS_FIELDS: AgFieldDefinition[] = [
  { id: 'title', name: 'Need', format: 'textFormat' },
  { id: 'location', name: 'Location', format: 'textFormat' },
  { id: 'families', name: 'Families', format: 'integerFormat' },
  { id: 'urgency', name: 'Urgency', format: 'textFormat' },
  { id: 'status', name: 'Status', format: 'textFormat' },
  { id: 'target', name: 'Target (USD)', ...money },
  { id: 'raised', name: 'Raised (USD)', ...money },
  { id: 'gap', name: 'Still needed (USD)', ...money },
  { id: 'fundedPct', name: 'Funded (%)', format: 'integerFormat' },
  { id: 'fundedRatio', name: 'Funded', format: 'percentageFormat', formatOptions: { format: '#,##0%' } },
  { id: 'gapPerFamily', name: 'Gap per family (USD)', ...money },
  { id: 'raisedPerFamily', name: 'Raised per family (USD)', ...money },
  { id: 'raised7d', name: 'Last 7 days (USD)', ...money },
  { id: 'priced', name: 'Pricing', format: 'textFormat' },
  { id: 'created', name: 'Created', format: 'textFormat' },
];

// The live donations table: one row per recent donation, newest first. Time is plain text in
// "mm-dd hh:mm" so it reads the same everywhere and still sorts correctly.
const LIVE_FIELDS: AgFieldDefinition[] = [
  { id: 'id', name: 'ID', format: 'textFormat', hide: true },
  { id: 'time', name: 'Time', format: 'textFormat' },
  { id: 'need', name: 'Need', format: 'textFormat' },
  { id: 'location', name: 'Location', format: 'textFormat' },
  { id: 'amountNpr', name: 'Amount (Rs)', format: 'integerFormat' },
  { id: 'amountUsd', name: 'Amount (USD)', ...money },
  { id: 'status', name: 'Status', format: 'textFormat' },
  { id: 'mode', name: 'Mode', format: 'textFormat' },
];
const two = (n: number) => String(n).padStart(2, '0');
const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
};

// Switching analytics tabs unmounts Studio. The latest layout is kept here so unsaved edits come back
// when the Studio tab is reopened. It lasts until the page is reloaded; "Copy layout" is how to keep one.
let draft: unknown = null;

export default function StudioPanel() {
  // Studio compares props by reference. `data` is only replaced when the rows really changed, and the
  // other props below are kept stable, so a refresh never restarts Studio or resets filters and selection.
  const [data, setData] = useState<StudioData | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [updated, setUpdated] = useState('');
  // The dashboard opens read-only so it fits on one screen. "Edit dashboard" opens the build panels.
  const [editing, setEditing] = useState(false);
  const [initial] = useState<unknown>(() => draft ?? (savedState && typeof savedState === 'object' ? savedState : undefined));
  const studioRef = useRef<AgStudio>(null);
  const lastSig = useRef('');

  const feed = useLiveFeed(async () => {
    const { ok, j } = await send('/api/admin/studio-data', undefined, 'GET');
    if (!ok) return setError(j?.error || 'Could not load the data.');
    setError('');
    setUpdated(new Date().toLocaleTimeString());
    const sig = JSON.stringify([j.needs, j.donations, j.live]);
    if (sig === lastSig.current) return; // nothing changed, so Studio has nothing to redraw
    lastSig.current = sig;
    const live = (j.live as { at: string }[]).map((r) => ({ ...r, time: stamp(r.at) }));
    setData({
      sources: [
        { id: 'needs', name: 'Needs', data: j.needs, fields: NEEDS_FIELDS },
        { id: 'donations', data: j.donations },
        { id: 'live', name: 'Live donations', data: live, fields: LIVE_FIELDS },
      ],
    });
  }, INTERVALS[1]);

  const onStateUpdated = useCallback((e: { state: unknown }) => {
    draft = e.state;
  }, []);

  const layoutJson = () => {
    const api = studioRef.current?.api;
    return api ? JSON.stringify(api.getState()) : null;
  };

  const copyLayout = async () => {
    const json = layoutJson();
    if (!json) return setNote('Studio is not ready yet.');
    try {
      await navigator.clipboard.writeText(json);
      setNote('Layout copied. Paste it into app/admin/analytics/studioDefaultState.json');
    } catch {
      setNote('Copy was blocked. Use Download layout instead.');
    }
  };

  const downloadLayout = () => {
    const json = layoutJson();
    if (!json) return setNote('Studio is not ready yet.');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = 'studioDefaultState.json';
    a.click();
    URL.revokeObjectURL(a.href);
    setNote('Downloaded. Move it to app/admin/analytics/studioDefaultState.json');
  };

  if (error && !data) return <div className="wrap an-panel"><p className="err" role="alert">{error}</p></div>;
  if (!data) return <div className="wrap an-panel"><p className="note">Loading Studio…</p></div>;

  const studio = (
    <div className="an-studio-canvas" style={editing ? undefined : { height: VIEW_HEIGHT, minHeight: 0 }}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <AgStudio ref={studioRef} data={data} mode={editing ? 'edit' : 'view'} theme={lookAndFeel} widgets={studioWidgets} panels={PANELS as any} initialState={initial as any} onStateUpdated={onStateUpdated} />
    </div>
  );

  return (
    <>
      <div className="wrap an-studio-head">
        <div className="an-studio-title">
          <h1>Studio</h1>
          <span className="an-studio-live" role="status" data-running={feed.running}>
            {feed.running ? 'Live' : 'Paused'}{updated && ` · ${updated}`}
          </span>
        </div>
        <div className="an-studio-tools">
          {editing && (
            <>
              <button type="button" className="alt" onClick={copyLayout}>Copy layout</button>
              <button type="button" className="alt" onClick={downloadLayout}>Download layout</button>
            </>
          )}
          <label className="an-studio-every">
            Update every
            <select value={feed.intervalMs} onChange={(e) => feed.setIntervalMs(Number(e.target.value) as Interval)}>
              {INTERVALS.map((ms) => <option key={ms} value={ms}>{ms / 1000}s</option>)}
            </select>
          </label>
          <button type="button" className="alt" onClick={() => feed.setRunning(!feed.running)}>{feed.running ? 'Pause' : 'Resume'}</button>
          <button type="button" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit dashboard'}</button>
        </div>
        {(note || error) && (
          <p className={error ? 'err an-studio-msg' : 'note an-studio-msg'} role={error ? 'alert' : 'status'}>
            {error ? `${error} Showing the last good data.` : note}
          </p>
        )}
      </div>
      {/* Reading view lines up with the page; editing view goes full width to make room for the build panels. */}
      <div className={editing ? 'an-studio-full' : 'wrap an-studio-fit'}>
        {LICENCE ? <AgStudioProvider licenseKey={LICENCE}>{studio}</AgStudioProvider> : studio}
      </div>
    </>
  );
}
