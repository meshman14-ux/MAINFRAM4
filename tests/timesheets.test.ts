/* Tests for Phase 7 — timesheets: timesheetHours on OpsData and the
   payrollForEvent / payrollCsv selectors. */
import { describe, it, expect } from 'vitest';
import { OpsData } from '../src/data/opsData';
import type { OpsState, Timesheet } from '../src/data/types';
import { payrollForEvent, payrollCsv } from '../src/data/phase7';

function base(): OpsState {
  return {
    meta: { version: 1, updatedAt: Date.now() },
    clients: { C001: { id: 'C001', name: 'JP Events', status: 'Active' } },
    events: {
      E001: { id: 'E001', clientId: 'C001', name: 'Latitude', start: '2026-07-23', end: '2026-07-26' },
    },
    units: {},
    staff: {
      S001: { id: 'S001', clientId: 'C001', name: 'Jordan Blake', role: 'Bartender', rate: 12.5, rtw: 'Verified' },
      S002: { id: 'S002', clientId: 'C001', name: 'Tom Fletcher', role: 'Barista', rate: 12, rtw: 'Verified' },
    },
    assignments: {},
    stock: {},
    applications: {},
    kv: {},
    certs: {}, availability: {}, pipeline: {}, movements: {}, eventTasks: {},
    timesheets: {
      // 8h clocked minus 30m break = 7.5h at staff rate 12.5
      T001: { id: 'T001', eventId: 'E001', staffId: 'S001', workDate: '2026-07-23', clockIn: '2026-07-23T09:00:00', clockOut: '2026-07-23T17:00:00', breakMins: 30, status: 'submitted' },
      // explicit hours override wins over clocks; sheet rate overrides staff rate; overtime x1.5
      T002: { id: 'T002', eventId: 'E001', staffId: 'S001', workDate: '2026-07-24', clockIn: '2026-07-24T09:00:00', clockOut: '2026-07-24T10:00:00', hours: 4, rate: 20, overtime: true, status: 'approved' },
      // second staff member, 6h, no break
      T003: { id: 'T003', eventId: 'E001', staffId: 'S002', workDate: '2026-07-23', clockIn: '2026-07-23T10:00:00', clockOut: '2026-07-23T16:00:00', status: 'paid' },
    },
  };
}

function store(seed = base()): OpsData {
  const d = new OpsData();
  // @ts-expect-error inject seed into private mirror
  d.db = seed;
  return d;
}

describe('timesheetHours', () => {
  const d = store();
  it('derives hours from clocks minus break', () => {
    expect(d.timesheetHours(d.get<Timesheet>('timesheets', 'T001')!)).toBe(7.5);
  });
  it('explicit hours override wins over clocks', () => {
    expect(d.timesheetHours(d.get<Timesheet>('timesheets', 'T002')!)).toBe(4);
  });
  it('returns 0 without both clocks', () => {
    expect(d.timesheetHours({ id: 'X', eventId: 'E001', staffId: 'S001', workDate: '2026-07-23', status: 'draft' })).toBe(0);
  });
  it('never goes negative when the break exceeds the clocked time', () => {
    expect(d.timesheetHours({
      id: 'X', eventId: 'E001', staffId: 'S001', workDate: '2026-07-23',
      clockIn: '2026-07-23T09:00:00', clockOut: '2026-07-23T09:30:00', breakMins: 120, status: 'draft',
    })).toBe(0);
  });
});

describe('payrollForEvent', () => {
  const d = store();
  const rows = payrollForEvent(d, d.get('events', 'E001')!);

  it('groups sheets by staff', () => {
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.staffId === 'S001')?.shifts).toBe(2);
    expect(rows.find((r) => r.staffId === 'S002')?.shifts).toBe(1);
  });
  it('prices hours at sheet rate ?? staff rate, with overtime x1.5', () => {
    // S001: 7.5h x 12.5 + 4h x 20 x 1.5 = 93.75 + 120 = 213.75
    expect(rows.find((r) => r.staffId === 'S001')?.cost).toBeCloseTo(213.75);
    // S002: 6h x 12 = 72
    expect(rows.find((r) => r.staffId === 'S002')?.cost).toBeCloseTo(72);
  });
  it('sorts by cost descending', () => {
    expect(rows[0].staffId).toBe('S001');
  });
  it('falls back to rate 0 for unknown staff', () => {
    const d2 = store();
    // @ts-expect-error reach into private mirror for the test
    d2.db.timesheets = { T009: { id: 'T009', eventId: 'E001', staffId: 'S999', workDate: '2026-07-23', hours: 5, status: 'submitted' } };
    const r = payrollForEvent(d2, d2.get('events', 'E001')!);
    expect(r).toHaveLength(1);
    expect(r[0].cost).toBe(0);
    expect(r[0].name).toBe('S999');
  });
});

describe('payrollCsv', () => {
  it('emits a header and one line per staff row', () => {
    const d = store();
    const rows = payrollForEvent(d, d.get('events', 'E001')!);
    const csv = payrollCsv([{ eventName: 'Latitude', rows }]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Event,Staff,Shifts,Hours,Cost');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('Latitude,Jordan Blake,2,11.5,213.75');
  });
});
