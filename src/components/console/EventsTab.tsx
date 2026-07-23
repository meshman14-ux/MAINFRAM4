import { useMemo, useState } from 'react';
import type { OpsData } from '../../data/opsData';
import type { EventRec, ScheduleDay } from '../../data/types';
import { eventStatus } from './eventStatus';

interface Props { data: OpsData; clientId: string; }

const PHASES = [
  'Travel / Transit', 'Arrival & Pitch', 'Build / Set-up', 'Prep / Briefing',
  'Trading Day', 'Restock', 'Breakdown / De-rig', 'Load-out', 'Deep Clean', 'Day Off',
];

const blankEvent = (clientId: string): Partial<EventRec> => ({
  clientId, name: '', loc: '', start: '', end: '', callTime: '', notes: '',
});

export function EventsTab({ data, clientId }: Props) {
  const events = useMemo(
    () => data.eventsForClient(clientId).sort((a, b) => (a.start || '').localeCompare(b.start || '')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.meta().updatedAt, clientId]
  );
  const [editing, setEditing] = useState<Partial<EventRec> | null>(null);

  async function saveEvent(e: Partial<EventRec>) {
    await data.save('events', e);
    setEditing(null);
  }
  async function del(id: string) {
    if (confirm('Delete this event and its assignments?')) await data.remove('events', id);
  }
  function exportIcs() {
    const ics = buildIcs(events);
    downloadText(`${clientId}-events.ics`, ics, 'text/calendar');
  }

  return (
    <div>
      <div className="toolbar">
        <h2>Events</h2>
        <div className="row-inline">
          <button className="btn btn-sm" onClick={exportIcs} disabled={!events.length}>Export .ics</button>
          <button className="btn btn-primary btn-sm" onClick={() => setEditing(blankEvent(clientId))}>+ New event</button>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="empty-state">No events yet. Create the first one.</div>
      ) : (
        events.map((e) => {
          const col = data.eventColor(e.id);
          const st = eventStatus(e);
          const assigned = data.assignmentsForEvent(e.id).length;
          const target = Object.values(data.staffingFor(e)).reduce((n, v) => n + v, 0);
          const staffOk = target > 0 && assigned >= target;
          return (
            <div className="ev-card" key={e.id} style={{ borderLeft: `3px solid ${col}` }}>
              <div className="ev-head">
                <span className="ev-swatch" style={{ color: col }} />
                <span className="ev-name">{e.name}</span>
                <span className="status-pill" data-kind={st.kind}>{st.label}</span>
                <span className="row-inline" style={{ marginLeft: 'auto' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(e)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => del(e.id)}>Del</button>
                </span>
              </div>
              <div className="ev-grid">
                <div className="ev-field">
                  <div className="ev-label">Dates</div>
                  <div className="fv mono">{fmt(e.start)}{e.end && e.end !== e.start ? `–${fmt(e.end)}` : ''}</div>
                  <div className="fs">{e.callTime ? `Crew call ${e.callTime}` : `${(e.schedule || []).length} scheduled days`}</div>
                </div>
                <div className="ev-field">
                  <div className="ev-label">Location</div>
                  <div className="fv">{e.loc || '—'}</div>
                  {e.notes && <div className="fs">{e.notes}</div>}
                </div>
                <div className="ev-field">
                  <div className="ev-label">Units on site</div>
                  <div className="fv mono">{data.unitsForEvent(e).length}</div>
                  <div className="fs">{(e.schedule || []).length} schedule days</div>
                </div>
                <div className="ev-field">
                  <div className="ev-label">Staff</div>
                  <div className="fv mono" style={{ color: staffOk ? 'var(--ok)' : 'var(--warn)' }}>
                    {assigned} / {target}
                  </div>
                  <div className="fs">{staffOk ? 'fully staffed' : 'assigned / target'}</div>
                </div>
              </div>
            </div>
          );
        })
      )}

      {editing && (
        <EventEditor
          value={editing}
          onCancel={() => setEditing(null)}
          onSave={saveEvent}
        />
      )}
    </div>
  );
}

function EventEditor({
  value, onCancel, onSave,
}: { value: Partial<EventRec>; onCancel: () => void; onSave: (e: Partial<EventRec>) => void }) {
  const [e, setE] = useState<Partial<EventRec>>({ ...value });
  const set = (k: keyof EventRec, v: unknown) => setE((p) => ({ ...p, [k]: v }));

  // Auto-fill schedule days from the date range.
  function autofillDays() {
    if (!e.start) return;
    const out: ScheduleDay[] = [];
    const start = new Date(e.start + 'T00:00:00');
    const end = new Date((e.end || e.start) + 'T00:00:00');
    let i = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      out.push({ id: `d${++i}`, date: iso, phase: 'Trading Day', note: '' });
    }
    set('schedule', out);
  }

  const sched = e.schedule || [];

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="card-head"><div className="card-title">{e.id ? 'Edit event' : 'New event'}</div></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label>Name<input className="inp" value={e.name || ''} onChange={(ev) => set('name', ev.target.value)} /></label>
        <label>Location<input className="inp" value={e.loc || ''} onChange={(ev) => set('loc', ev.target.value)} /></label>
        <label>Start<input className="inp" type="date" value={e.start || ''} onChange={(ev) => set('start', ev.target.value)} /></label>
        <label>End<input className="inp" type="date" value={e.end || ''} onChange={(ev) => set('end', ev.target.value)} /></label>
        <label>Crew call<input className="inp" type="time" value={e.callTime || ''} onChange={(ev) => set('callTime', ev.target.value)} /></label>
        <label>Notes<input className="inp" value={e.notes || ''} onChange={(ev) => set('notes', ev.target.value)} /></label>
      </div>

      <div className="toolbar" style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 15 }}>Schedule builder</h2>
        <button className="btn btn-sm" onClick={autofillDays} disabled={!e.start}>Auto-fill days from dates</button>
      </div>
      {sched.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>No days yet — set dates and auto-fill, or they'll be added later.</div>
      ) : (
        <div>
          {sched.map((day, idx) => (
            <div className="sched-day" key={day.id}>
              <span className="d">{fmt(day.date)}</span>
              <select className="sel" value={day.phase} onChange={(ev) => {
                const next = [...sched]; next[idx] = { ...day, phase: ev.target.value }; set('schedule', next);
              }}>
                {PHASES.map((p) => <option key={p}>{p}</option>)}
              </select>
              <input className="inp" placeholder="open" value={day.open || ''} onChange={(ev) => {
                const next = [...sched]; next[idx] = { ...day, open: ev.target.value }; set('schedule', next);
              }} />
              <input className="inp" placeholder="close" value={day.close || ''} onChange={(ev) => {
                const next = [...sched]; next[idx] = { ...day, close: ev.target.value }; set('schedule', next);
              }} />
              <input className="inp" placeholder="note" value={day.note || ''} onChange={(ev) => {
                const next = [...sched]; next[idx] = { ...day, note: ev.target.value }; set('schedule', next);
              }} />
              <button className="btn btn-danger btn-sm" onClick={() => set('schedule', sched.filter((_, i) => i !== idx))}>×</button>
            </div>
          ))}
        </div>
      )}

      <div className="row-inline" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onSave(e)} disabled={!e.name || !e.start}>Save event</button>
      </div>
    </div>
  );
}

/* Uses the same ics logic shape as opsdeck-data.js (pure, portable). */
function buildIcs(events: EventRec[]): string {
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MAINFRAME//EN', 'CALSCALE:GREGORIAN'];
  const strip = (x?: string) => String(x || '').replace(/-/g, '');
  const addDay = (iso?: string) => {
    if (!iso) return iso || '';
    const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  };
  events.forEach((e) => {
    out.push('BEGIN:VEVENT', `UID:${e.id}@mainframe`);
    out.push('DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z');
    out.push('SUMMARY:' + (e.name || 'Event'));
    if (e.loc) out.push('LOCATION:' + e.loc.replace(/,/g, '\\,'));
    const desc: string[] = [];
    if (e.callTime) desc.push('Crew call ' + e.callTime);
    if (e.notes) desc.push(e.notes);
    if (desc.length) out.push('DESCRIPTION:' + desc.join(' \\n '));
    out.push('DTSTART;VALUE=DATE:' + strip(e.start || e.end));
    out.push('DTEND;VALUE=DATE:' + strip(addDay(e.end || e.start)));
    out.push('END:VEVENT');
  });
  out.push('END:VCALENDAR');
  return out.join('\r\n');
}

function downloadText(name: string, text: string, mime: string) {
  const b = new Blob([text], { type: mime });
  const u = URL.createObjectURL(b);
  const a = document.createElement('a');
  a.href = u; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 120);
}

const fmt = (iso?: string) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
