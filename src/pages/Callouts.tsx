import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import type { Client, EventRec } from '../data/types';
import { openPositionsForEvent, applicantsForEvent } from '../data/phase5';

const fmt = (iso?: string) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

export default function Callouts() {
  const { data, ready, error } = useOpsData();
  const [clientId, setClientId] = useState('');

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

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading callouts</div></div></div>;
  if (clients.length === 0) return <div className="p4"><div className="empty-state">No operators yet.</div></div>;

  return (
    <div className="p4">
      <div className="client-bar">
        <select className="client-select" value={activeId} onChange={(e) => setClientId(e.target.value)} aria-label="Operator">
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="client-meta">Post open jobs and approve applicants</span>
      </div>

      {events.length === 0 ? (
        <div className="empty-state">No events. Create one in the Ops Console.</div>
      ) : (
        events.map((e) => <CalloutEvent key={e.id} data={data} event={e} />)
      )}
    </div>
  );
}

function CalloutEvent({ data, event }: { data: ReturnType<typeof useOpsData>['data']; event: EventRec }) {
  const positions = openPositionsForEvent(data, event);
  const applicants = applicantsForEvent(data, event.id);
  const open = !!event.callout?.open;

  async function toggle() { await data.toggleCallout(event.id, !open); }
  async function approve(id: string) { await data.approveApplication(id); }
  async function decline(id: string) { await data.declineApplication(id); }

  return (
    <div className="callout-event" style={{ ['--evc' as string]: data.eventColor(event.id) }}>
      <div className="callout-head">
        <span style={{ width: 10, height: 10, borderRadius: 3, background: data.eventColor(event.id) }} />
        <span className="callout-name">{event.name}</span>
        <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{fmt(event.start)}{event.end && event.end !== event.start ? `–${fmt(event.end)}` : ''}</span>
        <label className="switch callout-toggle">
          <input type="checkbox" checked={open} onChange={toggle} />
          {open ? 'Callout open' : 'Callout closed'}
        </label>
      </div>

      {positions.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>Fully staffed — no open positions.</div>
      ) : (
        <div style={{ marginBottom: applicants.length ? 16 : 0 }}>
          <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 8 }}>OPEN POSITIONS</div>
          {positions.map((p) => (
            <div className="pos-row" key={p.unitId}>
              <span className="chip chip-blue" style={{ fontSize: 10 }}>{p.area}</span>
              <span>{p.unitCode} · {p.unitName}</span>
              <span className="pos-gap">{p.gap} needed</span>
            </div>
          ))}
        </div>
      )}

      {applicants.length > 0 && (
        <div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 8 }}>APPLICANTS ({applicants.length})</div>
          {applicants.map((a) => (
            <div className="applicant" key={a.application.id} data-blocked={a.blocked}>
              <div>
                <span className="anm">{a.name}</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', marginLeft: 8 }}>
                  {a.unitCode}{a.reasons.length ? ` · ${a.reasons.join(', ')}` : ''}
                </span>
              </div>
              <span className="score">{a.score}</span>
              <div className="row-inline">
                <button className="btn btn-sm btn-primary" onClick={() => approve(a.application.id)} disabled={a.blocked} title={a.blocked ? 'Blocked: ' + a.reasons.join(', ') : 'Approve'}>Approve</button>
                <button className="btn btn-sm btn-danger" onClick={() => decline(a.application.id)}>Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
