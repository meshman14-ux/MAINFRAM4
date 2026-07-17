import { useMemo } from 'react';
import { useOpsData } from '../data/useOpsData';
import { useAuth } from '../data/authContext';
import { portalEvents, portalSummary } from '../data/portal';

const fmt = (iso?: string) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' }) : '';
const fmtShort = (iso?: string) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

export default function ClientPortal() {
  const { data, ready, error } = useOpsData();
  const auth = useAuth();
  const clientId = auth.access?.clientId ?? '';

  const events = useMemo(
    () => (ready && clientId ? portalEvents(data, clientId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, clientId, data.meta().updatedAt]
  );
  const summary = useMemo(
    () => (ready && clientId ? portalSummary(data, clientId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, clientId, data.meta().updatedAt]
  );

  if (error) return <div className="p4"><div className="banner">Couldn't load your events: {error}</div></div>;
  if (!ready) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading your events</div></div></div>;
  if (!clientId) return <div className="p4"><div className="empty-state">Your account isn't linked to an operator yet — please contact your event company.</div></div>;

  function meterColor(pct: number) {
    if (pct >= 100) return 'var(--green)';
    if (pct >= 60) return 'var(--blue)';
    if (pct >= 30) return 'var(--amber)';
    return 'var(--red)';
  }

  return (
    <div className="p4">
      <div className="portal-hero">
        <h1>{summary?.clientName}</h1>
        <p>Your events and how preparations are coming along.</p>
      </div>

      {summary?.nextEvent && (
        <div className="portal-next">
          <div className="eyebrow">{summary.nextEvent.status === 'live' ? 'Happening now' : 'Your next event'}</div>
          <div className="ne-name">{summary.nextEvent.name}</div>
          <div className="ne-meta">{fmt(summary.nextEvent.start)}{summary.nextEvent.end && summary.nextEvent.end !== summary.nextEvent.start ? ` – ${fmt(summary.nextEvent.end)}` : ''}{summary.nextEvent.loc ? ` · ${summary.nextEvent.loc}` : ''}</div>
          <div className="ne-count">{summary.nextEvent.countdownLabel}</div>
        </div>
      )}

      {events.length === 0 ? (
        <div className="empty-state">No events scheduled yet. Your event company will add them here.</div>
      ) : (
        events.map((e) => (
          <div className="portal-card" key={e.id} style={{ ['--evc' as string]: e.color }}>
            <div className="portal-accent" />
            <div>
              <div className="pc-head">
                <span className="pc-name">{e.name}</span>
                <span className="pc-loc">{e.loc}</span>
                <span className="pc-count">{fmtShort(e.start)}{e.end && e.end !== e.start ? `–${fmtShort(e.end)}` : ''} · {e.countdownLabel}</span>
              </div>
              <div className="portal-meters">
                <div className="meter">
                  <div className="ml"><span>Crew confirmed</span><span>{e.confirmed}/{e.need}</span></div>
                  <div className="mbar"><div className="mfill" style={{ width: `${e.staffingPct}%`, background: meterColor(e.staffingPct) }} /></div>
                </div>
                <div className="meter">
                  <div className="ml">
                    <span>Preparation</span>
                    <span className="portal-status" data-ready={e.ready}>{e.ready ? 'Ready' : `${e.readinessPct}%`}</span>
                  </div>
                  <div className="mbar"><div className="mfill" style={{ width: `${e.readinessPct}%`, background: meterColor(e.readinessPct) }} /></div>
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
