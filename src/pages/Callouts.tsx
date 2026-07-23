import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import type { Client, EventRec, Callout, CalloutRequest } from '../data/types';
import { applicantsForEvent } from '../data/phase5';
import { calloutFill, autoShortlist } from '../data/phase13';
import { unitColor } from '../components/console/unitTheme';

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
  const fill = calloutFill(data, event);
  const applicants = applicantsForEvent(data, event.id);
  const open = !!event.callout?.open;
  const pct = fill.needed ? Math.round((fill.filled / fill.needed) * 100) : 100;

  async function toggle() { await data.toggleCallout(event.id, !open); }
  async function approve(id: string) { await data.approveApplication(id); }
  async function decline(id: string) { await data.declineApplication(id); }

  /** Operator adjusts how many of a skill this unit is requesting. */
  async function setNeeded(unitId: string, area: CalloutRequest['area'], needed: number) {
    await data.patchJson<EventRec>('events', event.id, 'callout', (cur: Callout | undefined) => {
      const base: Callout = cur ?? { open: false };
      const requests = fill.rows.map((r) => ({ unitId: r.unitId, area: r.area, needed: r.needed }));
      const i = requests.findIndex((r) => r.unitId === unitId);
      if (i >= 0) requests[i] = { ...requests[i], area, needed: Math.max(0, needed) };
      else requests.push({ unitId, area, needed: Math.max(0, needed) });
      return { ...base, requests };
    });
  }

  return (
    <div className="callout-event" style={{ ['--evc' as string]: data.eventColor(event.id) }}>
      <div className="callout-head">
        <span style={{ width: 10, height: 10, borderRadius: 3, background: data.eventColor(event.id) }} />
        <span className="callout-name">{event.name}</span>
        <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{fmt(event.start)}{event.end && event.end !== event.start ? `–${fmt(event.end)}` : ''}</span>
        {fill.needed > 0 && (
          <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: pct >= 100 ? 'var(--ok)' : 'var(--warn)' }}>
            {fill.filled}/{fill.needed} filled
          </span>
        )}
        <label className="switch callout-toggle">
          <input type="checkbox" checked={open} onChange={toggle} />
          {open ? 'Callout open' : 'Callout closed'}
        </label>
      </div>

      {fill.rows.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>Fully staffed — no open requests.</div>
      ) : (
        <div style={{ marginBottom: applicants.length ? 16 : 0 }}>
          <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 8 }}>SKILL REQUESTS — PER UNIT</div>
          {fill.rows.map((r) => {
            const u = data.get<{ type?: string }>('units', r.unitId);
            const col = unitColor(u?.type);
            const shortlist = open ? autoShortlist(data, event, r.unitId) : [];
            const rowPct = r.needed ? Math.min(100, Math.round((r.filled / r.needed) * 100)) : 100;
            return (
              <div className="pos-row" key={r.unitId} style={{ ['--uc' as string]: col, flexWrap: 'wrap' }}>
                <span className="chip unit-type-chip" style={{ fontSize: 10, color: col }}>{r.area}</span>
                <span>{r.unitCode} · {r.unitName}</span>
                <span className="row-inline" aria-label={`Needed on ${r.unitCode}`}>
                  <input
                    className="inp" type="number" min={0}
                    style={{ width: 58, padding: '4px 6px', fontSize: 12.5 }}
                    value={r.needed}
                    onChange={(e) => setNeeded(r.unitId, r.area, Number(e.target.value))}
                  />
                  <span className="muted" style={{ fontSize: 11.5 }}>needed</span>
                </span>
                <span className="unit-check" style={{ flex: 1, minWidth: 130, marginTop: 0 }}>
                  <span className="unit-check-bar" style={{ ['--uc' as string]: r.filled >= r.needed ? 'var(--neon-green)' : 'var(--neon-yellow)' }}>
                    <span style={{ display: 'block', height: '100%', width: `${rowPct}%`, background: 'var(--uc)', boxShadow: '0 0 8px var(--uc)' }} />
                  </span>
                  <span className="mono">{r.filled}/{r.needed}{r.pending ? ` · ${r.pending} pending` : ''}</span>
                </span>
                {shortlist.length > 0 && (
                  <span className="row-inline" style={{ width: '100%', flexWrap: 'wrap', gap: 6 }}>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>AUTO-SHORTLIST:</span>
                    {shortlist.map((c) => (
                      <span key={c.id} className="chip chip-blue" style={{ fontSize: 10.5 }} title={`Suitability ${c.score}`}>
                        {c.name} · {c.score}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            );
          })}
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
