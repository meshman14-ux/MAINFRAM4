import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import type { Client, EventRec, TaskCategory } from '../data/types';
import { TASK_CATEGORIES } from '../data/types';

const CAT_COLOR: Record<TaskCategory, string> = {
  Prep: 'var(--blue)', Crew: 'var(--violet)', Stock: 'var(--amber)',
  Compliance: 'var(--red)', Client: 'var(--green)', General: 'var(--ink-3)',
};
const fmtDue = (iso?: string) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

export default function Tasks() {
  const { data, ready, error } = useOpsData();
  const [clientId, setClientId] = useState('');
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
    </div>
  );
}
