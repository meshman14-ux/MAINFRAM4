/* Phase 7 — Client Portal selector tests. */
import { describe, it, expect } from 'vitest';
import { OpsData } from '../src/data/opsData';
import type { OpsState } from '../src/data/types';
import { portalEvents, portalSummary } from '../src/data/portal';

function seed(): OpsState {
  return {
    meta: { version: 1, updatedAt: Date.now() },
    clients: { C002: { id: 'C002', name: 'Coastal Kitchen', status: 'Active' }, C001: { id: 'C001', name: 'JP Events', status: 'Active' } },
    events: {
      // C002's own events
      E010: { id: 'E010', clientId: 'C002', name: 'Harbour Wedding', loc: 'Padstow', start: '2026-08-08', end: '2026-08-08', schedule: [{ id: 'd1', date: '2026-08-08', phase: 'Trading Day' }] },
      E011: { id: 'E011', clientId: 'C002', name: 'Food Fest', loc: 'Truro', start: '2026-09-01', end: '2026-09-02' },
      // someone else's event — must NOT appear
      E001: { id: 'E001', clientId: 'C001', name: 'Latitude', start: '2026-07-23', end: '2026-07-26' },
    },
    units: { U010: { id: 'U010', clientId: 'C002', type: 'Catering', code: 'CAT-01', name: 'Catering Unit', crew: 2 } },
    staff: { S010: { id: 'S010', clientId: 'C002', name: 'Sam Reid', role: 'Chef', rtw: 'Verified' } },
    assignments: {
      A010: { id: 'A010', eventId: 'E010', unitId: 'U010', staffId: 'S010', area: 'Food', confirmed: true },
    },
    stock: {}, applications: {}, kv: {}, certs: {}, availability: {},
  };
}

function store(): OpsData {
  const d = new OpsData();
  // @ts-expect-error inject mirror
  d.db = seed();
  return d;
}

const TODAY = '2026-07-15';

describe('portal events', () => {
  const d = store();
  it('shows only the client\'s own events', () => {
    const evs = portalEvents(d, 'C002', TODAY);
    expect(evs.map((e) => e.id).sort()).toEqual(['E010', 'E011']);
    // never leaks another client's event
    expect(evs.find((e) => e.id === 'E001')).toBeUndefined();
  });

  it('computes staffing and readiness percentages', () => {
    const evs = portalEvents(d, 'C002', TODAY);
    const wedding = evs.find((e) => e.id === 'E010')!;
    expect(wedding.need).toBe(2);        // catering unit crew target
    expect(wedding.confirmed).toBe(1);
    expect(wedding.staffingPct).toBe(50);
    expect(wedding.readinessPct).toBeGreaterThanOrEqual(0);
    expect(wedding.readinessPct).toBeLessThanOrEqual(100);
  });

  it('gives a friendly countdown label', () => {
    const evs = portalEvents(d, 'C002', TODAY);
    expect(evs.find((e) => e.id === 'E010')!.countdownLabel).toMatch(/days to go/);
  });
});

describe('portal summary', () => {
  const d = store();
  it('names the client and counts upcoming, picks the next event', () => {
    const s = portalSummary(d, 'C002', TODAY);
    expect(s.clientName).toBe('Coastal Kitchen');
    expect(s.upcoming).toBe(2);
    expect(s.nextEvent?.id).toBe('E010'); // soonest
  });
});
