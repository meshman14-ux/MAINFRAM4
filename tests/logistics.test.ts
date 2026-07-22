/* Phase 9 — Logistics (vehicle & driver movements) tests. Ported from
   Logistics.dc.html: movements per event, status cycling, and the driver
   clash detector (double-booking across overlapping events), reusing
   eventsOverlap() from the Phase 6 work. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/supabase', () => {
  const ok = { data: null, error: null };
  const chain: any = {
    select: () => ({
      eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    }),
    upsert: () => Promise.resolve(ok),
    delete: () => ({ eq: () => Promise.resolve(ok) }),
  };
  return {
    supabase: {
      from: () => chain,
      channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }), subscribe: () => ({}) }),
    },
  };
});

import { OpsData } from '../src/data/opsData';
import type { OpsState } from '../src/data/types';

function seed(): OpsState {
  return {
    meta: { version: 1, updatedAt: Date.now() },
    clients: { C001: { id: 'C001', name: 'JP Events', status: 'Active' } },
    events: {
      E001: { id: 'E001', clientId: 'C001', name: 'Latitude', start: '2026-07-23', end: '2026-07-26' },
      E002: { id: 'E002', clientId: 'C001', name: 'Camp Bestival', start: '2026-07-25', end: '2026-07-27' },
      E003: { id: 'E003', clientId: 'C001', name: 'Cardiff', start: '2026-08-15', end: '2026-08-16' },
    },
    units: {
      U001: { id: 'U001', clientId: 'C001', type: 'Bar', code: 'BAR-01', name: 'Main Bar', crew: 2 },
    },
    staff: {
      S001: { id: 'S001', clientId: 'C001', name: 'Jordan Blake', role: 'Driver', rtw: 'Verified', canTow: true },
      S002: { id: 'S002', clientId: 'C001', name: 'Priya Sharma', role: 'Bartender', rtw: 'Verified', canTow: false },
    },
    assignments: {}, stock: {}, applications: {}, kv: {}, certs: {}, availability: {},
    pipeline: {}, movements: {},
  };
}

function store(): OpsData {
  const d = new OpsData();
  // @ts-expect-error inject mirror
  d.db = seed();
  return d;
}

describe('adding movements', () => {
  let d: OpsData;
  beforeEach(() => { d = store(); });

  it('a movement with a real unit is marked tow=true', async () => {
    const m = await d.addMovement('E001', 'S001', { unitId: 'U001', departDate: '2026-07-23', departTime: '07:00' });
    expect(m.tow).toBe(true);
    expect(m.status).toBe('planned');
    expect(d.movementsForEvent('E001')).toHaveLength(1);
  });

  it('a movement with no unit (support van) is tow=false', async () => {
    const m = await d.addMovement('E001', 'S001', {});
    expect(m.tow).toBe(false);
    expect(m.unitId).toBeUndefined();
  });

  it('defaults depart time to 08:00 when not given', async () => {
    const m = await d.addMovement('E001', 'S001', { unitId: 'U001' });
    expect(m.departTime).toBe('08:00');
  });
});

describe('status cycling', () => {
  it('cycles planned -> en-route -> on-site -> returned -> planned', async () => {
    const d = store();
    const m = await d.addMovement('E001', 'S001', { unitId: 'U001' });
    const seen: string[] = [m.status];
    for (let i = 0; i < 4; i++) {
      await d.advanceMovement(m.id);
      seen.push(d.movementsForEvent('E001')[0].status);
    }
    expect(seen).toEqual(['planned', 'en-route', 'on-site', 'returned', 'planned']);
  });
});

describe('removing a movement', () => {
  it('removes it from the event\'s list', async () => {
    const d = store();
    const m = await d.addMovement('E001', 'S001', { unitId: 'U001' });
    await d.removeMovement(m.id);
    expect(d.movementsForEvent('E001')).toHaveLength(0);
  });
});

describe('eligible drivers', () => {
  it('prefers staff who can tow or have the Driver skill', () => {
    const d = store();
    const drivers = d.eligibleDrivers('C001');
    expect(drivers.map((s) => s.id)).toEqual(['S001']);
  });

  it('falls back to the whole roster if nobody qualifies', () => {
    const seedData = seed();
    seedData.staff.S001.canTow = false;
    seedData.staff.S001.role = 'Chef';
    const d = new OpsData();
    // @ts-expect-error inject mirror
    d.db = seedData;
    const drivers = d.eligibleDrivers('C001');
    expect(drivers).toHaveLength(2);
  });
});

describe('driver clash detection (reuses eventsOverlap)', () => {
  it('flags a driver already on a movement for an OVERLAPPING event', async () => {
    const d = store();
    await d.addMovement('E002', 'S001', { unitId: 'U001' });
    const clashes = d.driverClashesForEvent('C001', d.get('events', 'E001')!);
    expect(clashes['S001']).toBe('Camp Bestival');
  });

  it('does NOT flag a driver on a movement for a NON-overlapping event', async () => {
    const d = store();
    await d.addMovement('E003', 'S001', { unitId: 'U001' });
    const clashes = d.driverClashesForEvent('C001', d.get('events', 'E001')!);
    expect(clashes['S001']).toBeUndefined();
  });

  it('does not flag a driver against their own movement on the SAME event', async () => {
    const d = store();
    await d.addMovement('E001', 'S001', { unitId: 'U001' });
    const clashes = d.driverClashesForEvent('C001', d.get('events', 'E001')!);
    expect(clashes['S001']).toBeUndefined();
  });
});

describe('logistics summary', () => {
  it('counts movements, en-route, and tow-capable drivers for upcoming events', async () => {
    const d = store();
    const m1 = await d.addMovement('E001', 'S001', { unitId: 'U001' });
    await d.addMovement('E002', 'S002', {});
    await d.advanceMovement(m1.id);

    const s = d.logisticsSummary('C001', '2026-07-15');
    expect(s.movements).toBe(2);
    expect(s.enRoute).toBe(1);
    expect(s.towDrivers).toBe(1);
  });

  it('excludes movements on events that have already passed', async () => {
    const d = store();
    await d.addMovement('E001', 'S001', { unitId: 'U001' });
    const s = d.logisticsSummary('C001', '2026-08-01');
    expect(s.movements).toBe(0);
  });
});
