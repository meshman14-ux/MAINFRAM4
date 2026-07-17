/* Tests for the Blueprint §03 algorithms added to OpsData:
   required certs, compliance detail, crew cost, event readiness. */
import { describe, it, expect } from 'vitest';
import { OpsData } from '../src/data/opsData';
import type { OpsState } from '../src/data/types';

function base(): OpsState {
  return {
    meta: { version: 1, updatedAt: Date.now() },
    clients: { C001: { id: 'C001', name: 'JP Events', status: 'Active' } },
    events: {
      E001: { id: 'E001', clientId: 'C001', name: 'Latitude', start: '2026-07-23', end: '2026-07-26', callTime: '07:00', schedule: [{ id: 'd1', date: '2026-07-23', phase: 'Build/Set-up' }] },
    },
    units: {
      U001: { id: 'U001', clientId: 'C001', type: 'Bar', code: 'BAR-01', name: 'Main Bar', crew: 2 },
      U002: { id: 'U002', clientId: 'C001', type: 'Coffee', code: 'COF-01', name: 'Coffee', crew: 1 },
    },
    staff: {
      S001: { id: 'S001', clientId: 'C001', name: 'Jordan Blake', role: 'Bartender', rate: 12.5, rtw: 'Verified' },
      S002: { id: 'S002', clientId: 'C001', name: 'Tom Fletcher', role: 'Barista', rate: 12, rtw: 'Pending' },
    },
    assignments: {
      A001: { id: 'A001', eventId: 'E001', unitId: 'U001', staffId: 'S001', area: 'Bar', confirmed: true },
    },
    stock: {
      K001: { id: 'K001', unitId: 'U001', item: 'Lager kegs', qty: 4, par: 6, unit: 'kegs' },
    },
    applications: {},
    kv: {},
    certs: {}, availability: {},
  };
}

function store(seed = base()): OpsData {
  const d = new OpsData();
  // @ts-expect-error inject seed into private mirror
  d.db = seed;
  return d;
}

describe('required certs per area', () => {
  const d = store();
  it('a bartender needs Personal Licence + Food Hygiene L2', () => {
    const certs = d.requiredCertsFor(d.get('staff', 'S001'));
    expect(certs).toContain('Personal Licence');
    expect(certs).toContain('Food Hygiene L2');
  });
  it('a barista needs Food Hygiene L2', () => {
    const certs = d.requiredCertsFor(d.get('staff', 'S002'));
    expect(certs).toContain('Food Hygiene L2');
  });
});

describe('complianceDetail', () => {
  it('pending RTW is blocked regardless of certs', () => {
    const d = store();
    const c = d.complianceDetail(d.get('staff', 'S002'));
    expect(c.rtwOk).toBe(false);
    expect(c.blocked).toBe(true);
    expect(c.status).toBe('blocked');
  });

  it('verified RTW but missing required certs is still blocked', () => {
    const d = store();
    const c = d.complianceDetail(d.get('staff', 'S001'));
    // No certs uploaded -> required ones are "missing" -> blocked
    expect(c.rtwOk).toBe(true);
    expect(c.missingCount).toBeGreaterThan(0);
    expect(c.blocked).toBe(true);
  });

  it('verified RTW + valid certs = compliant', () => {
    const seed = base();
    seed.certs = {
      'CERT-S001-0': { id: 'CERT-S001-0', staffId: 'S001', type: 'Personal Licence', expiry: '2030-01-01' },
      'CERT-S001-1': { id: 'CERT-S001-1', staffId: 'S001', type: 'Food Hygiene L2', expiry: '2030-01-01' },
    };
    const d = store(seed);
    const c = d.complianceDetail(d.get('staff', 'S001'));
    expect(c.blocked).toBe(false);
    expect(c.status).toBe('compliant');
  });

  it('a cert within 60 days flags expiring (warn, not blocked)', () => {
    const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const seed = base();
    seed.certs = {
      'CERT-S001-0': { id: 'CERT-S001-0', staffId: 'S001', type: 'Personal Licence', expiry: soon },
      'CERT-S001-1': { id: 'CERT-S001-1', staffId: 'S001', type: 'Food Hygiene L2', expiry: '2030-01-01' },
    };
    const d = store(seed);
    const c = d.complianceDetail(d.get('staff', 'S001'));
    expect(c.expiringCount).toBe(1);
    expect(c.status).toBe('expiring');
    expect(c.blocked).toBe(false);
  });
});

describe('finance — crew cost', () => {
  const d = store();
  it('tradingHours = days × 8 (Latitude 23–26 Jul = 4 days = 32h)', () => {
    expect(d.tradingHours(d.get('events', 'E001'))).toBe(32);
  });
  it('crewCost sums only confirmed assignments × rate × hours', () => {
    // one confirmed: Jordan £12.5 × 32h = 400
    expect(d.crewCost(d.get('events', 'E001'))).toBe(400);
  });
});

describe('event readiness', () => {
  const d = store();
  it('scores 9 steps and returns a percentage', () => {
    const r = d.eventReadiness(d.get('events', 'E001'));
    expect(r.steps).toHaveLength(9);
    expect(r.pct).toBeGreaterThanOrEqual(0);
    expect(r.pct).toBeLessThanOrEqual(100);
    // units assigned + schedule planned are done in this seed
    expect(r.steps.find((s) => s.key === 'units')?.done).toBe(true);
    expect(r.steps.find((s) => s.key === 'schedule')?.done).toBe(true);
    // stock below par -> stock step not done
    expect(r.steps.find((s) => s.key === 'stock')?.done).toBe(false);
  });
});

describe('default stock catalogue', () => {
  const d = store();
  it('returns a per-type list with pars', () => {
    const bar = d.defaultStockFor('Bar');
    expect(bar.length).toBeGreaterThan(0);
    expect(bar[0]).toHaveProperty('par');
    // unknown type falls back to Support
    expect(d.defaultStockFor('Nonsense').length).toBe(d.defaultStockFor('Support').length);
  });
});
