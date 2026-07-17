/* ============================================================
   Parity tests — the ported derived logic must produce the
   SAME answers as opsdeck-data.js on the seed data.

   We instantiate OpsData, inject the seed straight into its
   in-memory mirror (bypassing Supabase), and assert the exact
   staffing gaps, compliance, low-stock and suitability scores.
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { OpsData } from '../src/data/opsData';
import type { OpsState } from '../src/data/types';

/** The exact seed from opsdeck-data.js, as the {table:{id:row}} store. */
function seed(): OpsState {
  return {
    meta: { version: 1, updatedAt: Date.now() },
    clients: {
      C001: { id: 'C001', name: 'JP Events', contact: 'Jay Patel', phone: '447700900001', email: 'jay@jpevents.co.uk', status: 'Active' },
      C002: { id: 'C002', name: 'Coastal Kitchen', contact: 'Sam Reid', phone: '447700900050', email: 'ops@coastalkitchen.co.uk', status: 'Active' },
      C003: { id: 'C003', name: 'CTF', contact: 'Dawn Cole', phone: '447700900070', email: 'hello@ctf.uk', status: 'Lead' },
    },
    events: {
      E001: { id: 'E001', clientId: 'C001', name: 'Latitude', loc: 'Henham Park, Suffolk', start: '2026-07-23', end: '2026-07-26', callTime: '07:00', notes: 'Festival Republic. On-site crew camping.' },
      E002: { id: 'E002', clientId: 'C001', name: 'Cardiff Food Festival', loc: 'Roald Dahl Plass, Cardiff', start: '2026-08-15', end: '2026-08-16', callTime: '08:00', notes: '' },
      E003: { id: 'E003', clientId: 'C002', name: 'Beach Weddings — Aug', loc: 'Ogmore-by-Sea', start: '2026-08-08', end: '2026-08-08', callTime: '11:00', notes: '' },
    },
    units: {
      U001: { id: 'U001', clientId: 'C001', type: 'Bar', code: 'BAR-01', name: 'Main Bar Trailer', crew: 3 },
      U002: { id: 'U002', clientId: 'C001', type: 'Coffee', code: 'COF-01', name: 'Coffee Cart', crew: 2 },
      U003: { id: 'U003', clientId: 'C001', type: 'Food', code: 'FOO-01', name: 'Burger Trailer', crew: 3 },
      U010: { id: 'U010', clientId: 'C002', type: 'Catering', code: 'CAT-01', name: 'Field Kitchen', crew: 4 },
    },
    staff: {
      S001: { id: 'S001', clientId: 'C001', name: 'Jordan Blake', role: 'Unit Manager', phone: '447700900101', rate: 18, rtw: 'Verified', canTow: true },
      S002: { id: 'S002', clientId: 'C001', name: 'Priya Sharma', role: 'Unit Manager', phone: '447700900102', rate: 18, rtw: 'Verified', canTow: true },
      S003: { id: 'S003', clientId: 'C001', name: 'Aaron Ng', role: 'Bartender', phone: '447700900105', rate: 12.5, rtw: 'Verified' },
      S004: { id: 'S004', clientId: 'C001', name: 'Emma Wright', role: 'Barista', phone: '447700900108', rate: 12, rtw: 'Verified' },
      S005: { id: 'S005', clientId: 'C001', name: 'Aisha Khan', role: 'Chef', phone: '447700900110', rate: 16, rtw: 'Verified' },
      S006: { id: 'S006', clientId: 'C001', name: 'Tom Fletcher', role: 'Barista', phone: '447700900109', rate: 12, rtw: 'Pending' },
      S020: { id: 'S020', clientId: 'C002', name: 'Grace Bell', role: 'Kitchen Assistant', phone: '447700900112', rate: 11.5, rtw: 'Verified' },
    },
    assignments: {
      A001: { id: 'A001', eventId: 'E001', unitId: 'U001', staffId: 'S001' },
      A002: { id: 'A002', eventId: 'E001', unitId: 'U001', staffId: 'S003' },
      A003: { id: 'A003', eventId: 'E001', unitId: 'U002', staffId: 'S004' },
      A004: { id: 'A004', eventId: 'E001', unitId: 'U003', staffId: 'S005' },
    },
    stock: {
      K001: { id: 'K001', unitId: 'U001', item: 'Lager kegs', qty: 4, par: 6, unit: 'kegs' },
      K002: { id: 'K002', unitId: 'U001', item: 'Prosecco', qty: 24, par: 12, unit: 'btls' },
      K003: { id: 'K003', unitId: 'U001', item: 'Serve cups', qty: 500, par: 300, unit: 'cups' },
      K004: { id: 'K004', unitId: 'U002', item: 'Coffee beans', qty: 3, par: 5, unit: 'kg' },
      K005: { id: 'K005', unitId: 'U002', item: 'Oat milk', qty: 8, par: 6, unit: 'ltr' },
      K006: { id: 'K006', unitId: 'U002', item: 'Cups + lids', qty: 800, par: 400, unit: 'ea' },
      K007: { id: 'K007', unitId: 'U003', item: 'Burger patties', qty: 40, par: 60, unit: 'ea' },
      K008: { id: 'K008', unitId: 'U003', item: 'Brioche buns', qty: 50, par: 60, unit: 'ea' },
      K009: { id: 'K009', unitId: 'U003', item: 'LPG 47kg', qty: 1, par: 2, unit: 'cyl' },
      K010: { id: 'K010', unitId: 'U010', item: 'Napkins', qty: 2000, par: 1500, unit: 'ea' },
      K011: { id: 'K011', unitId: 'U010', item: 'Chafing gel', qty: 6, par: 8, unit: 'tins' },
    },
    applications: {},
    kv: {},
    certs: {}, availability: {},
  };
}

/** Build an OpsData with the seed injected into its private mirror. */
function makeStore(): OpsData {
  const d = new OpsData();
  // @ts-expect-error — intentionally reach into the private mirror for tests
  d.db = seed();
  return d;
}

describe('relational helpers', () => {
  const d = makeStore();

  it('events/units/staff scope to their client', () => {
    expect(d.eventsForClient('C001').map((e) => e.id).sort()).toEqual(['E001', 'E002']);
    expect(d.unitsForClient('C001').map((u) => u.id).sort()).toEqual(['U001', 'U002', 'U003']);
    expect(d.staffForClient('C002').map((s) => s.id)).toEqual(['S020']);
  });

  it('unitsForEvent falls back to the client fleet when no explicit unitIds', () => {
    const e = d.get('events', 'E001')!;
    expect(d.unitsForEvent(e).map((u: any) => u.id).sort()).toEqual(['U001', 'U002', 'U003']);
  });
});

describe('staffing model', () => {
  const d = makeStore();

  it('areaOfUnit maps types to areas', () => {
    expect(d.areaOfUnit(d.get('units', 'U001'))).toBe('Bar');
    expect(d.areaOfUnit(d.get('units', 'U002'))).toBe('Coffee');
    expect(d.areaOfUnit(d.get('units', 'U003'))).toBe('Food');
    expect(d.areaOfUnit(d.get('units', 'U010'))).toBe('Food'); // Catering -> Food
  });

  it('skillsOf derives from role', () => {
    expect(d.skillsOf(d.get('staff', 'S001'))).toEqual(['Bar', 'Supervisor', 'General']); // manager
    expect(d.skillsOf(d.get('staff', 'S003'))).toEqual(['Bar', 'General']);   // bartender
    expect(d.skillsOf(d.get('staff', 'S004'))).toEqual(['Coffee', 'General']); // barista
    expect(d.skillsOf(d.get('staff', 'S005'))).toEqual(['Food', 'Supervisor']); // chef
  });

  it('staffingFor Latitude = Bar 3, Coffee 2, Food 3 (summed unit crew)', () => {
    const e = d.get('events', 'E001')!;
    const need = d.staffingFor(e);
    expect(need.Bar).toBe(3);
    expect(need.Coffee).toBe(2);
    expect(need.Food).toBe(3);
  });

  it('assignments leave real gaps: Latitude has 4 assigned of 8 needed', () => {
    const assigned = d.assignmentsForEvent('E001').length;
    const e = d.get('events', 'E001')!;
    const need = d.staffingFor(e);
    const totalNeed = need.Bar + need.Coffee + need.Food; // 3+2+3 = 8
    expect(assigned).toBe(4);
    expect(totalNeed).toBe(8);
    expect(totalNeed - assigned).toBe(4); // 4 crew short — matches the Home screen
  });
});

describe('compliance', () => {
  const d = makeStore();

  it('verified staff with no certs is compliant', () => {
    const c = d.staffCompliance(d.get('staff', 'S001'));
    expect(c.rtwOk).toBe(true);
    expect(c.ok).toBe(true);
  });

  it('pending RTW fails compliance (Tom Fletcher)', () => {
    const c = d.staffCompliance(d.get('staff', 'S006'));
    expect(c.rtwOk).toBe(false);
    expect(c.ok).toBe(false);
  });
});

describe('low stock', () => {
  const d = makeStore();

  it('JP Events (C001) low-stock lines are exactly the 3 below par', () => {
    const low = d.lowStockForClient('C001').map((s) => s.item).sort();
    // Lager kegs 4<6, Coffee beans 3<5, Burger patties 40<60, LPG 1<2, Brioche 50<60
    expect(low).toEqual(['Brioche buns', 'Burger patties', 'Coffee beans', 'LPG 47kg', 'Lager kegs']);
  });

  it('Coastal Kitchen (C002) has one low line: Chafing gel', () => {
    const low = d.lowStockForClient('C002').map((s) => s.item);
    expect(low).toEqual(['Chafing gel']);
  });
});

describe('suitability scoring', () => {
  const d = makeStore();

  it('ranks a skilled, compliant, own-client bartender top for the Bar unit', () => {
    const unit = d.get('units', 'U001')!; // Bar
    const ev = d.get('events', 'E001')!;
    const ranked = d.suitableForUnit(unit, { event: ev });
    // Top candidate must be Bar-skilled and not blocked.
    expect(ranked[0].skillOk).toBe(true);
    expect(ranked[0].blocked).toBe(false);
    // Tom Fletcher (barista, RTW pending) must be blocked & flagged.
    const tom = ranked.find((r) => r.id === 'S006')!;
    expect(tom.blocked).toBe(true);
    expect(tom.reasons).toContain('RTW pending');
  });

  it('pins EXACT scores per the formula (skill100+avail30+compliant25+own15+reliability)', () => {
    const unit = d.get('units', 'U001')!;
    const ranked = d.suitableForUnit(unit, { event: d.get('events', 'E001')! });
    const byId = Object.fromEntries(ranked.map((r) => [r.id, r]));

    // Jordan (manager: Bar skill, verified, own client, 0 past shifts):
    //   100 + 30 + 25 + 15 + 0 = 170
    expect(byId.S001.score).toBe(170);
    // Aaron (bartender: Bar skill, verified, own client): 100+30+25+15+0 = 170
    expect(byId.S003.score).toBe(170);
    // Emma (barista: NO Bar skill, verified, own client): 0+30+25+15+0 = 70
    expect(byId.S004.score).toBe(70);
    // Tom (barista: NO Bar skill, RTW pending -> not compliant, own client):
    //   0 + 30 + 0 + 15 + 0 = 45
    expect(byId.S006.score).toBe(45);
  });

  it('ranks strictly by score descending', () => {
    const unit = d.get('units', 'U001')!;
    const ranked = d.suitableForUnit(unit, { event: d.get('events', 'E001')! });
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    }
  });
});

describe('event colour is deterministic', () => {
  const d = makeStore();
  it('same id always yields the same colour', () => {
    expect(d.eventColor('E001')).toBe(d.eventColor('E001'));
    expect(d.eventColor('E001')).toMatch(/^oklch/);
  });
});
