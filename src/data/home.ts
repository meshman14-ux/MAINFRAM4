/* ============================================================
   Home dashboard selectors
   ------------------------------------------------------------
   Pure functions over an OpsData instance. These compute the
   numbers shown on the Home screen (KPI tiles, the needs-action
   feed, and the all-events register). Kept separate from the
   store so they're unit-testable and reusable by other modules.
   ============================================================ */
import type { OpsData } from './opsData';
import type { EventRec, Area } from './types';

const AREAS: Area[] = ['Bar', 'Coffee', 'Food', 'General', 'Driver', 'Supervisor'];

export interface HomeKpis {
  operators: number;      // entities on system
  eventsAhead: number;    // upcoming (not past) events
  crewGaps: number;       // total unfilled slots across upcoming events
  unconfirmed: number;    // assigned-but-not-confirmed across upcoming events
  stockLow: number;       // stock lines below par across upcoming events
}

export interface EventStaffing {
  need: number;           // total required headcount
  filled: number;         // assignments present
  confirmed: number;      // assignments confirmed
  gap: number;            // need - filled (never negative)
}

export type ActionKind = 'STAFFING' | 'CONFIRM' | 'STOCK' | 'RTW';

export interface ActionItem {
  kind: ActionKind;
  eventId: string;
  eventName: string;
  message: string;
  color: string;          // accent for the tag, from event colour or status
}

export interface EventRow {
  id: string;
  name: string;
  clientName: string;
  loc?: string;
  start?: string;
  end?: string;
  daysOut: number;
  units: number;
  filled: number;
  need: number;
  confirmed: number;
  stockLow: number;
  color: string;
  countdownLabel: string; // 'T-8'
}

export interface ConfirmationRow {
  assignmentId: string;
  staffId: string;
  staffName: string;
  unitCode: string;
  unitName: string;
  confirmed: boolean;
  phone?: string;
}

export function todayISO(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function daysBetween(fromISO: string, toISO?: string): number {
  if (!toISO) return 0;
  const a = new Date(fromISO + 'T00:00:00').getTime();
  const b = new Date(toISO + 'T00:00:00').getTime();
  return Math.round((b - a) / 86400000);
}

/** Upcoming = not yet ended, relative to `today`. Sorted soonest first. */
export function upcomingEvents(d: OpsData, today = todayISO()): EventRec[] {
  return d.all<EventRec>('events')
    .filter((e) => (e.end || e.start || '') >= today)
    .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
}

/** Required / filled / confirmed / gap for one event. */
export function eventStaffing(d: OpsData, e: EventRec): EventStaffing {
  const need = Object.values(d.staffingFor(e)).reduce((n, v) => n + v, 0);
  const assigns = d.assignmentsForEvent(e.id);
  const filled = assigns.length;
  const confirmed = assigns.filter((a) => a.confirmed).length;
  return { need, filled, confirmed, gap: Math.max(0, need - filled) };
}

/** Stock lines below par across the units attending an event. */
export function eventStockLow(d: OpsData, e: EventRec): number {
  const units = d.unitsForEvent(e);
  let n = 0;
  units.forEach((u) => {
    d.stockForUnit(u.id).forEach((s) => { if (Number(s.qty) < Number(s.par)) n++; });
  });
  return n;
}

export function homeKpis(d: OpsData, today = todayISO()): HomeKpis {
  const events = upcomingEvents(d, today);
  let crewGaps = 0, unconfirmed = 0, stockLow = 0;
  events.forEach((e) => {
    const s = eventStaffing(d, e);
    crewGaps += s.gap;
    unconfirmed += s.filled - s.confirmed;
    stockLow += eventStockLow(d, e);
  });
  return {
    operators: d.all('clients').length,
    eventsAhead: events.length,
    crewGaps,
    unconfirmed,
    stockLow,
  };
}

/** The "needs action" feed — ordered by urgency, then soonest event. */
export function needsAction(d: OpsData, today = todayISO()): ActionItem[] {
  const items: ActionItem[] = [];
  const events = upcomingEvents(d, today);

  events.forEach((e) => {
    const color = d.eventColor(e.id);
    const s = eventStaffing(d, e);
    const days = daysBetween(today, e.start);

    if (s.gap > 0) {
      items.push({
        kind: 'STAFFING', eventId: e.id, eventName: e.name, color,
        message: `${e.name} — ${s.gap} crew short (${s.filled}/${s.need}), ${days} days out`,
      });
    }

    const unconf = s.filled - s.confirmed;
    if (unconf > 0) {
      items.push({
        kind: 'CONFIRM', eventId: e.id, eventName: e.name, color,
        message: `${e.name} — ${unconf} of ${s.filled} crew not yet confirmed`,
      });
    }

    // Stock below par, named (first few)
    const lowLines: string[] = [];
    d.unitsForEvent(e).forEach((u) => {
      d.stockForUnit(u.id).forEach((k) => {
        if (Number(k.qty) < Number(k.par)) lowLines.push(k.item);
      });
    });
    if (lowLines.length) {
      const names = lowLines.slice(0, 3).join(', ');
      const more = lowLines.length > 3 ? '…' : '';
      items.push({
        kind: 'STOCK', eventId: e.id, eventName: e.name, color,
        message: `${e.name} — ${lowLines.length} stock lines below par (${names}${more})`,
      });
    }

    // RTW pending among assigned crew
    const seen = new Set<string>();
    d.assignmentsForEvent(e.id).forEach((a) => {
      const st = d.get<{ id: string; name: string; rtw?: string }>('staff', a.staffId);
      if (st && st.rtw !== 'Verified' && !seen.has(st.id)) {
        seen.add(st.id);
        items.push({
          kind: 'RTW', eventId: e.id, eventName: e.name, color,
          message: `${e.name} — right-to-work pending: ${st.name}`,
        });
      }
    });
  });

  const order: Record<ActionKind, number> = { STAFFING: 0, CONFIRM: 1, RTW: 2, STOCK: 3 };
  return items.sort((a, b) => order[a.kind] - order[b.kind]);
}

/** The all-events register rows. */
export function eventRows(d: OpsData, today = todayISO()): EventRow[] {
  return upcomingEvents(d, today).map((e) => {
    const s = eventStaffing(d, e);
    const client = d.get<{ name: string }>('clients', e.clientId);
    const days = daysBetween(today, e.start);
    return {
      id: e.id,
      name: e.name,
      clientName: client?.name ?? '—',
      loc: e.loc,
      start: e.start,
      end: e.end,
      daysOut: days,
      units: d.unitsForEvent(e).length,
      filled: s.filled,
      need: s.need,
      confirmed: s.confirmed,
      stockLow: eventStockLow(d, e),
      color: d.eventColor(e.id),
      countdownLabel: `T-${Math.max(0, days)}`,
    };
  });
}

/** Crew confirmations for the nearest upcoming event (the Home right rail). */
export function nextEventConfirmations(
  d: OpsData, today = todayISO()
): { event: EventRec | null; rows: ConfirmationRow[]; confirmed: number; total: number } {
  const events = upcomingEvents(d, today);
  const event = events[0] ?? null;
  if (!event) return { event: null, rows: [], confirmed: 0, total: 0 };

  const rows: ConfirmationRow[] = d.assignmentsForEvent(event.id).map((a) => {
    const st = d.get<{ id: string; name: string; phone?: string }>('staff', a.staffId);
    const u = d.get<{ code: string; name: string }>('units', a.unitId);
    return {
      assignmentId: a.id,
      staffId: a.staffId,
      staffName: st?.name ?? a.staffId,
      unitCode: u?.code ?? '',
      unitName: u?.name ?? '',
      confirmed: !!a.confirmed,
      phone: st?.phone,
    };
  });
  const confirmed = rows.filter((r) => r.confirmed).length;
  return { event, rows, confirmed, total: rows.length };
}

// keep AREAS referenced for future area-level breakdowns
export const _AREAS = AREAS;
