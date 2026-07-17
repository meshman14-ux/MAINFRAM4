/* Phase 5 tests — callouts, open jobs, apply→approve→assign, onboarding, readiness. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase so save/remove run without network.
vi.mock('../src/lib/supabase', () => {
  const ok = { data: null, error: null };
  const chain: any = {
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }), maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
    upsert: () => Promise.resolve(ok),
    delete: () => ({ eq: () => ({ eq: () => Promise.resolve(ok) }) }),
  };
  // select() also needs to be awaitable (returns {data:[]}) for load; not used here.
  return {
    supabase: {
      from: () => chain,
      channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }), subscribe: () => ({}) }),
    },
  };
});

import { OpsData } from '../src/data/opsData';
import type { OpsState } from '../src/data/types';
import {
  openPositionsForEvent, openJobsForClient, openJobsForCrew,
  applicantsForEvent, onboardingState, readinessForClient,
} from '../src/data/phase5';

function seed(): OpsState {
  return {
    meta: { version: 1, updatedAt: Date.now() },
    clients: { C001: { id: 'C001', name: 'JP Events', status: 'Active' }, C009: { id: 'C009', name: 'New Co', status: 'Lead' } },
    events: {
      E001: { id: 'E001', clientId: 'C001', name: 'Latitude', start: '2026-07-23', end: '2026-07-26', callTime: '07:00', callout: { open: true }, schedule: [{ id: 'd1', date: '2026-07-23', phase: 'Build' }] },
    },
    units: {
      U001: { id: 'U001', clientId: 'C001', type: 'Bar', code: 'BAR-01', name: 'Main Bar', crew: 3 },
      U002: { id: 'U002', clientId: 'C001', type: 'Coffee', code: 'COF-01', name: 'Coffee', crew: 2 },
    },
    staff: {
      S001: { id: 'S001', clientId: 'C001', name: 'Jordan Blake', role: 'Unit Manager', rtw: 'Verified' },
      S003: { id: 'S003', clientId: 'C001', name: 'Aaron Ng', role: 'Bartender', rtw: 'Verified' },
      S004: { id: 'S004', clientId: 'C001', name: 'Emma Wright', role: 'Barista', rtw: 'Verified' },
    },
    assignments: {
      A001: { id: 'A001', eventId: 'E001', unitId: 'U001', staffId: 'S001', area: 'Bar', confirmed: true },
    },
    stock: {},
    applications: {},
    kv: {}, certs: {}, availability: {},
  };
}

function store(): OpsData {
  const d = new OpsData();
  // @ts-expect-error inject mirror
  d.db = seed();
  return d;
}

describe('open positions', () => {
  const d = store();
  it('derives gaps per unit (Bar 3-1=2, Coffee 2-0=2)', () => {
    const pos = openPositionsForEvent(d, d.get('events', 'E001')!);
    const bar = pos.find((p) => p.unitId === 'U001')!;
    const cof = pos.find((p) => p.unitId === 'U002')!;
    expect(bar.gap).toBe(2);
    expect(cof.gap).toBe(2);
  });
  it('openJobsForClient only lists events with an open callout', () => {
    const jobs = openJobsForClient(d, 'C001');
    expect(jobs.length).toBe(2); // two units with gaps on the open-callout event
  });
});

describe('open jobs for crew', () => {
  const d = store();
  it('a bartender is eligible for the Bar gap, not the Coffee gap', () => {
    const jobs = openJobsForCrew(d, 'S003'); // Aaron, Bartender
    const bar = jobs.find((j) => j.unitId === 'U001')!;
    const cof = jobs.find((j) => j.unitId === 'U002')!;
    expect(bar.eligible).toBe(true);
    expect(cof.eligible).toBe(false);
    expect(cof.reasons).toContain('no Coffee skill');
  });
});

describe('apply → approve → assign flow', () => {
  let d: OpsData;
  beforeEach(() => { d = store(); });

  it('crew apply creates an application', async () => {
    await d.apply('E001', 'U001', 'S003', 'Bar');
    const apps = d.applicationsForEvent('E001');
    expect(apps).toHaveLength(1);
    expect(apps[0].status).toBe('applied');
  });

  it('operator approve creates an assignment and links it', async () => {
    const app = await d.apply('E001', 'U001', 'S003', 'Bar');
    const before = d.assignmentsForEvent('E001').length;
    await d.approveApplication(app.id);
    const after = d.assignmentsForEvent('E001').length;
    expect(after).toBe(before + 1);
    const updated = d.get<any>('applications', app.id);
    expect(updated.status).toBe('approved');
    expect(updated.assignmentId).toBeTruthy();
    // the created assignment exists and matches
    expect(d.get('assignments', updated.assignmentId)).toBeTruthy();
  });

  it('decline marks the application without assigning', async () => {
    const app = await d.apply('E001', 'U001', 'S003', 'Bar');
    const before = d.assignmentsForEvent('E001').length;
    await d.declineApplication(app.id);
    expect(d.get<any>('applications', app.id).status).toBe('declined');
    expect(d.assignmentsForEvent('E001').length).toBe(before);
  });
});

describe('applicants ranked for operator review', () => {
  it('ranks applicants by suitability, blocked flagged', async () => {
    const d = store();
    await d.apply('E001', 'U001', 'S003', 'Bar'); // bartender — good
    await d.apply('E001', 'U001', 'S004', 'Bar'); // barista — no Bar skill
    const ranked = applicantsForEvent(d, 'E001');
    expect(ranked).toHaveLength(2);
    expect(ranked[0].staffId).toBe('S003');        // bartender ranks first
    const barista = ranked.find((r) => r.staffId === 'S004')!;
    expect(barista.blocked).toBe(true);
  });
});

describe('callout toggle', () => {
  it('opens and closes the callout', async () => {
    const d = store();
    await d.toggleCallout('E001', false);
    expect(d.get<any>('events', 'E001').callout.open).toBe(false);
    await d.toggleCallout('E001', true, 'Crew needed!');
    expect(d.get<any>('events', 'E001').callout.open).toBe(true);
    expect(d.get<any>('events', 'E001').callout.message).toBe('Crew needed!');
  });
});

describe('onboarding state', () => {
  it('a fresh client is incomplete; a set-up client is complete', () => {
    const d = store();
    expect(onboardingState(d, 'C009').complete).toBe(false); // New Co: nothing
    // C001 has units + staff but no stock in this seed
    const s = onboardingState(d, 'C001');
    expect(s.hasUnits).toBe(true);
    expect(s.hasStaff).toBe(true);
    expect(s.hasStock).toBe(false);
    expect(s.complete).toBe(false);
  });
});

describe('readiness for client', () => {
  it('scores each upcoming event 0-100 with 9 steps', () => {
    const d = store();
    const views = readinessForClient(d, 'C001', '2026-07-15');
    expect(views).toHaveLength(1);
    expect(views[0].steps).toHaveLength(9);
    expect(views[0].pct).toBeGreaterThanOrEqual(0);
    expect(views[0].pct).toBeLessThanOrEqual(100);
    // units assigned + schedule planned are done
    expect(views[0].steps.find((s) => s.key === 'units')?.done).toBe(true);
    expect(views[0].steps.find((s) => s.key === 'schedule')?.done).toBe(true);
  });
});
