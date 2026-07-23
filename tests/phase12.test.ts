/* Phase 12 tests — P&L, invoices, journey ETA, research generation,
   staff sorting, document expiry, per-event rollup. */
import { describe, it, expect } from 'vitest';
import { OpsData } from '../src/data/opsData';
import type { OpsState, Invoice, DocumentRec } from '../src/data/types';
import {
  invoiceTotal, isOverdue, clientPnL, journeyEta, journeyMinutes,
  generateResearch, sortStaff, docState, eventRollup,
} from '../src/data/phase12';

function seed(): OpsState {
  return {
    meta: { version: 1, updatedAt: Date.now() },
    clients: { C001: { id: 'C001', name: 'JP Events', status: 'Active' } },
    events: {
      E001: { id: 'E001', clientId: 'C001', name: 'Latitude', start: '2026-07-23', end: '2026-07-26' },
    },
    units: {
      U001: { id: 'U001', clientId: 'C001', type: 'Bar', code: 'BAR-01', name: 'Main Bar', crew: 2 },
    },
    staff: {
      S001: { id: 'S001', clientId: 'C001', name: 'Jordan Blake', role: 'Bartender', rate: 10, rtw: 'Verified', staffNo: '2' },
      S002: { id: 'S002', clientId: 'C001', name: 'Tom Fletcher', role: 'Barista', rate: 12, rtw: 'Verified', staffNo: '12' },
      S003: { id: 'S003', clientId: 'C001', name: 'Ana Silva', role: 'Chef', rate: 14, rtw: 'Verified' },
    },
    assignments: {
      A001: { id: 'A001', eventId: 'E001', unitId: 'U001', staffId: 'S001', area: 'Bar', confirmed: true },
      A002: { id: 'A002', eventId: 'E001', unitId: 'U001', staffId: 'S002', area: 'Bar', confirmed: false },
    },
    stock: {
      K001: { id: 'K001', unitId: 'U001', item: 'Lager kegs', qty: 2, par: 6, unit: 'kegs' },
    },
    applications: {}, kv: {}, certs: {}, availability: {},
    pipeline: {}, movements: {}, eventTasks: {
      T1: { id: 'T1', eventId: 'E001', title: 'Book skip', category: 'Prep', done: true },
      T2: { id: 'T2', eventId: 'E001', title: 'Brief crew', category: 'Crew', done: false },
    },
    timesheets: {
      TS1: { id: 'TS1', eventId: 'E001', staffId: 'S001', workDate: '2026-07-23', hours: 10, status: 'approved' },
      TS2: { id: 'TS2', eventId: 'E001', staffId: 'S002', workDate: '2026-07-23', hours: 8, status: 'draft' },
    },
    vehicles: {}, expenses: {
      X1: { id: 'X1', clientId: 'C001', eventId: 'E001', category: 'Fuel', amount: 150, expDate: '2026-07-20' },
      X2: { id: 'X2', clientId: 'C001', category: 'Stock', amount: 350, expDate: '2026-07-21' },
    },
    invoices: {
      I1: {
        id: 'I1', clientId: 'C001', eventId: 'E001', number: 'INV-001', status: 'paid',
        issueDate: '2026-07-01', dueDate: '2026-07-15',
        lines: [{ desc: 'Bar service', qty: 4, unitPrice: 500 }, { desc: 'Staffing', qty: 1, unitPrice: 800 }],
      },
      I2: {
        id: 'I2', clientId: 'C001', number: 'INV-002', status: 'sent',
        issueDate: '2026-07-10', dueDate: '2026-07-01',   // past due → overdue
        lines: [{ desc: 'Deposit', qty: 1, unitPrice: 1000 }],
      },
    },
    documents: {}, shoppingLists: {},
  };
}

function store(): OpsData {
  const d = new OpsData();
  // @ts-expect-error inject mirror
  d.db = seed();
  return d;
}

describe('invoices', () => {
  it('totals line items (qty × unitPrice)', () => {
    const d = store();
    expect(invoiceTotal(d.get<Invoice>('invoices', 'I1')!)).toBe(2800);
  });
  it('treats missing/garbage line values as zero', () => {
    expect(invoiceTotal({ lines: [{ desc: 'x', qty: NaN, unitPrice: 5 }] } as unknown as Invoice)).toBe(0);
    expect(invoiceTotal({ lines: [] } as unknown as Invoice)).toBe(0);
  });
  it('flags unpaid invoices past due date as overdue, never paid ones', () => {
    const d = store();
    expect(isOverdue(d.get<Invoice>('invoices', 'I2')!, '2026-07-23')).toBe(true);
    expect(isOverdue(d.get<Invoice>('invoices', 'I1')!, '2026-07-23')).toBe(false);
  });
});

describe('clientPnL', () => {
  const pnl = clientPnL(store(), 'C001');
  it('splits invoiced / paid / outstanding', () => {
    expect(pnl.invoiced).toBe(3800);
    expect(pnl.paid).toBe(2800);
    expect(pnl.outstanding).toBe(1000);
  });
  it('sums expenses', () => { expect(pnl.expenses).toBe(500); });
  it('payroll counts approved timesheets only (10h × £10)', () => {
    expect(pnl.payroll).toBe(100);   // TS2 is draft → excluded
  });
  it('net = paid − expenses − payroll', () => {
    expect(pnl.net).toBe(2800 - 500 - 100);
  });
});

describe('journey maths', () => {
  it('computes ETA from departure + duration', () => {
    expect(journeyEta('08:00', 90)).toBe('09:30');
  });
  it('towing adds 20%', () => {
    expect(journeyEta('08:00', 100, true)).toBe('10:00');
  });
  it('wraps past midnight', () => {
    expect(journeyEta('23:30', 60)).toBe('00:30');
  });
  it('rejects invalid input', () => {
    expect(journeyEta('', 60)).toBe('—');
    expect(journeyEta('08:00', NaN)).toBe('—');
  });
  it('estimates minutes from miles at 38 mph', () => {
    expect(journeyMinutes(38)).toBe(60);
    expect(journeyMinutes(0)).toBe(0);
    expect(journeyMinutes(-5)).toBe(0);
  });
});

describe('generateResearch', () => {
  it('returns non-empty lists for every known area', () => {
    for (const area of ['Bar', 'Coffee', 'Food', 'Cocktail']) {
      const r = generateResearch(area);
      expect(r.stock.length).toBeGreaterThan(0);
      expect(r.compliance.length).toBeGreaterThan(0);
      expect(r.requirements.length).toBeGreaterThan(0);
    }
  });
  it('is case-insensitive and deterministic', () => {
    expect(generateResearch('bar')).toEqual(generateResearch('Bar'));
  });
  it('falls back to a general list for unknown areas', () => {
    expect(generateResearch('Support').stock.length).toBeGreaterThan(0);
  });
});

describe('sortStaff', () => {
  const list = store().staffForClient('C001');
  it('sorts staff numbers numerically (2 before 12), missing last', () => {
    expect(sortStaff(list, 'staffNo').map((s) => s.id)).toEqual(['S001', 'S002', 'S003']);
  });
  it('sorts by name', () => {
    expect(sortStaff(list, 'name').map((s) => s.name)).toEqual(['Ana Silva', 'Jordan Blake', 'Tom Fletcher']);
  });
  it('sorts by skill (role) then name', () => {
    expect(sortStaff(list, 'skill').map((s) => s.role)).toEqual(['Barista', 'Bartender', 'Chef']);
  });
  it('does not mutate its input', () => {
    const before = list.map((s) => s.id);
    sortStaff(list, 'name');
    expect(list.map((s) => s.id)).toEqual(before);
  });
});

describe('docState', () => {
  const doc = (expiry?: string): DocumentRec =>
    ({ id: 'D1', clientId: 'C001', title: 'PL insurance', docType: 'Insurance', expiry });
  it('classifies expired / expiring (≤30d) / ok / none', () => {
    expect(docState(doc('2026-07-01'), '2026-07-23')).toBe('expired');
    expect(docState(doc('2026-08-10'), '2026-07-23')).toBe('expiring');
    expect(docState(doc('2026-12-01'), '2026-07-23')).toBe('ok');
    expect(docState(doc(undefined), '2026-07-23')).toBe('none');
  });
});

describe('eventRollup', () => {
  const d = store();
  const roll = eventRollup(d, d.get('events', 'E001')!);
  it('aggregates units, crew and confirmations', () => {
    expect(roll.units).toBe(1);
    expect(roll.crewAssigned).toBe(2);
    expect(roll.confirmed).toBe(1);
  });
  it('counts low stock, tasks and timesheets for the event', () => {
    expect(roll.stockLow).toBe(1);
    expect(roll.tasksOpen).toBe(1);
    expect(roll.tasksDone).toBe(1);
    expect(roll.timesheets).toBe(2);
  });
  it('rolls up event money', () => {
    expect(roll.invoiced).toBe(2800);  // I1 only — I2 has no eventId
    expect(roll.expenses).toBe(150);   // X1 only
  });
});
