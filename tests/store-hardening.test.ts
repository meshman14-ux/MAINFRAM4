/* Store hardening tests (audit C4/C5, M1, M10). Mocks the Supabase client so
   writes can be forced to fail, proving the optimistic mirror is rolled back
   and the failure is reported — the highest-risk paths that had no coverage. */
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Force every write to reject; reads (cold-mirror fetch) return nothing.
let failWrites = true;
vi.mock('../src/lib/supabase', () => {
  const err = () => (failWrites ? { error: { message: 'denied' } } : { error: null });
  const chain: any = {
    upsert: async () => err(),
    delete: () => ({ eq: () => ({ eq: async () => err() }), }),
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
  };
  // delete().eq() must be awaitable AND chainable to a second eq() (availability)
  chain.delete = () => {
    const d: any = { eq: () => d, then: (r: any) => Promise.resolve(err()).then(r) };
    return d;
  };
  return {
    supabase: {
      from: () => chain,
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {},
    },
  };
});

import { OpsData } from '../src/data/opsData';
import type { OpsState } from '../src/data/types';

function seed(): OpsState {
  return {
    meta: { version: 1, updatedAt: 1 },
    clients: { C001: { id: 'C001', name: 'JP Events', status: 'Active' } },
    events: {}, units: {}, staff: {}, assignments: {}, stock: {}, applications: {},
    kv: { pins: { C001: [{ id: 'p1', text: 'keep', tone: 'x' }] } },
    certs: {}, availability: {}, pipeline: {}, movements: {}, eventTasks: {},
    timesheets: {}, vehicles: {}, invoices: {}, expenses: {}, documents: {}, shoppingLists: {},
  };
}
function store(): OpsData {
  const d = new OpsData();
  // @ts-expect-error inject mirror
  d.db = seed();
  return d;
}

beforeEach(() => { failWrites = true; });

describe('optimistic-write rollback (C4) + error surfacing (C5)', () => {
  it('restores an edited row when the save fails', async () => {
    const d = store();
    const errors: string[] = [];
    d.subscribeError((m) => errors.push(m));
    await expect(d.save('clients', { id: 'C001', name: 'CHANGED' })).rejects.toThrow();
    expect(d.get<any>('clients', 'C001').name).toBe('JP Events');  // rolled back
    expect(errors.length).toBe(1);
    expect(errors[0]).toMatch(/save clients/);
  });

  it('removes a phantom new row when the create fails', async () => {
    const d = store();
    await expect(d.save('clients', { name: 'Ghost' })).rejects.toThrow();
    expect(d.all('clients')).toHaveLength(1);  // only the original
  });

  it('restores cascaded deletes when a remove fails', async () => {
    const d = store();
    // add an event under the client so remove('clients') would cascade
    // @ts-expect-error inject
    d.db.events = { E1: { id: 'E1', clientId: 'C001', name: 'X' } };
    await expect(d.remove('clients', 'C001')).rejects.toThrow();
    expect(d.get('clients', 'C001')).toBeTruthy();
    expect(d.get('events', 'E1')).toBeTruthy();  // cascade restored too
  });

  it('restores a kv namespace when kvSet fails', async () => {
    const d = store();
    await expect(d.kvSet('pins', { C001: [] })).rejects.toThrow();
    expect(d.kvGet<any>('pins').C001).toHaveLength(1);  // original kept
  });

  it('a successful write leaves the change in place and reports nothing', async () => {
    failWrites = false;
    const d = store();
    const errors: string[] = [];
    d.subscribeError((m) => errors.push(m));
    await d.save('clients', { id: 'C001', name: 'Renamed' });
    expect(d.get<any>('clients', 'C001').name).toBe('Renamed');
    expect(errors).toHaveLength(0);
  });
});

describe('reset on sign-out (M1)', () => {
  it('clears the mirror and marks the store not-ready', () => {
    const d = store();
    expect(d.all('clients')).toHaveLength(1);
    d.reset();
    expect(d.isReady()).toBe(false);
    expect(d.all('clients')).toHaveLength(0);
    expect(d.kvGet('pins')).toBeNull();
  });
});

describe('uid entropy (M10)', () => {
  it('emits prefixed, unique ids with no collisions across a large batch', () => {
    const d = store();
    const ids = new Set<string>();
    for (let i = 0; i < 5000; i++) ids.add(d.uid('events'));
    expect(ids.size).toBe(5000);
    expect([...ids][0]).toMatch(/^E-/);
  });
});
