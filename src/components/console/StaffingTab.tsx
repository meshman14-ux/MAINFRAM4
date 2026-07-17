import { useMemo, useState } from 'react';
import type { OpsData } from '../../data/opsData';
import type { EventRec, Unit, Assignment } from '../../data/types';

interface Props { data: OpsData; clientId: string; }

export function StaffingTab({ data, clientId }: Props) {
  const events = useMemo(
    () => data.eventsForClient(clientId).sort((a, b) => (a.start || '').localeCompare(b.start || '')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.meta().updatedAt, clientId]
  );
  const [eventId, setEventId] = useState('');
  const activeId = eventId || events[0]?.id || '';
  const event = events.find((e) => e.id === activeId) || null;

  if (events.length === 0) {
    return <div className="empty-state">No events yet — create an event to staff it.</div>;
  }

  return (
    <div>
      <div className="toolbar">
        <h2>Staffing</h2>
        <select className="sel" style={{ width: 'auto' }} value={activeId} onChange={(e) => setEventId(e.target.value)}>
          {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
      {event && <EventStaffing data={data} event={event} />}
    </div>
  );
}

function EventStaffing({ data, event }: { data: OpsData; event: EventRec }) {
  const units = data.unitsForEvent(event);
  const need = data.staffingFor(event);
  const totalNeed = Object.values(need).reduce((n, v) => n + v, 0);
  const assigns = data.assignmentsForEvent(event.id);

  return (
    <div>
      <div className="mono" style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 14 }}>
        {assigns.length}/{totalNeed} booked · {assigns.filter((a) => a.confirmed).length} confirmed ·{' '}
        {Object.entries(need).filter(([, v]) => v > 0).map(([a, v]) => `${a} ${v}`).join(' · ')}
      </div>

      <div className="staffing-grid">
        {units.map((u) => (
          <UnitStaffing key={u.id} data={data} event={event} unit={u} />
        ))}
      </div>
    </div>
  );
}

function UnitStaffing({ data, event, unit }: { data: OpsData; event: EventRec; unit: Unit }) {
  const [picking, setPicking] = useState(false);
  const area = data.areaOfUnit(unit);
  const target = unit.crew || 0;
  const unitAssigns = data.assignmentsForEvent(event.id).filter((a) => a.unitId === unit.id);
  const gap = Math.max(0, target - unitAssigns.length);

  async function assign(staffId: string) {
    await data.save<Partial<Assignment>>('assignments', {
      eventId: event.id, unitId: unit.id, staffId, area, confirmed: false,
    });
    setPicking(false);
  }
  async function unassign(a: Assignment) {
    await data.remove('assignments', a.id);
  }
  async function toggleConfirm(a: Assignment) {
    await data.save<Partial<Assignment>>('assignments', { id: a.id, confirmed: !a.confirmed });
  }

  // Candidates ranked by suitability, excluding already-assigned.
  const assignedIds = new Set(unitAssigns.map((a) => a.staffId));
  const candidates = data.suitableForUnit(unit, { event })
    .filter((c) => !assignedIds.has(c.id));

  return (
    <div className="unit-col">
      <h3>{unit.code} <span className="chip chip-blue" style={{ fontSize: 10 }}>{area}</span></h3>
      <div className="unit-sub">{unit.name} · target {target} {gap > 0 && <span className="gap-tag">· {gap} gap</span>}</div>

      {unitAssigns.map((a) => {
        const s = data.get<{ name: string; role: string }>('staff', a.staffId);
        return (
          <div className="slot" key={a.id}>
            <span className="who">
              <span className="nm">{s?.name}</span>
              <span className="rl">{s?.role}</span>
            </span>
            <div className="row-inline">
              <button
                className={`btn btn-sm ${a.confirmed ? 'chip-green' : ''}`}
                onClick={() => toggleConfirm(a)}
                style={a.confirmed ? { color: 'var(--green)' } : undefined}
              >{a.confirmed ? '✓' : 'confirm'}</button>
              <button className="btn btn-danger btn-sm" onClick={() => unassign(a)}>×</button>
            </div>
          </div>
        );
      })}

      {Array.from({ length: gap }).map((_, i) => (
        <div className="slot slot-empty" key={`gap-${i}`}>
          <span>Open slot</span>
          <button className="btn btn-sm btn-primary" onClick={() => setPicking(true)}>+ assign</button>
        </div>
      ))}

      {picking && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--panel-line)', paddingTop: 10 }}>
          <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 6 }}>
            RANKED CANDIDATES
          </div>
          {candidates.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>No available crew.</div>
          ) : (
            candidates.slice(0, 8).map((c) => (
              <div className="cand" key={c.id} data-blocked={c.blocked}>
                <span className="who">
                  <span className="nm">{c.name}</span>
                  {c.reasons.length > 0 && <span className="reasons">{c.reasons.join(' · ')}</span>}
                </span>
                <div className="row-inline">
                  <span className="score">{c.score}</span>
                  <button
                    className="btn btn-sm"
                    onClick={() => assign(c.id)}
                    disabled={c.blocked}
                    title={c.blocked ? 'Blocked: ' + c.reasons.join(', ') : 'Assign'}
                  >add</button>
                </div>
              </div>
            ))
          )}
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setPicking(false)}>Close</button>
        </div>
      )}
    </div>
  );
}
