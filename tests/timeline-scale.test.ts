/* Tests for the pure timeline scale maths (src/lib/timelineScale.ts) —
   bar placement per widget and the drag write-backs. */
import { describe, it, expect } from 'vitest';
import {
  addDaysISO, addMonthsISO, daysInMonth, monthFrac, callMinute,
  yearInterval, monthInterval, dayInterval, shiftBoth, shiftEnd,
} from '../src/lib/timelineScale';
import type { EventRec } from '../src/data/types';

const ev = (start: string, end?: string, extra: Partial<EventRec> = {}): EventRec =>
  ({ id: 'E', clientId: 'C', name: 'X', start, end, ...extra });

describe('date helpers', () => {
  it('adds days and months across boundaries', () => {
    expect(addDaysISO('2026-07-30', 3)).toBe('2026-08-02');
    expect(addMonthsISO('2026-11-15', 2)).toBe('2027-01-15');
  });
  it('knows days in a month (incl. leap Feb)', () => {
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(daysInMonth(2028, 1)).toBe(29);
  });
  it('monthFrac maps Jan 1 to 0 and Dec 31 near 12', () => {
    expect(monthFrac('2026-01-01', 2026)).toBeCloseTo(0, 5);
    expect(monthFrac('2026-12-31', 2026)).toBeGreaterThan(11.9);
  });
  it('callMinute parses HH:MM and defaults to 08:00', () => {
    expect(callMinute(ev('2026-07-01', undefined, { callTime: '07:30' }))).toBe(450);
    expect(callMinute(ev('2026-07-01'))).toBe(480);
  });
});

describe('yearInterval', () => {
  it('places a July event around month index 6', () => {
    const s = yearInterval(ev('2026-07-01', '2026-07-05'), 2026)!;
    expect(s.start).toBeGreaterThan(5.9);
    expect(s.start).toBeLessThan(6.2);
    expect(s.end).toBeGreaterThan(s.start);
  });
  it('returns null for an event outside the year', () => {
    expect(yearInterval(ev('2025-07-01'), 2026)).toBeNull();
  });
});

describe('monthInterval', () => {
  it('spans the correct day-columns', () => {
    const s = monthInterval(ev('2026-07-10', '2026-07-12'), 2026, 6)!; // July = month0 6
    expect(s.start).toBeCloseTo(9, 5);   // day 10 → col index 9
    expect(s.end).toBeCloseTo(12, 5);    // through day 12 inclusive → 11+1
  });
  it('clamps an event that starts before the month', () => {
    const s = monthInterval(ev('2026-06-28', '2026-07-03'), 2026, 6)!;
    expect(s.start).toBe(0);
    expect(s.end).toBeCloseTo(3, 5);
  });
  it('returns null when the event misses the month', () => {
    expect(monthInterval(ev('2026-05-01', '2026-05-03'), 2026, 6)).toBeNull();
  });
});

describe('dayInterval', () => {
  it('places a call time within the fitted axis', () => {
    // axis 06:00-24:00 (min 360, span 1080), 18 ticks; call 08:00 = 480
    const s = dayInterval(480, 360, 1080, 18);
    expect(s.start).toBeCloseTo(((480 - 360) / 1080) * 18, 5);
    expect(s.end).toBeGreaterThan(s.start);
  });
});

describe('drag write-backs', () => {
  it('shiftBoth moves start and end together (days)', () => {
    expect(shiftBoth(ev('2026-07-10', '2026-07-12'), 5, 'day')).toEqual({ start: '2026-07-15', end: '2026-07-17' });
  });
  it('shiftBoth moves by months', () => {
    expect(shiftBoth(ev('2026-07-10', '2026-07-12'), 2, 'month')).toEqual({ start: '2026-09-10', end: '2026-09-12' });
  });
  it('shiftEnd extends the end but never before the start', () => {
    expect(shiftEnd(ev('2026-07-10', '2026-07-12'), 3, 'day')).toBe('2026-07-15');
    expect(shiftEnd(ev('2026-07-10', '2026-07-12'), -20, 'day')).toBe('2026-07-10');
  });
});
