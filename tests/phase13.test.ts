/* Phase 13 tests — two-level compliance: personal RAG + unit operational. */
import { describe, it, expect } from 'vitest';
import { OpsData } from '../src/data/opsData';
import type { OpsState, Staff, Unit } from '../src/data/types';
import { personalRag, unitCompliance, complianceRollup } from '../src/data/phase13';

const future = (days: number) => {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

function seed(): OpsState {
  return {
    meta: { version: 1, updatedAt: Date.now() },
    clients: { C001: { id: 'C001', name: 'JP Events', status: 'Active' } },
    events: {}, applications: {}, kv: {}, availability: {}, pipeline: {},
    movements: {}, eventTasks: {}, timesheets: {}, vehicles: {}, invoices: {},
    expenses: {}, documents: {}, shoppingLists: {}, assignments: {}, stock: {},
    units: {
      U001: {
        id: 'U001', clientId: 'C001', type: 'Bar', code: 'BAR-01', name: 'Main Bar', crew: 2,
        checklist: [
          { id: 'c1', cat: 'Safety', item: 'Fire extinguisher in date', on: false, required: true },
          { id: 'c2', cat: 'Documentation', item: 'Personal licence on file', on: true, required: true },
          { id: 'c3', cat: 'Equipment', item: 'Taps cleaned', on: false },   // not compliance-relevant
          { id: 'c4', cat: 'Safety', item: 'Spill kit', on: false },          // open but not required
        ],
      },
      U002: { id: 'U002', clientId: 'C001', type: 'Coffee', code: 'COF-01', name: 'Cart', crew: 1, checklist: [] },
    },
    staff: {
      S001: { id: 'S001', clientId: 'C001', name: 'Jordan Blake', role: 'Bartender', rtw: 'Verified' },
      S002: { id: 'S002', clientId: 'C001', name: 'Tom Fletcher', role: 'Bartender', rtw: 'Pending' },
    },
    certs: {
      // Jordan holds both required bartender certs; the licence expires
      // within 60 days -> amber overall
      CE1: { id: 'CE1', staffId: 'S001', type: 'Personal Licence', expiry: future(30) },
      CE2: { id: 'CE2', staffId: 'S001', type: 'Food Hygiene L2', expiry: future(400) },
    },
  };
}

function store(): OpsData {
  const d = new OpsData();
  // @ts-expect-error inject mirror
  d.db = seed();
  return d;
}

describe('personalRag', () => {
  const d = store();
  it('amber when only expiries loom', () => {
    const r = personalRag(d, d.get<Staff>('staff', 'S001')!);
    expect(r.rag).toBe('amber');
    expect(r.items.find((i) => i.type === 'Right to work')?.state).toBe('ok');
    const lic = r.items.find((i) => i.type === 'Personal Licence');
    expect(lic?.state).toBe('expiring');
    expect(lic?.days).toBeGreaterThan(0);
  });
  it('red when RTW is not verified', () => {
    const r = personalRag(d, d.get<Staff>('staff', 'S002')!);
    expect(r.rag).toBe('red');
    expect(r.items.find((i) => i.type === 'Right to work')?.state).toBe('missing');
    expect(r.problems).toBeGreaterThan(0);
  });
});

describe('unitCompliance', () => {
  const d = store();
  it('only counts Safety + Documentation items and flags required-open as red', () => {
    const u = unitCompliance(d.get<Unit>('units', 'U001')!);
    expect(u.total).toBe(3);       // c1, c2, c4 — c3 is Equipment
    expect(u.done).toBe(1);        // c2
    expect(u.requiredOpen).toBe(1); // c1
    expect(u.rag).toBe('red');
    expect(u.open.map((c) => c.id).sort()).toEqual(['c1', 'c4']);
  });
  it('green when a unit has no compliance checks outstanding', () => {
    expect(unitCompliance(d.get<Unit>('units', 'U002')!).rag).toBe('green');
  });
});

describe('complianceRollup', () => {
  it('rolls both levels into hub counts', () => {
    const r = complianceRollup(store(), 'C001');
    expect(r.unitOpen).toBe(2);
    expect(r.unitRequiredOpen).toBe(1);
    expect(r.crewRed).toBe(1);          // Tom
    expect(r.crewProblems).toBeGreaterThanOrEqual(2); // Tom's items + Jordan's expiring licence
  });
});
