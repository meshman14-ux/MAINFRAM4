/* ============================================================
   timelineScale — pure date + interval maths shared by the three
   Gantt widgets. Kept out of the JSX so the "where does a bar sit"
   and "what does a drag do" logic is unit-testable without a DOM.
   Events are DATE-granular (mf_events.start / "end" are DATE).
   ============================================================ */
import type { EventRec } from '../data/types';

const parse = (isoStr?: string) => (isoStr ? new Date(isoStr + 'T00:00:00') : null);
const toISO = (d: Date) => d.toISOString().slice(0, 10);

export const addDaysISO = (s: string, n: number): string => { const d = parse(s)!; d.setDate(d.getDate() + n); return toISO(d); };
export const addMonthsISO = (s: string, n: number): string => { const d = parse(s)!; d.setMonth(d.getMonth() + n); return toISO(d); };
export const daysInMonth = (y: number, m0: number): number => new Date(y, m0 + 1, 0).getDate();

/** Fractional month index 0..12 for a date within `year` (clamped to the year). */
export function monthFrac(dateISO: string, year: number): number {
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year + 1, 0, 1).getTime();
  const t = Math.min(Math.max(parse(dateISO)!.getTime(), start), end);
  return ((t - start) / (end - start)) * 12;
}

export interface Span { start: number; end: number }   // fractional columns [start, end)

/** Annual widget: place an event across 12 month-columns; null if not in the year. */
export function yearInterval(e: EventRec, year: number): Span | null {
  const s = parse(e.start!)!, en = parse(e.end || e.start!)!;
  if (en.getFullYear() < year || s.getFullYear() > year) return null;
  const start = monthFrac(e.start!, year);
  return { start, end: Math.max(monthFrac(e.end || e.start!, year) + 0.05, start + 0.2) };
}

/** Monthly widget: place an event across day-columns of the given month. */
export function monthInterval(e: EventRec, year: number, month0: number): Span | null {
  const dim = daysInMonth(year, month0);
  const s = parse(e.start!)!, en = parse(e.end || e.start!)!;
  const monthStart = new Date(year, month0, 1).getTime();
  const monthEnd = new Date(year, month0 + 1, 1).getTime();
  if (en.getTime() < monthStart || s.getTime() >= monthEnd) return null;
  const startCol = Math.max(0, (s.getTime() - monthStart) / 86400000);
  const endCol = Math.min(dim, (en.getTime() - monthStart) / 86400000 + 1);
  return { start: startCol, end: Math.max(endCol, startCol + 0.4) };
}

/** Daily widget: place an event on the fitted hour axis. call = crew call minute. */
export function dayInterval(callMin: number, axMin: number, spanMin: number, tickCount: number): Span {
  const end = callMin + 8 * 60;
  return {
    start: Math.max(0, ((callMin - axMin) / spanMin) * tickCount),
    end: Math.min(tickCount, ((end - axMin) / spanMin) * tickCount),
  };
}

/** Crew-call minute-of-day from an event's callTime ('HH:MM'), default 08:00. */
export function callMinute(e: EventRec): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(e.callTime || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : 8 * 60;
}

/* ---- drag write-backs (what a drag of `delta` columns does) ---- */

/** Move an event's whole range by `delta` months or days. */
export function shiftBoth(e: EventRec, delta: number, unit: 'month' | 'day'): Partial<EventRec> {
  const f = unit === 'month' ? addMonthsISO : addDaysISO;
  return { start: f(e.start!, delta), end: f(e.end || e.start!, delta) };
}

/** Resize: move only the end by `delta`, never before the start. */
export function shiftEnd(e: EventRec, delta: number, unit: 'month' | 'day'): string {
  const f = unit === 'month' ? addMonthsISO : addDaysISO;
  const next = f(e.end || e.start!, delta);
  return next < e.start! ? e.start! : next;
}
