/* Event Dashboard — #/event/<id>. One page that aggregates everything the
   system knows about a single event: units on site, crew + confirmations,
   readiness (tasks), stock risk, movements, timesheets and money. Every
   timeline bar, register row and overview button lands here; every section
   links onward to the tab where the work happens. */
import { useMemo } from 'react';
import { useOpsData } from '../data/useOpsData';
import type { EventRec, Unit, Staff, Assignment, Movement } from '../data/types';
import { eventStatus } from '../components/console/eventStatus';
import { unitColor } from '../components/console/unitTheme';
import { eventRollup, generateResearch } from '../data/phase12';
import { prepPanel, unitCompliance } from '../data/phase13';

const fmt = (iso?: string) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : 'TBC';
const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function hashEventId(): string | null {
  const m = /^#\/event\/(.+)$/.exec(window.location.hash || '');
  return m ? decodeURIComponent(m[1]) : null;
}

export default function EventDashboard() {
  const { data, ready, error } = useOpsData();
  const id = hashEventId();

  const e = useMemo(
    () => (ready && id ? data.get<EventRec>('events', id) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, id, data.meta().updatedAt]
  );

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading event</div></div></div>;
  if (!e) {
    return (
      <div className="p4">
        <div className="empty-state">
          Event not found. <a href="#/events" style={{ color: 'var(--accent)' }}>Back to the register</a>.
        </div>
      </div>
    );
  }

  const col = data.eventColor(e.id);
  const st = eventStatus(e);
  const roll = eventRollup(data, e);
  const units = data.unitsForEvent(e);
  const assignments = data.assignmentsForEvent(e.id);
  const movements = data.movementsForEvent(e.id);
  const tasks = data.tasksForEvent(e.id);
  const staffOk = roll.crewTarget > 0 && roll.crewAssigned >= roll.crewTarget;
  const prep = prepPanel(data, e);
  const unitTypes = [...new Set(units.map((u) => u.type))];

  return (
    <div className="p4" style={{ ['--uc' as string]: col }}>
      {/* header */}
      <div className="ev-card" style={{ borderLeft: `3px solid ${col}`, marginBottom: 16 }}>
        <div className="ev-head">
          <span className="ev-swatch" style={{ color: col }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700 }}>{e.name}</span>
          <span className="status-pill" data-kind={st.kind}>{st.label}</span>
          <span className="row-inline" style={{ marginLeft: 'auto' }}>
            <a className="btn btn-ghost btn-sm" href="#/events" style={{ textDecoration: 'none' }}>Register</a>
            <a className="btn btn-primary btn-sm" href={`#/console/${e.clientId}`} style={{ textDecoration: 'none' }}>Open console</a>
          </span>
        </div>
        <div className="ev-grid">
          <div className="ev-field">
            <div className="ev-label">Dates</div>
            <div className="fv mono">{fmt(e.start)}{e.end && e.end !== e.start ? ` – ${fmt(e.end)}` : ''}</div>
            <div className="fs">{e.callTime ? `Crew call ${e.callTime}` : `${(e.schedule || []).length} scheduled days`}</div>
          </div>
          <div className="ev-field">
            <div className="ev-label">Location</div>
            <div className="fv">{e.loc || 'TBC'}</div>
            {e.notes && <div className="fs">{e.notes}</div>}
          </div>
          <div className="ev-field">
            <div className="ev-label">Crew</div>
            <div className="fv mono" style={{ color: staffOk ? 'var(--ok)' : 'var(--warn)' }}>{roll.crewAssigned} / {roll.crewTarget}</div>
            <div className="fs">{roll.confirmed} confirmed</div>
          </div>
          <div className="ev-field">
            <div className="ev-label">Money</div>
            <div className="fv mono">{gbp(roll.invoiced)}</div>
            <div className="fs">{gbp(roll.expenses)} expenses · <a href="#/finance" style={{ color: 'var(--accent)' }}>Finance</a></div>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="kpi-row">
        <div className="kpi-chip">
          <div className="k">Readiness</div>
          <div className="v" style={{ color: prep.blocked ? 'var(--neon-pink)' : prep.score >= 100 ? 'var(--ok)' : 'var(--neon-cyan)' }}>
            {prep.blocked ? 'BLOCKED' : `${prep.score}%`}
          </div>
        </div>
        <div className="kpi-chip"><div className="k">Units</div><div className="v" style={{ color: 'var(--neon-pink)' }}>{roll.units}</div></div>
        <div className="kpi-chip"><div className="k">Stock low</div><div className="v" style={{ color: roll.stockLow ? 'var(--neon-yellow)' : 'var(--ink-3)' }}>{roll.stockLow}</div></div>
        <div className="kpi-chip"><div className="k">Tasks</div><div className="v" style={{ color: roll.tasksOpen ? 'var(--neon-cyan)' : 'var(--ink-3)' }}>{roll.tasksDone}/{roll.tasksDone + roll.tasksOpen}</div></div>
        <div className="kpi-chip"><div className="k">Movements</div><div className="v" style={{ color: 'var(--neon-blue)' }}>{roll.movements}</div></div>
        <div className="kpi-chip"><div className="k">Timesheets</div><div className="v" style={{ color: 'var(--neon-green)' }}>{roll.timesheets}</div></div>
      </div>

      <div className="hub-grid">
        <div>
          {/* units on site */}
          <section className="card">
            <div className="card-head">
              <div className="card-title">Units on site</div>
              <a className="btn btn-ghost btn-sm" href="#/console" style={{ textDecoration: 'none' }}>Manage</a>
            </div>
            {units.length === 0 ? (
              <div className="empty-state">No units allocated — the client's whole fleet attends by default once units exist.</div>
            ) : units.map((u: Unit) => {
              const uc = unitColor(u.type);
              const crew = assignments.filter((a) => a.unitId === u.id);
              const cl = u.checklist || [];
              const done = cl.filter((c) => c.on).length;
              return (
                <div className="ov-ev" key={u.id} style={{ ['--evc' as string]: uc }}>
                  <span className="ev-swatch" style={{ color: uc }} />
                  <span className="ov-ev-name">{u.code} · {u.name}</span>
                  <span className="mono ov-ev-date">{crew.length}/{u.crew} crew</span>
                  <span className="mono ov-ev-date">{cl.length ? `${done}/${cl.length} checks` : 'no checklist'}</span>
                </div>
              );
            })}
          </section>

          {/* crew */}
          <section className="card" style={{ marginTop: 16 }}>
            <div className="card-head">
              <div className="card-title">Crew</div>
              <a className="btn btn-ghost btn-sm" href="#/timesheets" style={{ textDecoration: 'none' }}>Timesheets</a>
            </div>
            {assignments.length === 0 ? (
              <div className="empty-state">No crew assigned yet — staff this event in the Console's Staffing tab.</div>
            ) : assignments.map((a: Assignment) => {
              const s = data.get<Staff>('staff', a.staffId);
              const u = data.get<Unit>('units', a.unitId);
              return (
                <div className="ov-ev" key={a.id} style={{ ['--evc' as string]: unitColor(u?.type) }}>
                  <span className="ov-ev-name">{s?.name ?? a.staffId}{s?.staffNo ? <span className="mono" style={{ color: 'var(--ink-3)', fontSize: 11 }}> · #{s.staffNo}</span> : null}</span>
                  <span className="mono ov-ev-date">{u?.code ?? '—'}{a.area ? ` · ${a.area}` : ''}</span>
                  <span className={`chip ${a.confirmed ? 'chip-green' : 'chip-amber'}`}>{a.confirmed ? 'confirmed' : 'pending'}</span>
                </div>
              );
            })}
          </section>
        </div>

        <div>
          {/* readiness rollup — the prep panel score per section */}
          <section className="card">
            <div className="card-head">
              <div className="card-title">Readiness</div>
              <a className="btn btn-ghost btn-sm" href="#/readiness" style={{ textDecoration: 'none' }}>Prep panel</a>
            </div>
            {prep.blocked && (
              <div className="comp-issues" style={{ marginBottom: 8 }}>
                {prep.blockers.slice(0, 3).map((b, i) => <div className="bad" key={i} style={{ fontSize: 12.5, padding: '2px 0' }}>⛔ {b}</div>)}
              </div>
            )}
            <div className="row-inline" style={{ flexWrap: 'wrap', gap: 6 }}>
              {prep.sections.map((s) => (
                <a key={s.key} href={s.link} className={`chip ${s.done ? 'chip-green' : s.pct >= 60 ? 'chip-blue' : 'chip-amber'}`}
                  style={{ textDecoration: 'none', fontSize: 11 }} title={s.items.join(' · ') || 'Nothing outstanding'}>
                  {s.label} {s.pct}%
                </a>
              ))}
            </div>
          </section>

          {/* per-unit compliance status */}
          <section className="card" style={{ marginTop: 16 }}>
            <div className="card-head">
              <div className="card-title">Unit compliance</div>
              <a className="btn btn-ghost btn-sm" href="#/compliance" style={{ textDecoration: 'none' }}>Compliance</a>
            </div>
            {units.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>No units allocated.</div>
            ) : units.map((u) => {
              const uc = unitCompliance(u);
              return (
                <div className="ov-ev" key={u.id} style={{ ['--evc' as string]: unitColor(u.type) }}>
                  <span className="ev-swatch" style={{ color: unitColor(u.type) }} />
                  <span className="ov-ev-name">{u.code}</span>
                  <span className="mono ov-ev-date">{uc.done}/{uc.total} safety & docs</span>
                  <span className={`chip ${uc.rag === 'green' ? 'chip-green' : uc.rag === 'amber' ? 'chip-amber' : 'chip-red'}`}>
                    {uc.rag === 'red' ? `${uc.requiredOpen} required` : uc.rag === 'amber' ? 'open items' : 'clear'}
                  </span>
                </div>
              );
            })}
          </section>

          {/* stock research — suggested carry per unit purpose */}
          {unitTypes.length > 0 && (
            <section className="card" style={{ marginTop: 16 }}>
              <div className="card-head">
                <div className="card-title">Stock research</div>
                <a className="btn btn-ghost btn-sm" href="#/stock" style={{ textDecoration: 'none' }}>Shopping lists</a>
              </div>
              {unitTypes.map((t) => (
                <div key={t} style={{ marginBottom: 8 }}>
                  <div className="ev-label" style={{ marginBottom: 4, color: unitColor(t) }}>{t}</div>
                  <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                    {generateResearch(t).stock.join(' · ')}
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* tasks */}
          <section className="card" style={{ marginTop: 16 }}>
            <div className="card-head">
              <div className="card-title">Tasks</div>
              <a className="btn btn-ghost btn-sm" href="#/tasks" style={{ textDecoration: 'none' }}>All tasks</a>
            </div>
            {tasks.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>No tasks for this event.</div>
            ) : tasks.slice(0, 8).map((t) => (
              <div className="ov-ev" key={t.id}>
                <span className={`chip ${t.done ? 'chip-green' : 'chip-blue'}`}>{t.category}</span>
                <span className="ov-ev-name" style={t.done ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : undefined}>{t.title}</span>
                {t.dueDate && <span className="mono ov-ev-date">{fmt(t.dueDate)}</span>}
              </div>
            ))}
          </section>

          {/* movements */}
          <section className="card" style={{ marginTop: 16 }}>
            <div className="card-head">
              <div className="card-title">Movements</div>
              <a className="btn btn-ghost btn-sm" href="#/logistics" style={{ textDecoration: 'none' }}>Logistics</a>
            </div>
            {movements.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>No vehicle movements planned.</div>
            ) : movements.map((m: Movement) => {
              const u = m.unitId ? data.get<Unit>('units', m.unitId) : null;
              const drv = data.get<Staff>('staff', m.driverId);
              return (
                <div className="ov-ev" key={m.id}>
                  <span className="mono ov-ev-date">{u ? (u.code || u.type) : 'VAN'}</span>
                  <span className="ov-ev-name">{drv?.name ?? '—'}</span>
                  <span className="mono ov-ev-date">{m.departDate ? fmt(m.departDate) : 'TBC'} {m.departTime || ''}</span>
                  <span className="chip chip-blue">{m.status}</span>
                </div>
              );
            })}
          </section>

          {/* schedule */}
          {(e.schedule || []).length > 0 && (
            <section className="card" style={{ marginTop: 16 }}>
              <div className="card-head"><div className="card-title">Schedule</div></div>
              {(e.schedule || []).map((d0) => (
                <div className="ov-ev" key={d0.id}>
                  <span className="mono ov-ev-date">{fmt(d0.date)}</span>
                  <span className="ov-ev-name">{d0.phase}</span>
                  {(d0.open || d0.close) && <span className="mono ov-ev-date">{d0.open || ''}–{d0.close || ''}</span>}
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
