/* Phase 6 tests — compliance register, double-booking, stock reorder, finance. */
import { describe, it, expect } from 'vitest';
import { OpsData } from '../src/data/opsData';
import type { OpsState } from '../src/data/types';
import {
  complianceRegister, complianceSummary, reorderForClient, reorderCsv,
  eventFinance, clientFinance,
} from '../src/data/phase6';

function seed(): OpsState {
  return {
    meta: { version: 1, updatedAt: Date.now() },
    clients: { C001: { id: 'C001', name: 'JP Events', status: 'Active' } },
    events: {
      // E001 and E002 OVERLAP (23-26 and 25-27 Jul) → double-booking if same staff
      E001: { id: 'E001', clientId: 'C001', name: 'Latitude', start: '2026-07-23', end: '2026-07-26' },
      E002: { id: 'E002', clientId: 'C001', name: 'Camp Bestival', start: '2026-07-25', end: '2026-07-27' },
      E003: { id: 'E003', clientId: 'C001', name: 'Cardiff', start: '2026-08-15', end: '2026-08-16' },
    },
    units: {
      U001: { id: 'U001', clientId: 'C001', type: 'Bar', code: 'BAR-01', name: 'Main Bar', crew: 2 },
    },
    staff: {
      S001: { id: 'S001', clientId: 'C001', name: 'Jordan Blake', role: 'Bartender', rate: 12.5, rtw: 'Verified' },
      S002: { id: 'S002', clientId: 'C001', name: 'Tom Fletcher', role: 'Barista', rate: 12, rtw: 'Pending' },
    },
    assignments: {
      // Jordan double-booked across E001 & E002 (overlap), both confirmed
      A001: { id: 'A001', eventId: 'E001', unitId: 'U001', staffId: 'S001', area: 'Bar', confirmed: true },
      A002: { id: 'A002', eventId: 'E002', unitId: 'U001', staffId: 'S001', area: 'Bar', confirmed: true },
      // Tom only on E003
      A003: { id: 'A003', eventId: 'E003', unitId: 'U001', staffId: 'S002', area: 'Bar', confirmed: true },
    },
    stock: {
      K001: { id: 'K001', unitId: 'U001', item: 'Lager kegs', qty: 2, par: 6, unit: 'kegs' },
      K002: { id: 'K002', unitId: 'U001', item: 'Wine', qty: 10, par: 6, unit: 'bottles' }, // above par
    },
    applications: {}, kv: {}, certs: {}, availability: {},
  };
}

function store(): OpsData {
  const d = new OpsData();
  // @ts-expect-error inject mirror
  d.db = seed();
  return d;
}

describe('double-booking detection', () => {
  const d = store();
  it('flags a staff member on two overlapping events', () => {
    const dbk = d.doubleBookingsForStaff('S001');
    expect(dbk).toHaveLength(1);
    expect([dbk[0].eventA?.id, dbk[0].eventB?.id].sort()).toEqual(['E001', 'E002']);
  });
  it('does not flag a staff member on non-overlapping events', () => {
    expect(d.doubleBookingsForStaff('S002')).toHaveLength(0);
  });
  it('eventsOverlap is inclusive on the boundary', () => {
    expect(d.eventsOverlap(d.get('events', 'E001'), d.get('events', 'E002'))).toBe(true);
    expect(d.eventsOverlap(d.get('events', 'E001'), d.get('events', 'E003'))).toBe(false);
  });
});

describe('compliance register', () => {
  const d = store();
  it('lists crew with status, blocked first', () => {
    const rows = complianceRegister(d, 'C001');
    expect(rows[0].status).toBe('blocked'); // Tom (pending RTW) or Jordan (missing certs)
    expect(rows.map((r) => r.staffId).sort()).toEqual(['S001', 'S002']);
  });
  it('summary counts + surfaces double-bookings', () => {
    const s = complianceSummary(d, 'C001');
    expect(s.total).toBe(2);
    expect(s.blocked).toBeGreaterThanOrEqual(1);
    expect(s.doubleBookings).toHaveLength(1);
    expect(s.doubleBookings[0].staffName).toBe('Jordan Blake');
  });
});

describe('stock reorder', () => {
  const d = store();
  it('lists only below-par lines with order = par − qty', () => {
    const order = reorderForClient(d, 'C001');
    expect(order).toHaveLength(1); // only lager (wine is above par)
    expect(order[0].item).toBe('Lager kegs');
    expect(order[0].orderQty).toBe(4); // 6 − 2
  });
  it('csv has a header and the line', () => {
    const csv = reorderCsv(reorderForClient(d, 'C001'));
    expect(csv.split('\n')[0]).toBe('Unit,Item,Order qty,UoM');
    expect(csv).toContain('Lager kegs,4');
  });
});

describe('finance', () => {
  const d = store();
  it('event crew cost = confirmed crew × rate × trading hours', () => {
    // E001 Latitude 23–26 Jul = 4 days = 32h; one confirmed (Jordan £12.5) = 400
    const f = eventFinance(d, d.get('events', 'E001')!);
    expect(f.tradingHours).toBe(32);
    expect(f.confirmedCrew).toBe(1);
    expect(f.crewCost).toBe(400);
  });
  it('client finance rolls up all events', () => {
    const cf = clientFinance(d, 'C001', '2026-07-15');
    expect(cf.events).toHaveLength(3);
    // total = E001(400) + E002(3days=24h ×12.5=300) + E003(2days=16h ×12=192)
    expect(cf.totalCrewCost).toBe(400 + 300 + 192);
    expect(cf.totalConfirmed).toBe(3);
    // all three are upcoming relative to 15 Jul
    expect(cf.upcomingCost).toBe(cf.totalCrewCost);
  });
});
