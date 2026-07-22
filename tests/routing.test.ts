/* Role-based route guarding: which screens each role may reach, and where
   each role lands. Pure logic extracted from App's routing table. */
import { describe, it, expect } from 'vitest';

type Role = 'owner' | 'manager' | 'crew' | 'client';

const ROUTES: Record<string, Role[]> = {
  home: ['owner', 'manager'],
  console: ['owner', 'manager'],
  pipeline: ['owner', 'manager'],
  logistics: ['owner', 'manager'],
  tasks: ['owner', 'manager'],
  callouts: ['owner', 'manager'],
  onboard: ['owner', 'manager'],
  readiness: ['owner', 'manager'],
  compliance: ['owner', 'manager'],
  stock: ['owner', 'manager'],
  finance: ['owner', 'manager'],
  portal: ['client'],
  events: ['owner', 'manager', 'client'],
  calendar: ['owner', 'manager', 'client'],
  staff: ['owner', 'manager', 'crew'],
};

function homeRouteFor(role: Role): string {
  if (role === 'crew') return 'staff';
  if (role === 'client') return 'portal';
  return 'home';
}

function canReach(role: Role, route: string): boolean {
  return !!ROUTES[route]?.includes(role);
}

describe('role landing routes', () => {
  it('operators land on Home', () => {
    expect(homeRouteFor('owner')).toBe('home');
    expect(homeRouteFor('manager')).toBe('home');
  });
  it('crew land on Staff Hub', () => expect(homeRouteFor('crew')).toBe('staff'));
  it('clients land on the Portal (My Events)', () => expect(homeRouteFor('client')).toBe('portal'));
});

describe('client portal access', () => {
  it('only clients can reach the portal', () => {
    expect(canReach('client', 'portal')).toBe(true);
    expect(canReach('owner', 'portal')).toBe(false);
    expect(canReach('crew', 'portal')).toBe(false);
  });
});

describe('route guarding', () => {
  it('crew cannot reach the Ops Console or Home', () => {
    expect(canReach('crew', 'console')).toBe(false);
    expect(canReach('crew', 'home')).toBe(false);
  });
  it('crew cannot reach operator-only Phase 5 screens', () => {
    expect(canReach('crew', 'callouts')).toBe(false);
    expect(canReach('crew', 'onboard')).toBe(false);
    expect(canReach('crew', 'readiness')).toBe(false);
  });
  it('clients cannot reach Callouts, Onboard or Readiness', () => {
    expect(canReach('client', 'callouts')).toBe(false);
    expect(canReach('client', 'onboard')).toBe(false);
    expect(canReach('client', 'readiness')).toBe(false);
  });
  it('crew and clients cannot reach Compliance, Stock or Finance', () => {
    for (const r of ['compliance', 'stock', 'finance']) {
      expect(canReach('crew', r)).toBe(false);
      expect(canReach('client', r)).toBe(false);
    }
  });
  it('crew and clients cannot reach the Pipeline (confidential CRM)', () => {
    expect(canReach('crew', 'pipeline')).toBe(false);
    expect(canReach('client', 'pipeline')).toBe(false);
  });
  it('crew and clients cannot reach Logistics (internal ops planning)', () => {
    expect(canReach('crew', 'logistics')).toBe(false);
    expect(canReach('client', 'logistics')).toBe(false);
  });
  it('crew and clients cannot reach Tasks (operator timetable)', () => {
    expect(canReach('crew', 'tasks')).toBe(false);
    expect(canReach('client', 'tasks')).toBe(false);
  });
  it('crew can reach Staff Hub', () => expect(canReach('crew', 'staff')).toBe(true));
  it('clients can reach Events + Calendar but not Console or Staff Hub', () => {
    expect(canReach('client', 'events')).toBe(true);
    expect(canReach('client', 'calendar')).toBe(true);
    expect(canReach('client', 'console')).toBe(false);
    expect(canReach('client', 'staff')).toBe(false);
  });
  it('operators can reach every operator route', () => {
    for (const r of Object.keys(ROUTES)) {
      if (r === 'portal') continue; // portal is client-only
      expect(canReach('owner', r)).toBe(true);
    }
  });
});
