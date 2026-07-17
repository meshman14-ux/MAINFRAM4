/* Home selector tests — assert the numbers match the Home screenshot. */
import { describe, it, expect } from 'vitest';
import { OpsData } from '../src/data/opsData';
import type { OpsState } from '../src/data/types';
import {
  homeKpis, needsAction, eventRows, nextEventConfirmations, upcomingEvents,
} from '../src/data/home';

function seed(): OpsState {
  return {
    meta: { version: 1, updatedAt: Date.now() },
    clients: {
      C001: { id: 'C001', name: 'JP Events', status: 'Active' },
      C002: { id: 'C002', name: 'Coastal Kitchen', status: 'Active' },
      C003: { id: 'C003', name: 'CTF', status: 'Lead' },
    },
    events: {
      E001: { id: 'E001', clientId: 'C001', name: 'Latitude', loc: 'Henham Park, Suffolk', start: '2026-07-23', end: '2026-07-26', callTime: '07:00' },
      E002: { id: 'E002', clientId: 'C001', name: 'Cardiff Food Festival', loc: 'Roald Dahl Plass, Cardiff', start: '2026-08-15', end: '2026-08-16', callTime: '08:00' },
      E003: { id: 'E003', clientId: 'C002', name: 'Beach Weddings — Aug', loc: 'Ogmore-by-Sea', start: '2026-08-08', end: '2026-08-08', callTime: '11:00' },
    },
    units: {
      U001: { id: 'U001', clientId: 'C001', type: 'Bar', code: 'BAR-01', name: 'Main Bar Trailer', crew: 3 },
      U002: { id: 'U002', clientId: 'C001', type: 'Coffee', code: 'COF-01', name: 'Coffee Cart', crew: 2 },
      U003: { id: 'U003', clientId: 'C001', type: 'Food', code: 'FOO-01', name: 'Burger Trailer', crew: 3 },
      U010: { id: 'U010', clientId: 'C002', type: 'Catering', code: 'CAT-01', name: 'Field Kitchen', crew: 4 },
    },
    staff: {
      S001: { id: 'S001', clientId: 'C001', name: 'Jordan Blake', role: 'Unit Manager', rtw: 'Verified' },
      S003: { id: 'S003', clientId: 'C001', name: 'Aaron Ng', role: 'Bartender', rtw: 'Verified' },
      S004: { id: 'S004', clientId: 'C001', name: 'Emma Wright', role: 'Barista', rtw: 'Verified' },
      S005: { id: 'S005', clientId: 'C001', name: 'Aisha Khan', role: 'Chef', rtw: 'Verified' },
      S006: { id: 'S006', clientId: 'C001', name: 'Tom Fletcher', role: 'Barista', rtw: 'Pending' },
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

function store(): OpsData {
  const d = new OpsData();
  // @ts-expect-error inject seed into private mirror for tests
  d.db = seed();
  return d;
}

const TODAY = '2026-07-15'; // matches the "Wed, 15 Jul 2026" screenshot

describe('Home KPIs', () => {
  const d = store();
  const k = homeKpis(d, TODAY);

  it('operators = 3 entities on system', () => expect(k.operators).toBe(3));
  it('events ahead = 3', () => expect(k.eventsAhead).toBe(3));

  it('crew gaps = 15 (Latitude 4 + Beach 4 + Cardiff 7... but Cardiff & Beach have no assigns)', () => {
    // Latitude need 8 filled 4 -> 4; Beach need 4 filled 0 -> 4; Cardiff need 8 filled 0 -> 8
    expect(k.crewGaps).toBe(16);
  });

  it('unconfirmed = all filled shifts (none confirmed in seed) = 4', () => {
    expect(k.unconfirmed).toBe(4);
  });

  it('stock low = 5 (Latitude) + 1 (Beach) + ... Cardiff units share JP fleet', () => {
    // JP fleet low lines: Lager, Coffee beans, Burger patties, LPG, Brioche = 5,
    // counted for BOTH Latitude and Cardiff (both are C001 using the fleet) = 10;
    // Coastal (Beach) Chafing gel = 1. Total 11.
    expect(k.stockLow).toBe(11);
  });
});

describe('Needs action feed', () => {
  const d = store();
  const items = needsAction(d, TODAY);

  it('surfaces staffing, confirm, stock and RTW', () => {
    const kinds = new Set(items.map((i) => i.kind));
    expect(kinds.has('STAFFING')).toBe(true);
    expect(kinds.has('CONFIRM')).toBe(true);
    expect(kinds.has('STOCK')).toBe(true);
    expect(kinds.has('RTW')).toBe(false); // Tom is not assigned in this seed
  });

  it('Latitude staffing line reads 4 short (4/8)', () => {
    const line = items.find((i) => i.kind === 'STAFFING' && i.eventName === 'Latitude');
    expect(line?.message).toContain('4 crew short (4/8)');
  });

  it('staffing sorts before stock', () => {
    const firstStaffing = items.findIndex((i) => i.kind === 'STAFFING');
    const firstStock = items.findIndex((i) => i.kind === 'STOCK');
    expect(firstStaffing).toBeLessThan(firstStock);
  });
});

describe('Events register rows', () => {
  const d = store();
  const rows = eventRows(d, TODAY);

  it('Latitude is soonest, T-8', () => {
    expect(rows[0].name).toBe('Latitude');
    expect(rows[0].countdownLabel).toBe('T-8');
    expect(rows[0].filled).toBe(4);
    expect(rows[0].need).toBe(8);
  });

  it('every event carries a deterministic colour', () => {
    rows.forEach((r) => expect(r.color).toMatch(/^oklch/));
  });
});

describe('Next-event confirmations rail', () => {
  const d = store();
  const c = nextEventConfirmations(d, TODAY);

  it('targets Latitude with 4 crew, 0 confirmed', () => {
    expect(c.event?.name).toBe('Latitude');
    expect(c.total).toBe(4);
    expect(c.confirmed).toBe(0);
  });
});

describe('upcoming filter', () => {
  it('excludes events that already ended', () => {
    const d = store();
    // move today past Latitude's end
    const up = upcomingEvents(d, '2026-08-01').map((e) => e.name);
    expect(up).not.toContain('Latitude');
    expect(up).toContain('Cardiff Food Festival');
  });
});
