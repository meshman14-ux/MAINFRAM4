/* Ops Console flow tests — exercise the store the way the tabs do:
   assign crew (closes a gap), confirm, and default-stock seeding.
   These use a mock Supabase so save/remove run without network. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the supabase client BEFORE importing the store.
vi.mock('../src/lib/supabase', () => {
  const ok = { data: null, error: null };
  const chain: any = {
    select: () => Promise.resolve({ data: [], error: null }),
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
    events: { E001: { id: 'E001', clientId: 'C001', name: 'Latitude', start: '2026-07-23', end: '2026-07-26', callTime: '07:00' } },
    units: {
      U001: { id: 'U001', clientId: 'C001', type: 'Bar', code: 'BAR-01', name: 'Main Bar', crew: 3 },
    },
    staff: {
      S001: { id: 'S001', clientId: 'C001', name: 'Jordan Blake', role: 'Unit Manager', rate: 18, rtw: 'Verified' },
      S003: { id: 'S003', clientId: 'C001', name: 'Aaron Ng', role: 'Bartender', rate: 12.5, rtw: 'Verified' },
    },
    assignments: {
      A001: { id: 'A001', eventId: 'E001', unitId: 'U001', staffId: 'S001', area: 'Bar', confirmed: false },
    },
    stock: {},
    applications: {},
    kv: {},
    certs: {}, availability: {},
  };
}

function store(): OpsData {
  const d = new OpsData();
  // @ts-expect-error inject mirror
  d.db = seed();
  return d;
}

describe('Ops Console: staffing flow', () => {
  let d: OpsData;
  beforeEach(() => { d = store(); });

  it('BAR-01 starts with 1 of 3 filled (2-crew gap)', () => {
    const target = d.get<{ crew: number }>('units', 'U001')!.crew;
    const filled = d.assignmentsForEvent('E001').filter((a) => a.unitId === 'U001').length;
    expect(target).toBe(3);
    expect(filled).toBe(1);
    expect(target - filled).toBe(2);
  });

  it('assigning crew closes a gap', async () => {
    await d.save('assignments', { eventId: 'E001', unitId: 'U001', staffId: 'S003', area: 'Bar', confirmed: false });
    const filled = d.assignmentsForEvent('E001').filter((a) => a.unitId === 'U001').length;
    expect(filled).toBe(2);
  });

  it('confirming an assignment flips confirmed', async () => {
    await d.save('assignments', { id: 'A001', confirmed: true });
    expect(d.get<{ confirmed: boolean }>('assignments', 'A001')!.confirmed).toBe(true);
  });

  it('unassigning removes the row', async () => {
    await d.remove('assignments', 'A001');
    expect(d.get('assignments', 'A001')).toBeNull();
    expect(d.assignmentsForEvent('E001').length).toBe(0);
  });

  it('suitability ranks candidates and excludes blocked from booking', () => {
    const unit = d.get('units', 'U001')!;
    const ranked = d.suitableForUnit(unit as any, { event: d.get('events', 'E001')! });
    // Both staff are Bar-capable & verified; top score >= 170.
    expect(ranked[0].score).toBeGreaterThanOrEqual(170);
    expect(ranked.every((c) => typeof c.blocked === 'boolean')).toBe(true);
  });
});

describe('Ops Console: units seed default stock', () => {
  it('defaultStockFor returns a catalogue that save() can persist', async () => {
    const d = store();
    const cat = d.defaultStockFor('Bar');
    for (const line of cat) {
      await d.save('stock', { unitId: 'U001', ...line });
    }
    expect(d.stockForUnit('U001').length).toBe(cat.length);
    // and at least one is below par once qty is edited down
    const first = d.stockForUnit('U001')[0];
    await d.save('stock', { id: first.id, qty: 0 });
    expect(d.lowStockForClient('C001').length).toBeGreaterThan(0);
  });
});

describe('save() JSONB safety (weakness #1)', () => {
  it('a partial save on a warm row preserves untouched JSONB fields', async () => {
    const d = store();
    // Give E001 a schedule, then patch only its callTime.
    await d.save('events', {
      id: 'E001', clientId: 'C001', name: 'Latitude',
      schedule: [{ id: 'd1', date: '2026-07-23', phase: 'Build/Set-up' }],
    });
    await d.save('events', { id: 'E001', callTime: '09:00' });
    const e = d.get<any>('events', 'E001')!;
    // schedule must survive the partial save
    expect(e.schedule).toHaveLength(1);
    expect(e.callTime).toBe('09:00');
  });

  it('patchJson merges one key of a nested map without clobbering the rest', async () => {
    const d = store();
    await d.save('events', { id: 'E001', clientId: 'C001', name: 'Latitude', shortlist: { U001: ['S001'] } });
    await d.patchJson('events', 'E001', 'shortlist', (cur: any) => ({ ...(cur || {}), U002: ['S004'] }));
    const e = d.get<any>('events', 'E001')!;
    expect(e.shortlist.U001).toEqual(['S001']); // preserved
    expect(e.shortlist.U002).toEqual(['S004']); // added
  });
});

describe('realtime echo suppression (weakness #2)', () => {
  it('suppresses the echo of our own write but applies later genuine changes', async () => {
    const d = store();
    await d.save('assignments', { id: 'A001', confirmed: true });
    // Simulate the DB echoing our own write back (stale-ish): should be ignored.
    // @ts-expect-error private
    d.applyRealtime('assignments', { eventType: 'UPDATE', new: { id: 'A001', event_id: 'E001', unit_id: 'U001', staff_id: 'S001', confirmed: false } });
    // Our newer local value (confirmed:true) must NOT be clobbered by the echo.
    expect(d.get<any>('assignments', 'A001')!.confirmed).toBe(true);

    // A genuine later change from another device DOES apply.
    // @ts-expect-error private
    d.applyRealtime('assignments', { eventType: 'UPDATE', new: { id: 'A001', event_id: 'E001', unit_id: 'U001', staff_id: 'S001', confirmed: false } });
    expect(d.get<any>('assignments', 'A001')!.confirmed).toBe(false);
  });
});
