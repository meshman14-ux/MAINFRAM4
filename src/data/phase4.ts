/* ============================================================
   Phase 4 selectors — Events Register, Calendar, Staff Hub.
   Pure functions over OpsData, unit-testable.
   ============================================================ */
import type { OpsData } from './opsData';
import type { EventRec, Staff } from './types';
import { eventStaffing, eventStockLow, todayISO, daysBetween } from './home';

/* ---------------- Events Register ---------------- */

export interface RegisterRow {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  loc?: string;
  start?: string;
  end?: string;
  status: 'past' | 'live' | 'upcoming';
  daysOut: number;
  units: number;
  filled: number;
  need: number;
  confirmed: number;
  stockLow: number;
  color: string;
  countdownLabel: string;
}

export function eventStatus(e: EventRec, today = todayISO()): 'past' | 'live' | 'upcoming' {
  const start = e.start || '';
  const end = e.end || e.start || '';
  if (end < today) return 'past';
  if (start <= today && end >= today) return 'live';
  return 'upcoming';
}

export function registerRows(
  d: OpsData, opts: { clientId?: string; scope?: 'all' | 'upcoming' | 'live' | 'past' } = {},
  today = todayISO()
): RegisterRow[] {
  const scope = opts.scope || 'all';
  let events = d.all<EventRec>('events');
  if (opts.clientId) events = events.filter((e) => e.clientId === opts.clientId);

  const rows = events.map((e): RegisterRow => {
    const s = eventStaffing(d, e);
    const client = d.get<{ name: string }>('clients', e.clientId);
    const status = eventStatus(e, today);
    const days = daysBetween(today, e.start);
    return {
      id: e.id, name: e.name, clientId: e.clientId,
      clientName: client?.name ?? '—', loc: e.loc, start: e.start, end: e.end,
      status, daysOut: days,
      units: d.unitsForEvent(e).length,
      filled: s.filled, need: s.need, confirmed: s.confirmed,
      stockLow: eventStockLow(d, e),
      color: d.eventColor(e.id),
      countdownLabel: status === 'past' ? 'done' : status === 'live' ? 'LIVE' : `T-${Math.max(0, days)}`,
    };
  });

  const filtered = scope === 'all' ? rows : rows.filter((r) => r.status === scope);
  // upcoming/live first (soonest), past last (most recent first)
  return filtered.sort((a, b) => {
    if (a.status === 'past' && b.status !== 'past') return 1;
    if (b.status === 'past' && a.status !== 'past') return -1;
    return (a.start || '').localeCompare(b.start || '');
  });
}

/* ---------------- Calendar ---------------- */

export interface CalendarCell {
  date: string;          // ISO
  day: number;
  inMonth: boolean;
  isToday: boolean;
  events: { id: string; name: string; color: string; clientName: string }[];
}

/** Build a 6-row month grid (Mon-first) for the given year/month (0-based). */
export function monthGrid(
  d: OpsData, year: number, month: number, clientId?: string, today = todayISO()
): { weeks: CalendarCell[][]; label: string } {
  const first = new Date(Date.UTC(year, month, 1));
  const label = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  // Monday-first offset
  const jsDow = first.getUTCDay();            // 0=Sun
  const offset = (jsDow + 6) % 7;             // 0=Mon
  const gridStart = new Date(first);
  gridStart.setUTCDate(1 - offset);

  let events = d.all<EventRec>('events');
  if (clientId) events = events.filter((e) => e.clientId === clientId);

  const weeks: CalendarCell[][] = [];
  const cursor = new Date(gridStart);
  for (let w = 0; w < 6; w++) {
    const week: CalendarCell[] = [];
    for (let dow = 0; dow < 7; dow++) {
      const iso = cursor.toISOString().slice(0, 10);
      const dayEvents = events
        .filter((e) => withinEvent(e, iso))
        .map((e) => ({
          id: e.id, name: e.name, color: d.eventColor(e.id),
          clientName: d.get<{ name: string }>('clients', e.clientId)?.name ?? '',
        }));
      week.push({
        date: iso,
        day: cursor.getUTCDate(),
        inMonth: cursor.getUTCMonth() === month,
        isToday: iso === today,
        events: dayEvents,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
  }
  return { weeks, label };
}

function withinEvent(e: EventRec, iso: string): boolean {
  const start = e.start || '';
  const end = e.end || e.start || '';
  return !!start && iso >= start && iso <= end;
}

/* ---------------- Staff Hub (crew self-service) ---------------- */

export interface MyShift {
  assignmentId: string;
  eventId: string;
  eventName: string;
  eventStart?: string;
  eventEnd?: string;
  unitCode: string;
  unitName: string;
  area?: string;
  confirmed: boolean;
  color: string;
  daysOut: number;
}

export function myShifts(d: OpsData, staffId: string, today = todayISO()): MyShift[] {
  return d.assignmentsForStaff(staffId).map((a): MyShift => {
    const e = d.get<EventRec>('events', a.eventId);
    const u = d.get<{ code: string; name: string }>('units', a.unitId);
    return {
      assignmentId: a.id,
      eventId: a.eventId,
      eventName: e?.name ?? a.eventId,
      eventStart: e?.start,
      eventEnd: e?.end,
      unitCode: u?.code ?? '',
      unitName: u?.name ?? '',
      area: a.area,
      confirmed: !!a.confirmed,
      color: d.eventColor(a.eventId),
      daysOut: e?.start ? daysBetween(today, e.start) : 0,
    };
  }).sort((a, b) => (a.eventStart || '').localeCompare(b.eventStart || ''));
}

export interface MyComplianceView {
  rtw?: string;
  required: string[];
  certs: { id?: string; type: string; expiry?: string; state: string }[];
  status: 'compliant' | 'expiring' | 'blocked';
}

export function myCompliance(d: OpsData, staff: Staff): MyComplianceView {
  const detail = d.complianceDetail(staff);
  const held = d.certsForStaff(staff.id);
  const heldByType = new Map(held.map((c) => [c.type, c]));
  const certs = detail.certs.map((c) => ({
    id: heldByType.get(c.type)?.id,
    type: c.type, expiry: c.expiry, state: c.state,
  }));
  return { rtw: staff.rtw, required: detail.required, certs, status: detail.status };
}
