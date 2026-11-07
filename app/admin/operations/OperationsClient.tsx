'use client';

// Bryntum 7 needs these four stylesheets, in this order: icons, structure, then the theme.
import '@bryntum/scheduler/fontawesome/css/fontawesome.css';
import '@bryntum/scheduler/fontawesome/css/solid.css';
import '@bryntum/scheduler/scheduler.css';
import '@bryntum/scheduler/svalbard-light.css';
import './operations.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BryntumScheduler } from '@bryntum/scheduler-react';
import { useLedger } from '@/app/Providers';
import { send } from '@/lib/client';
import { LABEL } from '@/lib/ledger';
import {
  RESOURCE_TYPES,
  TASK_TYPES,
  TYPE_COLOR,
  TYPE_LABEL,
  type ResourceRow,
  type TaskRow,
  type TaskType,
} from '@/lib/operations';

/* ---------- small helpers ---------- */
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toLocalInput = (d: Date) => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const mondayOf = (d: Date) => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -((d.getDay() + 6) % 7));
const fmtRange = (a: Date, b: Date) => {
  const f = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' });
  return `${f.format(a)} to ${f.format(addDays(b, -1))}`;
};
const fmtWhen = (iso: string) =>
  new Intl.DateTimeFormat('en', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso)
  );
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const STATUS_LABEL: Record<string, string> = { SCHEDULED: 'Scheduled', IN_PROGRESS: 'In progress', DONE: 'Done' };
const STATUS_MARK: Record<string, string> = { SCHEDULED: '', IN_PROGRESS: '▶ ', DONE: '✓ ' };
const EVIDENCE_TYPES: TaskType[] = ['PURCHASE', 'DELIVERY'];
const COLUMNS = [
  { text: 'Resource', field: 'name', width: 200 },
  { text: 'Type', field: 'type', width: 110 },
];

type Msg = { kind: 'ok' | 'err'; text: string } | null;

export default function OperationsClient() {
  const { data } = useLedger();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [version, setVersion] = useState(0); // bumped only when the board must be rebuilt from the server
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [filter, setFilter] = useState<'ALL' | (typeof RESOURCE_TYPES)[number]>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  // Create-form state
  const [needId, setNeedId] = useState('');
  const [type, setType] = useState<TaskType>('PURCHASE');
  const [title, setTitle] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [notes, setNotes] = useState('');
  const [startStr, setStartStr] = useState('');
  const [endStr, setEndStr] = useState('');

  const tasksRef = useRef<TaskRow[]>([]);
  tasksRef.current = tasks;

  const load = useCallback(async () => {
    const [t, r] = await Promise.all([
      send('/api/admin/operations/tasks', undefined, 'GET'),
      send('/api/admin/operations/resources', undefined, 'GET'),
    ]);
    if (!t.ok || !r.ok) {
      setMsg({ kind: 'err', text: t.j?.error || r.j?.error || 'Could not load operations data.' });
      return;
    }
    setTasks(t.j.tasks);
    setResources(r.j.resources);
    setVersion((v) => v + 1);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);

  // Form defaults follow the visible week.
  useEffect(() => {
    const today = new Date();
    const base = today >= weekStart && today < weekEnd ? today : weekStart;
    const s = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 9, 0);
    setStartStr(toLocalInput(s));
    setEndStr(toLocalInput(new Date(s.getTime() + 2 * 3600_000)));
  }, [weekStart, weekEnd]);

  /* ---------- what the Bryntum board shows ---------- */
  const shownResources = useMemo(
    () => resources.filter((r) => r.active && (filter === 'ALL' || r.type === filter)),
    [resources, filter]
  );
  const boardResources = useMemo(
    () => shownResources.map((r) => ({ id: r.id, name: r.name, type: r.type.charAt(0) + r.type.slice(1).toLowerCase() })),
    [shownResources]
  );
  // Built only when `version` or the filter changes, NOT on every save. If this array changed after
  // each drag, the board would reset itself and could undo the move that was just made.
  const boardEvents = useMemo(() => {
    const ids = new Set(shownResources.map((r) => r.id));
    return tasksRef.current
      .filter((t) => t.resourceId && ids.has(t.resourceId))
      .map((t) => ({
        id: t.id,
        resourceId: t.resourceId,
        name: `${STATUS_MARK[t.status] ?? ''}${TYPE_LABEL[t.type]}: ${t.title}`,
        startDate: new Date(t.startDate),
        endDate: new Date(t.endDate),
        eventColor: TYPE_COLOR[t.type],
        draggable: t.status !== 'DONE',
        resizable: t.status !== 'DONE',
        taskType: t.type,
        taskStatus: t.status,
        needTitle: t.need.title,
        needLocation: t.need.location,
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, shownResources]);

  /* ---------- saving drag and resize ---------- */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const saveRecord = useCallback(async (rec: any) => {
    if (!rec || !(rec.startDate instanceof Date) || !(rec.endDate instanceof Date)) return;
    const rid = rec.resourceId ?? rec.resources?.[0]?.id ?? null;
    const body = {
      id: String(rec.id),
      startDate: rec.startDate.toISOString(),
      endDate: rec.endDate.toISOString(),
      resourceId: rid ? String(rid) : null,
    };
    const { ok, j } = await send('/api/admin/operations/tasks', body, 'PATCH');
    if (ok) {
      setTasks((prev) =>
        prev.map((t) => (t.id === body.id ? { ...t, startDate: body.startDate, endDate: body.endDate, resourceId: body.resourceId } : t))
      );
      setMsg({ kind: 'ok', text: 'Saved.' });
    } else {
      setMsg({ kind: 'err', text: `${j?.error || 'Could not save.'} The board was reset to the saved schedule.` });
      await load(); // put the bar back where the database says it is
    }
  }, [load]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onDrop = useCallback((p: any) => {
    if (p?.valid === false) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p?.eventRecords ?? []).forEach((r: any) => void saveRecord(r));
  }, [saveRecord]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onResize = useCallback((p: any) => {
    if (p?.changed === false) return;
    void saveRecord(p?.eventRecord);
  }, [saveRecord]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onEventClick = useCallback((p: any) => {
    if (p?.eventRecord?.id != null) setSelectedId(String(p.eventRecord.id));
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltip = useCallback((d: any) => {
    const r = d?.eventRecord;
    if (!r) return '';
    const g = (k: string) => esc(String(r.get?.(k) ?? ''));
    return `<div class="op-tip"><b>${esc(String(r.name ?? ''))}</b><br>${g('needTitle')}<br>${g('needLocation')}<br>${g('taskStatus').replace(/_/g, ' ').toLowerCase()}</div>`;
  }, []);

  const eventTooltip = useMemo(() => ({ template: tooltip }), [tooltip]);

  /* ---------- actions ---------- */
  const selected = tasks.find((t) => t.id === selectedId) ?? null;
  const resName = (id: string | null) => resources.find((r) => r.id === id)?.name ?? 'Unassigned';

  async function act(fn: () => Promise<{ ok: boolean; j: { error?: string } }>, okText: string) {
    setBusy(true);
    setMsg(null);
    const { ok, j } = await fn();
    setBusy(false);
    if (!ok) {
      setMsg({ kind: 'err', text: j?.error || 'Something went wrong.' });
      return false;
    }
    setMsg({ kind: 'ok', text: okText });
    await load();
    return true;
  }

  const patch = (id: string, fields: Record<string, unknown>, okText: string) =>
    act(() => send('/api/admin/operations/tasks', { id, ...fields }, 'PATCH'), okText);

  async function finish(t: TaskRow) {
    if (EVIDENCE_TYPES.includes(t.type) && note.trim().length < 5) {
      setMsg({ kind: 'err', text: 'Add a short evidence note (5+ characters).' });
      return;
    }
    const done = await act(
      () => send(`/api/admin/operations/tasks/${t.id}/complete`, { note: note.trim() }),
      EVIDENCE_TYPES.includes(t.type)
        ? 'Done. TEST evidence recorded; it now appears in the need’s proof trail and in the analytics.'
        : 'Done.'
    );
    if (done) setNote('');
  }

  async function remove(t: TaskRow) {
    if (!window.confirm(`Delete “${t.title}”?`)) return;
    if (await act(() => send('/api/admin/operations/tasks', { id: t.id }, 'DELETE'), 'Task deleted.')) setSelectedId(null);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const s = new Date(startStr);
    const en = new Date(endStr);
    if (!needId) return setMsg({ kind: 'err', text: 'Choose a need.' });
    if (isNaN(s.getTime()) || isNaN(en.getTime()) || en <= s) return setMsg({ kind: 'err', text: 'End must be after start.' });
    const need = data.needs.find((n) => n.id === needId);
    const ok = await act(
      () =>
        send('/api/admin/operations/tasks', {
          title: title.trim() || `${TYPE_LABEL[type]}: ${need?.title ?? 'need'}`.slice(0, 120),
          needId,
          type,
          resourceId: resourceId || null,
          startDate: s.toISOString(),
          endDate: en.toISOString(),
          notes: notes.trim() || undefined,
        }),
      'Task scheduled.'
    );
    if (ok) {
      setTitle('');
      setNotes('');
    }
  }

  const counts = {
    scheduled: tasks.filter((t) => t.status === 'SCHEDULED').length,
    progress: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
    done: tasks.filter((t) => t.status === 'DONE').length,
    unassigned: tasks.filter((t) => !t.resourceId && t.status !== 'DONE').length,
  };
  const unassigned = tasks.filter((t) => !t.resourceId && t.status !== 'DONE');
  const needsSorted = [...data.needs].sort((a, b) => Number(b.status === 'FUNDED') - Number(a.status === 'FUNDED'));
  const evidenceNeedsFunding =
    EVIDENCE_TYPES.includes(type) && data.needs.find((n) => n.id === needId)?.status !== 'FUNDED' && !!needId;

  return (
    <div className="wrap op-page">
      <header className="op-head">
        <div>
          <p className="kicker">Admin</p>
          <h1 className="page-title">Delivery operations</h1>
          <p className="op-lede">
            Schedule purchases, dispatch and delivery against teams and vehicles. Finishing a purchase or delivery task
            records the same proof the ledger shows publicly.
          </p>
        </div>
        <span className="op-chip">Sandbox · mock scheduling · no real deliveries</span>
      </header>

      <div className="op-kpis" aria-label="Task counts">
        <div><span>Scheduled</span><strong>{counts.scheduled}</strong></div>
        <div><span>In progress</span><strong>{counts.progress}</strong></div>
        <div><span>Done</span><strong>{counts.done}</strong></div>
        <div className={counts.unassigned ? 'warn' : ''}><span>Unassigned</span><strong>{counts.unassigned}</strong></div>
      </div>

      <div className="op-toolbar">
        <div className="op-weeknav" role="group" aria-label="Week">
          <button className="alt" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">←</button>
          <button className="alt" onClick={() => setWeekStart(mondayOf(new Date()))}>Today</button>
          <button className="alt" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">→</button>
          <strong className="op-range">{fmtRange(weekStart, weekEnd)}</strong>
          <label className="op-inline">
            Jump to
            <input
              type="date"
              value={ymd(weekStart)}
              onChange={(e) => e.target.value && setWeekStart(mondayOf(new Date(`${e.target.value}T00:00`)))}
            />
          </label>
        </div>
        <label className="op-inline">
          Show
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="ALL">All resources</option>
            {RESOURCE_TYPES.map((r) => (
              <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}s</option>
            ))}
          </select>
        </label>
        <ul className="op-legend" aria-label="Task colours">
          {TASK_TYPES.map((t) => (
            <li key={t}><i style={{ background: TYPE_COLOR[t] }} />{TYPE_LABEL[t]}</li>
          ))}
        </ul>
      </div>

      <p className={msg ? (msg.kind === 'err' ? 'err op-msg' : 'op-msg op-ok') : 'op-msg'} role="status" aria-live="polite">
        {msg?.text ?? ''}
      </p>

      <div className="op-grid">
        <section className="op-board" aria-label="Delivery schedule">
          {!loaded ? (
            <p className="op-empty">Loading schedule…</p>
          ) : (
              <>
              <BryntumScheduler
                height={480}
                events={boardEvents as never}
                resources={boardResources}
                columns={COLUMNS}
                startDate={weekStart}
                endDate={weekEnd}
                viewPreset="dayAndWeek"
                zoomOnMouseWheel={false}
                zoomOnTimeAxisDoubleClick={false}
                rowHeight={54}
                barMargin={6}
                eventEditFeature={false}
                eventDragCreateFeature={false}
                eventTooltipFeature={eventTooltip}
                onEventClick={onEventClick}
                onAfterEventDrop={onDrop}
                onEventResizeEnd={onResize}
              />
              {tasks.length === 0 && <p className="op-empty">No tasks yet. Schedule the first one with the form on the right.</p>}
              <p className="op-hint">Drag a bar to move it or change its team. Drag its edge to change the time. Click a bar for details.</p>
            </>
          )}
        </section>

        <aside className="op-side">
          <div className="op-card">
            <h2>{selected ? selected.title : 'Task details'}</h2>
            {!selected ? (
              <p className="op-sub">Click a bar on the schedule to see it here.</p>
            ) : (
              <>
                <dl className="op-facts">
                  <div><dt>Type</dt><dd>{TYPE_LABEL[selected.type]}</dd></div>
                  <div><dt>Status</dt><dd>{STATUS_LABEL[selected.status]}</dd></div>
                  <div><dt>Need</dt><dd>{selected.need.title}</dd></div>
                  <div><dt>Need status</dt><dd>{LABEL[selected.need.status] ?? selected.need.status}</dd></div>
                  <div><dt>Where</dt><dd>{selected.need.location}</dd></div>
                  <div><dt>Assigned to</dt><dd>{resName(selected.resourceId)}</dd></div>
                  <div><dt>Window</dt><dd>{fmtWhen(selected.startDate)} to {fmtWhen(selected.endDate)}</dd></div>
                  {selected.notes && <div><dt>Notes</dt><dd>{selected.notes}</dd></div>}
                </dl>
                {selected.status === 'SCHEDULED' && (
                  <button disabled={busy} onClick={() => patch(selected.id, { status: 'IN_PROGRESS' }, 'Task started.')}>Start task</button>
                )}
                {selected.status === 'IN_PROGRESS' && (
                  <>
                    {EVIDENCE_TYPES.includes(selected.type) && (
                      <>
                        <label htmlFor="op-note">Evidence note (recorded as TEST evidence)</label>
                        <textarea id="op-note" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
                        <p className="op-sub">
                          Writes a {selected.type === 'PURCHASE' ? 'Purchase' : 'Delivery'} event to the need’s audit trail. The need must be
                          fully funded{selected.type === 'DELIVERY' ? ' and the purchase recorded first' : ''}.
                        </p>
                      </>
                    )}
                    <button disabled={busy} onClick={() => finish(selected)}>Finish task</button>
                  </>
                )}
                {selected.status !== 'DONE' && (
                  <button className="alt op-danger" disabled={busy} onClick={() => remove(selected)}>Delete task</button>
                )}
              </>
            )}
          </div>

          <form className="op-card" onSubmit={create}>
            <h2>Schedule a task</h2>
            <label htmlFor="op-need">Need</label>
            <select id="op-need" value={needId} onChange={(e) => setNeedId(e.target.value)} required>
              <option value="">Choose a need…</option>
              {needsSorted.map((n) => (
                <option key={n.id} value={n.id}>{n.title} · {LABEL[n.status] ?? n.status}</option>
              ))}
            </select>
            <label htmlFor="op-type">Task type</label>
            <select id="op-type" value={type} onChange={(e) => setType(e.target.value as TaskType)}>
              {TASK_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
            {evidenceNeedsFunding && (
              <p className="op-sub op-warn">This need is not fully funded yet, so a {TYPE_LABEL[type].toLowerCase()} task can be scheduled but not finished.</p>
            )}
            <label htmlFor="op-title">Title (optional)</label>
            <input id="op-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Defaults to the type and need" />
            <label htmlFor="op-res">Assign to</label>
            <select id="op-res" value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
              <option value="">Unassigned for now</option>
              {resources.filter((r) => r.active).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <label htmlFor="op-start">Start</label>
            <input
              id="op-start"
              type="datetime-local"
              value={startStr}
              onChange={(e) => {
                setStartStr(e.target.value);
                const s = new Date(e.target.value);
                if (!isNaN(s.getTime()) && new Date(endStr) <= s) setEndStr(toLocalInput(new Date(s.getTime() + 2 * 3600_000)));
              }}
              required
            />
            <label htmlFor="op-end">End</label>
            <input id="op-end" type="datetime-local" value={endStr} onChange={(e) => setEndStr(e.target.value)} required />
            <label htmlFor="op-notes">Notes (optional)</label>
            <input id="op-notes" value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} />
            <button type="submit" disabled={busy}>Schedule task</button>
          </form>

          {unassigned.length > 0 && (
            <div className="op-card">
              <h2>Unassigned tasks</h2>
              <p className="op-sub">These have no team yet, so they are not on the timeline.</p>
              <ul className="op-list">
                {unassigned.map((t) => (
                  <li key={t.id}>
                    <span><i style={{ background: TYPE_COLOR[t.type] }} />{t.title}</span>
                    <select
                      aria-label={`Assign ${t.title}`}
                      value=""
                      disabled={busy}
                      onChange={(e) => e.target.value && patch(t.id, { resourceId: e.target.value }, 'Assigned.')}
                    >
                      <option value="">Assign…</option>
                      {resources.filter((r) => r.active).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
