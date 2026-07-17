/* ============================================================
   Phase 7 — Client Portal selector.
   A read-only summary for the `client` role: their own events,
   each with staffing progress and go-live readiness. RLS already
   scopes the data to their client_id server-side; this shapes it
   for a calm, non-operator view.
   ============================================================ */
import type { OpsData } from './opsData';
import type { EventRec } from './types';
import { eventStaffing } from './home';
import { eventStatus } from './phase4';
import { todayISO, daysBetween } from './home';

export interface PortalEvent {
  id: string;
  name: string;
  loc?: string;
  start?: string;
  end?: string;
  status: 'past' | 'live' | 'upcoming';
  daysOut: number;
  countdownLabel: string;
  filled: number;
  need: number;
  confirmed: number;
  staffingPct: number;      // confirmed / need
  readinessPct: number;
  ready: boolean;
  color: string;
}

export function portalEvents(d: OpsData, clientId: string, today = todayISO()): PortalEvent[] {
  return d.eventsForClient(clientId)
    .sort((a, b) => (a.start || '').localeCompare(b.start || ''))
    .map((e: EventRec): PortalEvent => {
      const s = eventStaffing(d, e);
      const r = d.eventReadiness(e);
      const status = eventStatus(e, today);
      const days = daysBetween(today, e.start);
      const need = s.need || 0;
      return {
        id: e.id, name: e.name, loc: e.loc, start: e.start, end: e.end,
        status, daysOut: days,
        countdownLabel: status === 'past' ? 'Completed' : status === 'live' ? 'Live now' : `${Math.max(0, days)} days to go`,
        filled: s.filled, need, confirmed: s.confirmed,
        staffingPct: need > 0 ? Math.round((s.confirmed / need) * 100) : 0,
        readinessPct: r.pct,
        ready: r.ready,
        color: d.eventColor(e.id),
      };
    });
}

export interface PortalSummary {
  clientName: string;
  upcoming: number;
  live: number;
  nextEvent?: PortalEvent;
}

export function portalSummary(d: OpsData, clientId: string, today = todayISO()): PortalSummary {
  const events = portalEvents(d, clientId, today);
  const upcoming = events.filter((e) => e.status === 'upcoming');
  const live = events.filter((e) => e.status === 'live');
  const client = d.get<{ name: string }>('clients', clientId);
  return {
    clientName: client?.name ?? 'Your events',
    upcoming: upcoming.length,
    live: live.length,
    nextEvent: live[0] || upcoming[0],
  };
}
