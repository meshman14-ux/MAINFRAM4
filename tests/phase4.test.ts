/* Phase 4 selector tests — register rows, month calendar, staff hub. */
import { describe, it, expect } from 'vitest';
import { OpsData } from '../src/data/opsData';
import type { OpsState } from '../src/data/types';
import {
  registerRows, eventStatus, monthGrid, myShifts, myCompliance,
} from '../src/data/phase4';

function seed(): OpsState {
  return {
    meta: { version: 1, updatedAt: Date.now() },
    clients: { C001: { id: 'C001', name: 'JP Events', status: 'Active' }, C002: { id: 'C002', name: 'Coastal Kitchen', status: 'Active' } },
    events: {
      E001: { id: 'E001', clientId: 'C001', name: 'Latitude', loc: 'Henham Park', start: '2026-07-23', end: '2026-07-26', callTime: '07:00' },
      E002: { id: 'E002', clientId: 'C001', name: 'Cardiff Food Festival', loc: 'Cardiff', start: '2026-08-15', end: '2026-08-16', callTime: '08:00' },
      E003: { id: 'E003', clientId: 'C002', name: 'Beach Weddings', loc: 'Ogmore', start: '2026-08-08', end: '2026-08-08', callTime: '11:00' },
    },
    units: {
      U001: { id: 'U001', clientId: 'C001', type: 'Bar', code: 'BAR-01', name: 'Main Bar', crew: 3 },
      U002: { id: 'U002', clientId: 'C001', type: 'Coffee', code: 'COF-01', name: 'Coffee', crew: 2 },
    },
    staff: {
      S001: { id: 'S001', clientId: 'C001', name: 'Jordan Blake', role: 'Unit Manager', rtw: 'Verified' },
      S006: { id: 'S006', clientId: 'C001', name: 'Tom Fletcher', role: 'Barista', rtw: 'Pending' },
    },
    assignments: {
      A001: { id: 'A001', eventId: 'E001', unitId: 'U001', staffId: 'S001', area: 'Bar', confirmed: true },
      A002: { id: 'A002', eventId: 'E002', unitId: 'U001', staffId: 'S001', area: 'Bar', confirmed: false },
    },
    stock: {
      K001: { id: 'K001', unitId: 'U001', item: 'Lager kegs', qty: 4, par: 6, unit: 'kegs' },
    },
    applications: {},
    kv: {},
    certs: {
      'CERT-S001-0': { id: 'CERT-S001-0', staffId: 'S001', type: 'Personal Licence', expiry: '2030-01-01' },
      'CERT-S001-1': { id: 'CERT-S001-1', staffId: 'S001', type: 'Food Hygiene L2', expiry: '2030-01-01' },
      'CERT-S001-2': { id: 'CERT-S001-2', staffId: 'S001', type: 'First Aid', expiry: '2030-01-01' },
    },
    availability: {
      'S001:2026-07-24': { staffId: 'S001', date: '2026-07-24', available: false },
    },
  };
}

function store(): OpsData {
  const d = new OpsData();
  // @ts-expect-error inject mirror
  d.db = seed();
  return d;
}

const TODAY = '2026-07-15';

describe('event status', () => {
  const d = store();
  it('classifies past / live / upcoming', () => {
    expect(eventStatus(d.get('events', 'E001')!, '2026-07-24')).toBe('live');   // mid-run
    expect(eventStatus(d.get('events', 'E001')!, '2026-08-01')).toBe('past');   // after
    expect(eventStatus(d.get('events', 'E001')!, TODAY)).toBe('upcoming');      // before
  });
});

describe('register rows', () => {
  const d = store();
  it('lists all events with staffing + stock rollups', () => {
    const rows = registerRows(d, {}, TODAY);
    expect(rows).toHaveLength(3);
    const lat = rows.find((r) => r.id === 'E001')!;
    expect(lat.filled).toBe(1);
    expect(lat.need).toBe(5);           // Bar 3 + Coffee 2
    expect(lat.stockLow).toBe(1);
    expect(lat.countdownLabel).toBe('T-8');
  });
  it('scopes to a client', () => {
    const rows = registerRows(d, { clientId: 'C002' }, TODAY);
    expect(rows.map((r) => r.id)).toEqual(['E003']);
  });
  it('filters by scope=upcoming', () => {
    const rows = registerRows(d, { scope: 'upcoming' }, TODAY);
    expect(rows.every((r) => r.status === 'upcoming')).toBe(true);
  });
});

describe('month calendar', () => {
  const d = store();
  it('builds a 6x7 grid with the event on its days', () => {
    const { weeks, label } = monthGrid(d, 2026, 6, undefined, TODAY); // July 2026
    expect(label).toContain('July');
    expect(weeks).toHaveLength(6);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    // find 23 Jul cell — should carry Latitude
    const cells = weeks.flat();
    const jul23 = cells.find((c) => c.date === '2026-07-23')!;
    expect(jul23.events.some((e) => e.id === 'E001')).toBe(true);
    // 24 Jul also within the multi-day event
    const jul24 = cells.find((c) => c.date === '2026-07-24')!;
    expect(jul24.events.some((e) => e.id === 'E001')).toBe(true);
    // a day outside the event has none
    const jul10 = cells.find((c) => c.date === '2026-07-10')!;
    expect(jul10.events).toHaveLength(0);
  });
  it('marks today and in-month flags', () => {
    const { weeks } = monthGrid(d, 2026, 6, undefined, TODAY);
    const cells = weeks.flat();
    expect(cells.find((c) => c.date === TODAY)!.isToday).toBe(true);
    expect(cells.filter((c) => c.inMonth).length).toBe(31); // July has 31 days
  });
});

describe('staff hub', () => {
  const d = store();
  it('myShifts lists a crew member\'s assignments sorted by date', () => {
    const shifts = myShifts(d, 'S001', TODAY);
    expect(shifts.map((s) => s.eventId)).toEqual(['E001', 'E002']);
    expect(shifts[0].confirmed).toBe(true);
    expect(shifts[1].confirmed).toBe(false);
  });
  it('myCompliance reflects verified RTW + valid certs = compliant', () => {
    const view = myCompliance(d, d.get('staff', 'S001')!);
    expect(view.status).toBe('compliant');
    expect(view.certs.every((c) => c.state === 'ok')).toBe(true);
  });
  it('pending RTW crew shows blocked', () => {
    const view = myCompliance(d, d.get('staff', 'S006')!);
    expect(view.status).toBe('blocked');
  });
});

describe('availability wiring (promoted table)', () => {
  const d = store();
  it('reads unavailability from the availability mirror', () => {
    expect(d.isUnavailable('S001', '2026-07-24')).toBe(true);
    expect(d.isUnavailable('S001', '2026-07-25')).toBe(false);
  });
});
