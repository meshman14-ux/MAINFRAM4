import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import type { Client, EventRec, TaskCategory, Task, TaskStatus, Unit } from '../data/types';
import { TASK_CATEGORIES, TASK_STATUSES } from '../data/types';

const CAT_COLOR: Record<TaskCategory, string> = {
  Prep: 'var(--blue)', Crew: 'var(--violet)', Stock: 'var(--amber)',
  Compliance: 'var(--red)', Client: 'var(--green)', General: 'var(--ink-3)',
};
const fmtDue = (iso?: string) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

export default function Tasks() {
  const { data, ready, error } = useOpsData();
  const [clientId, setClientId] = useState('');
  const [view, setView] = useState<'events' | 'board'>('events');
  const [filter, setFilter] = useState<TaskCategory | 'All'>('All');
  const [title, setTitle] = useState('');
  const [eventId, setEventId] = useState('');
  const [category, setCategory] = useState<TaskCategory>('General');
  const [dueDate, setDueDate] = useState('');

  const clients = useMemo(
    () => (ready ? data.all<Client>('clients') : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, data.meta().updatedAt]
  );
  const activeId = clientId || clients[0]?.id || '';

  const events = useMemo(
    () => (activeId ? data.eventsForClient(activeId).sort((a, b) => (a.start || '').localeCompare(b.start || '')) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, data.meta().updatedAt]
  );

  const tasks = useMemo(
    () => (activeId ? data.tasksForClient(activeId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, data.meta().updatedAt]
  );
  const summary = useMemo(
    () => (activeId ? data.taskSummary(activeId) : { total: 0, open: 0, overdue: 0, byCategory: {} }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, data.meta().updatedAt]
  );

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading tasks</div></div></div>;
  if (clients.length === 0) return <div className="p4"><div className="empty-state">No operators yet.</div></div>;

  const today = new Date().toISOString().slice(0, 10);
  const visible = tasks
    .filter((t) => filter === 'All' || t.category === filter)
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99');
    });

  async function addTask() {
    if (!title.trim() || !eventId) return;
    await data.addTask(eventId, title, { category, dueDate: dueDate || undefined });
    setTitle(''); setDueDate('');
  }

  return (
    <div className="p4">
      <div className="client-bar">
        <select className="client-select" value={activeId} onChange={(e) => setClientId(e.target.value)} aria-label="Operator">
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="client-meta">Tasks tied to events — organise your timetable</span>
      </div>

      <div className="stat-strip">
        <div className="stat-box"><div className="v">{summary.open}</div><div className="k">Open tasks</div></div>
        <div className="stat-box" data-tone={summary.overdue ? 'red' : undefined}><div className="v">{summary.overdue}</div><div className="k">Overdue</div></div>
        <div className="stat-box"><div className="v">{summary.total}</div><div className="k">Total (incl. done)</div></div>
      </div>

      <ProgressChart data={data} clientId={activeId} />

      <div className="segmented" style={{ margin: '14px 0 4px' }}>
        <button aria-pressed={view === 'events'} onClick={() => setView('events')}>Event tasks</button>
        <button aria-pressed={view === 'board'} onClick={() => setView('board')}>Ops board</button>
      </div>

      {view === 'board' && <UnitTaskBoard data={data} clientId={activeId} />}

      {view === 'events' && <>
      <div className="task-tabs">
        <button className="task-tab" style={{ ['--tabc' as string]: 'var(--ink-2)' }} aria-pressed={filter === 'All'} onClick={() => setFilter('All')}>
          All<span className="n">{summary.open}</span>
        </button>
        {TASK_CATEGORIES.map((c) => (
          <button key={c} className="task-tab" style={{ ['--tabc' as string]: CAT_COLOR[c] }} aria-pressed={filter === c} onClick={() => setFilter(c)}>
            {c}<span className="n">{summary.byCategory[c] || 0}</span>
          </button>
        ))}
      </div>

      <div className="task-add">
        <label>Task<input className="inp" placeholder="What needs doing?" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label>Event
          <select className="sel" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Pick…</option>
            {events.map((e: EventRec) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        <label>Category
          <select className="sel" value={category} onChange={(e) => setCategory(e.target.value as TaskCategory)}>
            {TASK_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>Due<input className="inp" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
        <button className="btn btn-primary btn-sm" onClick={addTask} disabled={!title.trim() || !eventId}>+ Add</button>
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">No tasks{filter !== 'All' ? ` in ${filter}` : ''} yet.</div>
      ) : (
        visible.map((t) => {
          const overdue = data.isTaskOverdue(t, today);
          return (
            <div className="task-row" key={t.id} data-done={t.done}>
              <button className="task-check" data-done={t.done} onClick={() => data.toggleTaskDone(t.id)}>{t.done ? '✓' : ''}</button>
              <div className="task-main">
                <span className="task-title">{t.title}</span>
                <span className="task-meta">{t.eventName}</span>
              </div>
              <span className="task-cat-chip" style={{ ['--catc' as string]: CAT_COLOR[t.category] }}>{t.category}</span>
              <span className="task-due" data-overdue={overdue}>{t.dueDate ? fmtDue(t.dueDate) : '—'}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => data.removeTask(t.id)}>✕</button>
            </div>
          );
        })
      )}
      </>}
    </div>
  );
}

type Store = ReturnType<typeof useOpsData>['data'];

/* ---- animated progress chart: event tasks + unit tasks combined ---- */
function ProgressChart({ data, clientId }: { data: Store; clientId: string }) {
  const stats = useMemo(() => {
    const ev = data.tasksForClient(clientId);
    const unit = data.all<Task>('tasks').filter((t) => t.clientId === clientId);
    const total = ev.length + unit.length;
    const done = ev.filter((t) => t.done).length + unit.filter((t) => t.status === 'done').length;
    const doing = unit.filter((t) => t.status === 'doing').length;
    return { total, done, doing, open: total - done - doing };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, data.meta().updatedAt]);
  if (!stats.total) return null;

  const pct = stats.done / stats.total;
  const R = 34, CIRC = 2 * Math.PI * R;
  const seg = (n: number) => (stats.total ? (n / stats.total) * 100 : 0);
  return (
    <section className="card" style={{ marginTop: 14 }}>
      <div className="card-head"><div className="card-title">Progress</div>
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{stats.done}/{stats.total} done</span>
      </div>
      <div className="row-inline" style={{ gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <svg width={84} height={84} viewBox="0 0 84 84" role="img" aria-label={`${Math.round(pct * 100)}% of tasks done`}>
          <circle cx={42} cy={42} r={R} fill="none" stroke="var(--inset)" strokeWidth={9} />
          <circle cx={42} cy={42} r={R} fill="none" stroke="var(--ok)" strokeWidth={9} strokeLinecap="round"
            strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pct)}
            transform="rotate(-90 42 42)"
            style={{ transition: 'stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)' }} />
          <text x={42} y={47} textAnchor="middle" fill="var(--ok)" fontSize={17} fontWeight={700} fontFamily="var(--font-mono, monospace)">{Math.round(pct * 100)}%</text>
        </svg>
        <div style={{ flex: 1, minWidth: 220 }}>
          {([['done', stats.done, 'var(--ok)'], ['doing', stats.doing, 'var(--accent-2)'], ['open', stats.open, 'var(--warn)']] as const).map(([label, n, col]) => (
            <div key={label} className="row-inline" style={{ gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span className="mono" style={{ width: 44, fontSize: 10.5, color: 'var(--ink-3)', textTransform: 'uppercase' }}>{label}</span>
              <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--inset)', overflow: 'hidden' }}>
                <div style={{ width: `${seg(n)}%`, height: '100%', background: col, borderRadius: 4, transition: 'width .9s cubic-bezier(.2,.8,.2,1)' }} />
              </div>
              <span className="mono" style={{ width: 26, textAlign: 'right', fontSize: 11.5 }}>{n}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---- three-column board for the ops (unit) tasks ---- */
const STATUS_META: Record<TaskStatus, { label: string; col: string }> = {
  open: { label: 'Open', col: 'var(--warn)' },
  doing: { label: 'Doing', col: 'var(--accent-2)' },
  done: { label: 'Done', col: 'var(--ok)' },
};

function UnitTaskBoard({ data, clientId }: { data: Store; clientId: string }) {
  const [title, setTitle] = useState('');
  const [unitId, setUnitId] = useState('');
  const units = data.unitsForClient(clientId);
  const tasks = useMemo(
    () => data.all<Task>('tasks').filter((t) => t.clientId === clientId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientId, data.meta().updatedAt]
  );

  async function add() {
    if (!title.trim()) return;
    setTitle('');
    await data.save<Partial<Task>>('tasks', { clientId, unitId: unitId || undefined, title: title.trim(), status: 'open' });
  }
  async function move(t: Task, dir: 1 | -1) {
    const i = TASK_STATUSES.indexOf(t.status) + dir;
    if (i < 0 || i >= TASK_STATUSES.length) return;
    await data.save<Partial<Task>>('tasks', { id: t.id, status: TASK_STATUSES[i] as TaskStatus });
  }

  return (
    <section className="card" style={{ marginTop: 14 }}>
      <div className="card-head"><div className="card-title">Ops board — unit tasks</div>
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{tasks.length} task{tasks.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="row-inline" style={{ marginBottom: 12 }}>
        <input className="inp" placeholder="Add an ops task" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <select className="sel" value={unitId} onChange={(e) => setUnitId(e.target.value)} aria-label="Unit">
          <option value="">No unit</option>
          {units.map((u: Unit) => <option key={u.id} value={u.id}>{u.code}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={add} disabled={!title.trim()}>Add</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {TASK_STATUSES.map((st) => {
          const meta = STATUS_META[st as TaskStatus];
          const col = tasks.filter((t) => t.status === st);
          return (
            <div key={st} style={{ background: 'var(--inset)', borderRadius: 10, padding: 10, minHeight: 80 }}>
              <div className="mono" style={{ fontSize: 10.5, color: meta.col, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>{meta.label} · {col.length}</div>
              {col.map((t) => {
                const u = t.unitId ? data.get<Unit>('units', t.unitId) : null;
                return (
                  <div key={t.id} className="card" style={{ padding: '8px 10px', marginBottom: 8, borderLeft: `2px solid ${meta.col}` }}>
                    <div style={{ fontSize: 12.5, textDecoration: t.status === 'done' ? 'line-through' : undefined, color: t.status === 'done' ? 'var(--ink-3)' : undefined }}>{t.title}</div>
                    <div className="row-inline" style={{ marginTop: 6, gap: 6, alignItems: 'center' }}>
                      {u && <a className="mono" href={`#/unit/${u.id}`} style={{ fontSize: 10.5, color: 'var(--accent)', textDecoration: 'none' }}>{u.code}</a>}
                      <span style={{ marginLeft: 'auto' }} />
                      {st !== 'open' && <button className="btn btn-ghost btn-sm" aria-label="Move back" onClick={() => move(t, -1)}>‹</button>}
                      {st !== 'done' && <button className="btn btn-ghost btn-sm" aria-label="Move forward" onClick={() => move(t, 1)}>›</button>}
                      <button className="btn btn-ghost btn-sm" aria-label="Delete" onClick={() => data.remove('tasks', t.id)}>✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
