/* Unit Dashboard — route #/unit/:id. Everything about one unit on one page:
   profile, AI analysis (scores + insights + summaries), the six interactive
   checklists (stock/paperwork/equipment/consumables/safety/operational),
   assigned stock, and linked events / staff / tasks. Opened from the Console
   unit widgets, Staff and the Timeline. */
import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import type {
  Unit, Client, Staff, EventRec, Task, UnitChecklist, ChecklistKind, UnitChecklistItem, TaskStatus,
} from '../data/types';
import { CHECKLIST_KINDS, TASK_STATUSES } from '../data/types';
import { unitColor } from '../components/console/unitTheme';
import { seedItems } from '../lib/research';
import { analyzeUnit, gatherUnitContext, scoreUnit, ruleInsights } from '../lib/unitAI';

const fmt = (iso?: string) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
const KIND_LABEL: Record<ChecklistKind, string> = {
  stock: 'Stock', paperwork: 'Paperwork', equipment: 'Equipment',
  consumables: 'Consumables', safety: 'Safety', operational: 'Operational',
};
const TONE_CHIP: Record<string, string> = { ok: 'chip-green', warn: 'chip-amber', danger: 'chip-red', info: 'chip-blue' };

function hashUnitId(): string | null {
  const m = /^#\/unit\/(.+)$/.exec(window.location.hash || '');
  return m ? decodeURIComponent(m[1]) : null;
}

export default function UnitDashboard() {
  const { data, ready, error } = useOpsData();
  const id = hashUnitId();

  const unit = useMemo(
    () => (ready && id ? data.get<Unit>('units', id) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, id, data.meta().updatedAt]
  );

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading unit</div></div></div>;
  if (!unit) return <div className="p4"><div className="empty-state">Unit not found. <a href="#/console" style={{ color: 'var(--accent)' }}>Back to the console</a>.</div></div>;

  const col = unitColor(unit.type);
  const client = unit.clientId ? data.get<Client>('clients', unit.clientId) : null;
  const stock = data.stockForUnit(unit.id);
  const lowStock = stock.filter((s) => Number(s.qty) < Number(s.par));
  const events = data.eventsForUnit(unit.id);
  const assignments = data.all<import('../data/types').Assignment>('assignments').filter((a) => a.unitId === unit.id);
  const tasks = data.tasksForUnit(unit.id);

  return (
    <div className="p4" style={{ ['--uc' as string]: col, maxWidth: 1080 }}>
      {/* profile header */}
      <div className="unit-card" style={{ ['--uc' as string]: col, marginBottom: 16 }}>
        <div className="ev-head">
          <span className="ev-swatch" style={{ color: col }} />
          <span className="chip unit-type-chip">{unit.type}</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700 }}>{unit.code} · {unit.name}</span>
          <span className="row-inline" style={{ marginLeft: 'auto' }}>
            <a className="btn btn-ghost btn-sm" href={`#/console/${unit.clientId}`} style={{ textDecoration: 'none' }}>Console</a>
          </span>
        </div>
        {unit.desc && <div className="unit-desc">{unit.desc}</div>}
        <div className="ev-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="ev-field"><div className="ev-label">Area</div><div className="fv">{data.areaOfUnit(unit)}</div></div>
          <div className="ev-field"><div className="ev-label">Crew target</div><div className="fv mono">{unit.crew}</div></div>
          <div className="ev-field"><div className="ev-label">Operator</div><div className="fv">{client?.name || '—'}</div></div>
          <div className="ev-field"><div className="ev-label">Stock</div><div className="fv mono">{stock.length}{lowStock.length ? ` · ${lowStock.length} low` : ''}</div></div>
        </div>
      </div>

      {/* AI analysis */}
      <AIPanel data={data} unit={unit} />

      {/* checklists */}
      <div className="toolbar" style={{ marginTop: 8 }}><h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>Checklists</h2></div>
      <div className="unit-grid">
        {CHECKLIST_KINDS.map((kind) => (
          <ChecklistCard key={kind} data={data} unit={unit} kind={kind} />
        ))}
      </div>

      {/* linked data */}
      <div className="hub-grid" style={{ marginTop: 18 }}>
        <div>
          <section className="card">
            <div className="card-head"><div className="card-title">Assigned stock</div><a className="btn btn-ghost btn-sm" href="#/stock" style={{ textDecoration: 'none' }}>Stock</a></div>
            {stock.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>No stock lines on this unit.</div> :
              stock.map((s) => (
                <div className="ov-ev" key={s.id}>
                  <span className="ov-ev-name">{s.item}</span>
                  <span className="mono ov-ev-date" style={{ color: Number(s.qty) < Number(s.par) ? 'var(--warn)' : 'var(--ink-3)' }}>{s.qty}/{s.par} {s.unit || ''}</span>
                  {Number(s.qty) < Number(s.par) && <span className="chip chip-amber">low</span>}
                </div>
              ))}
          </section>

          <section className="card" style={{ marginTop: 16 }}>
            <div className="card-head"><div className="card-title">Linked events</div></div>
            {events.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>Not attending any events.</div> :
              events.map((e: EventRec) => (
                <a className="ov-ev" key={e.id} href={`#/event/${e.id}`} style={{ ['--evc' as string]: data.eventColor(e.id), textDecoration: 'none' }}>
                  <span className="ev-swatch" style={{ color: data.eventColor(e.id) }} />
                  <span className="ov-ev-name">{e.name}</span>
                  <span className="mono ov-ev-date">{fmt(e.start)}</span>
                </a>
              ))}
          </section>
        </div>

        <div>
          <section className="card">
            <div className="card-head"><div className="card-title">Linked staff</div></div>
            {assignments.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>No crew assigned to this unit.</div> :
              assignments.map((a) => {
                const s = data.get<Staff>('staff', a.staffId);
                const e = data.get<EventRec>('events', a.eventId);
                return (
                  <div className="ov-ev" key={a.id}>
                    <span className="ov-ev-name">{s?.name ?? a.staffId}</span>
                    <span className="mono ov-ev-date">{e?.name ?? ''}</span>
                    <span className={`chip ${a.confirmed ? 'chip-green' : 'chip-amber'}`}>{a.confirmed ? 'confirmed' : 'pending'}</span>
                  </div>
                );
              })}
          </section>

          <TasksCard data={data} unit={unit} tasks={tasks} />
          <EventTasksCard data={data} events={events} />
        </div>
      </div>
    </div>
  );
}

/* ---- read-only view of run-sheet tasks from this unit's linked events ---- */
function EventTasksCard({ data, events }: { data: ReturnType<typeof useOpsData>['data']; events: EventRec[] }) {
  const rows = events.flatMap((e) =>
    data.tasksForEvent(e.id).map((t) => ({ t, eventName: e.name, eventId: e.id }))
  );
  if (rows.length === 0) return null;
  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="card-head">
        <div className="card-title">Event run-sheet tasks</div>
        <a className="btn btn-ghost btn-sm" href="#/tasks" style={{ textDecoration: 'none' }}>Tasks</a>
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>From this unit's linked events (read-only — manage on the event).</div>
      {rows.slice(0, 12).map(({ t, eventName, eventId }) => (
        <a className="ov-ev" key={t.id} href={`#/event/${eventId}`} style={{ textDecoration: 'none', ['--evc' as string]: data.eventColor(eventId) }}>
          <span className={`chip ${t.done ? 'chip-green' : 'chip-amber'}`}>{t.done ? 'done' : 'open'}</span>
          <span className="ov-ev-name" style={t.done ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : undefined}>{t.title}</span>
          <span className="mono ov-ev-date" style={{ color: 'var(--ink-3)' }}>{eventName}</span>
        </a>
      ))}
    </section>
  );
}

/* ---- AI analysis panel ---- */
const aiModelAvailable = () => typeof (window as any).claude?.complete === 'function';

function AIPanel({ data, unit }: { data: ReturnType<typeof useOpsData>['data']; unit: Unit }) {
  const history = data.insightsForUnit(unit.id);   // newest first — full analysis trend
  const insight = history[0] || null;
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  // Live deterministic scores/insights so the panel is populated even before a run.
  const live = useMemo(() => {
    const ctx = gatherUnitContext(data, unit.id);
    return ctx ? { scores: scoreUnit(ctx), insights: ruleInsights(ctx) } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.meta().updatedAt, unit.id]);

  const health = insight?.healthScore ?? live?.scores.health ?? 0;
  const readiness = insight?.readinessScore ?? live?.scores.readiness ?? 0;
  const chips = insight?.insights?.length ? insight.insights : (live?.insights ?? []);
  const summary = tab === 'daily' ? insight?.summaryDaily : tab === 'weekly' ? insight?.summaryWeekly : insight?.summaryMonthly;
  const modelOffline = !aiModelAvailable();

  async function run() {
    setBusy(true);
    try {
      // Append a new insights row each refresh so score/insight history is kept.
      const result = await analyzeUnit(data, unit.id);
      if (result) await data.save<Partial<import('../data/types').UnitInsight>>('unitInsights', result);
    } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ marginBottom: 16, background: 'linear-gradient(135deg, color-mix(in oklch, var(--accent-2) 12%, transparent), color-mix(in oklch, var(--accent) 7%, transparent))' }}>
      <div className="card-head">
        <div className="card-title">AI analysis</div>
        <span className="row-inline">
          {modelOffline && <span className="chip chip-amber" title="window.claude is unavailable here; summaries fall back to rule-based text. Scores and insight chips are always computed from live data.">AI model offline · rule-based</span>}
          {insight?.generatedAt && <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>updated {new Date(insight.generatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
          <button className="btn btn-primary btn-sm" onClick={run} disabled={busy}>{busy ? 'Analysing…' : insight ? 'Refresh' : 'Analyse unit'}</button>
        </span>
      </div>
      <div className="row-inline" style={{ gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <Gauge label="Health" value={health} />
        <Gauge label="Readiness" value={readiness} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="row-inline" style={{ flexWrap: 'wrap', gap: 6 }}>
            {chips.map((c, i) => (
              <span key={i} className={`chip ${TONE_CHIP[c.tone] || 'chip-blue'}`} title={c.detail || ''}>{c.title}</span>
            ))}
          </div>
        </div>
      </div>
      {history.length > 1 && <ScoreTrend history={history} />}
      {(insight?.summaryDaily || insight?.summaryWeekly || insight?.summaryMonthly) && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--panel-line)' }}>
          <div className="segmented" style={{ marginBottom: 8 }}>
            {(['daily', 'weekly', 'monthly'] as const).map((t) => (
              <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-2)' }}>{summary || 'No summary for this period.'}</div>
        </div>
      )}
      {!insight && <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>Scores and insight chips are computed from the unit's live data. Run analysis for AI-written daily/weekly/monthly summaries (works without the model too — it falls back to a rules-based summary).</div>}
    </div>
  );
}

/* ---- score history sparklines (health + readiness over each analysis) ---- */
function ScoreTrend({ history }: { history: import('../data/types').UnitInsight[] }) {
  // Oldest → newest, capped to the last 12 runs.
  const runs = [...history].reverse().slice(-12);
  const line = (key: 'healthScore' | 'readinessScore', col: string) => {
    const pts = runs.map((r, i) => {
      const x = runs.length > 1 ? (i / (runs.length - 1)) * 100 : 0;
      const y = 30 - (Math.max(0, Math.min(100, r[key] ?? 0)) / 100) * 28;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return <polyline points={pts} fill="none" stroke={col} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />;
  };
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--panel-line)' }}>
      <div className="row-inline" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Score trend · last {runs.length}</span>
        <span className="row-inline" style={{ gap: 10, fontSize: 10.5 }}>
          <span style={{ color: 'var(--ok)' }}>● Health</span>
          <span style={{ color: 'var(--accent-2)' }}>● Readiness</span>
        </span>
      </div>
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ width: '100%', height: 42, overflow: 'visible' }} aria-label="Score history">
        {line('healthScore', 'var(--ok)')}
        {line('readinessScore', 'var(--accent-2)')}
      </svg>
    </div>
  );
}

function Gauge({ label, value }: { label: string; value: number }) {
  const col = value >= 80 ? 'var(--ok)' : value >= 50 ? 'var(--warn)' : 'var(--danger)';
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ position: 'relative', width: 72, height: 72 }}>
        <div aria-hidden style={{
          width: 72, height: 72, borderRadius: '50%',
          background: `conic-gradient(${col} ${value * 3.6}deg, var(--inset) 0deg)`,
          mask: 'radial-gradient(circle, transparent 58%, black 59%)',
          WebkitMask: 'radial-gradient(circle, transparent 58%, black 59%)',
        }} />
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          <span className="mono" style={{ fontSize: 16, fontWeight: 700, color: col }}>{value}</span>
        </div>
      </div>
      <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 2 }}>{label}</div>
    </div>
  );
}

/* ---- one interactive checklist ---- */
function ChecklistCard({ data, unit, kind }: { data: ReturnType<typeof useOpsData>['data']; unit: Unit; kind: ChecklistKind }) {
  const list = data.unitChecklist(unit.id, kind);
  const items = list?.items || [];
  const [newLabel, setNewLabel] = useState('');
  const done = items.filter((i) => i.on).length;

  async function persist(next: UnitChecklistItem[]) {
    await data.save<Partial<UnitChecklist>>('unitChecklists', { id: list?.id, unitId: unit.id, kind, items: next });
  }
  async function toggle(itemId: string) { await persist(items.map((i) => (i.id === itemId ? { ...i, on: !i.on } : i))); }
  async function add() {
    if (!newLabel.trim()) return;
    setNewLabel('');
    await persist([...items, { id: `i${Date.now().toString(36)}`, label: newLabel.trim(), on: false }]);
  }
  async function seed() { await persist(seedItems(unit.type, kind)); }

  return (
    <div className="unit-card" style={{ ['--uc' as string]: unitColor(unit.type) }}>
      <div className="ev-head">
        <span className="chip unit-type-chip">{KIND_LABEL[kind]}</span>
        <span className="mono" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-3)' }}>{items.length ? `${done}/${items.length}` : ''}</span>
      </div>
      {items.length > 0 && (
        <div className="unit-check" style={{ marginTop: 8 }}>
          <div className="unit-check-bar"><div style={{ width: `${(done / items.length) * 100}%` }} /></div>
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        {items.length === 0 ? (
          <button className="btn btn-sm" onClick={seed}>Seed default {KIND_LABEL[kind].toLowerCase()} list</button>
        ) : items.map((it) => (
          <div className="ud-item" key={it.id} data-on={it.on}>
            <button className="ud-tick" aria-pressed={it.on} aria-label={`Toggle ${it.label}`} onClick={() => toggle(it.id)}>{it.on ? '✓' : ''}</button>
            <span className="ud-label">{it.label}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => persist(items.filter((x) => x.id !== it.id))}>×</button>
          </div>
        ))}
      </div>
      {items.length > 0 && (
        <div className="row-inline" style={{ marginTop: 8 }}>
          <input className="inp" placeholder="Add item" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          <button className="btn btn-primary btn-sm" onClick={add} disabled={!newLabel.trim()}>Add</button>
        </div>
      )}
    </div>
  );
}

/* ---- unit tasks ---- */
function TasksCard({ data, unit, tasks }: { data: ReturnType<typeof useOpsData>['data']; unit: Unit; tasks: Task[] }) {
  const [title, setTitle] = useState('');
  async function add() {
    if (!title.trim()) return;
    setTitle('');
    await data.save<Partial<Task>>('tasks', { unitId: unit.id, clientId: unit.clientId, title: title.trim(), status: 'open' });
  }
  async function cycle(t: Task) {
    const next = TASK_STATUSES[(TASK_STATUSES.indexOf(t.status) + 1) % TASK_STATUSES.length] as TaskStatus;
    await data.save<Partial<Task>>('tasks', { id: t.id, status: next });
  }
  const chip: Record<TaskStatus, string> = { open: 'chip-amber', doing: 'chip-blue', done: 'chip-green' };
  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="card-head"><div className="card-title">Unit tasks</div><a className="btn btn-ghost btn-sm" href="#/tasks" style={{ textDecoration: 'none' }}>All tasks</a></div>
      {tasks.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>No tasks for this unit.</div> :
        tasks.map((t) => (
          <div className="ov-ev" key={t.id}>
            <button className={`chip ${chip[t.status]}`} style={{ cursor: 'pointer', font: 'inherit' }} onClick={() => cycle(t)} title="Advance status">{t.status}</button>
            <span className="ov-ev-name" style={t.status === 'done' ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : undefined}>{t.title}</span>
            {t.due && <span className="mono ov-ev-date">{fmt(t.due)}</span>}
            <button className="btn btn-ghost btn-sm" onClick={() => data.remove('tasks', t.id)}>×</button>
          </div>
        ))}
      <div className="row-inline" style={{ marginTop: 10 }}>
        <input className="inp" placeholder="Add a task for this unit" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button className="btn btn-primary btn-sm" onClick={add} disabled={!title.trim()}>Add</button>
      </div>
    </section>
  );
}
