/* Tests for the unit research defaults + AI scoring/insights/fallback. */
import { describe, it, expect } from 'vitest';
import { OpsData } from '../src/data/opsData';
import type { OpsState } from '../src/data/types';
import { fromRow, toRow, DB_TABLE } from '../src/data/mappers';
import { areaOf, defaultLabels, seedItems } from '../src/lib/research';
import { gatherUnitContext, scoreUnit, ruleInsights, parseSummaries, buildPrompt } from '../src/lib/unitAI';

describe('store wiring for the new tables', () => {
  it('maps table names', () => {
    expect(DB_TABLE.tasks).toBe('mf_tasks');
    expect(DB_TABLE.unitChecklists).toBe('mf_unit_checklists');
    expect(DB_TABLE.unitInsights).toBe('mf_unit_insights');
  });
  it('tasks round-trip snake↔camel', () => {
    const row = { id: 'T1', client_id: 'C1', unit_id: 'U1', event_id: 'E1', title: 'X', detail: 'd', status: 'doing', assignee_staff_id: 'S1', due: '2026-07-01' };
    const dom = fromRow.tasks(row);
    expect(dom).toMatchObject({ id: 'T1', unitId: 'U1', eventId: 'E1', status: 'doing', assigneeStaffId: 'S1', due: '2026-07-01' });
    expect(toRow.tasks(dom)).toMatchObject({ id: 'T1', unit_id: 'U1', assignee_staff_id: 'S1' });
  });
  it('unit checklists + insights round-trip', () => {
    const c = fromRow.unitChecklists({ id: 'UC1', unit_id: 'U1', kind: 'safety', items: [{ id: 'a', label: 'x', on: true }] });
    expect(c.kind).toBe('safety');
    expect(toRow.unitChecklists(c)).toMatchObject({ unit_id: 'U1', kind: 'safety' });
    const i = fromRow.unitInsights({ id: 'IN1', unit_id: 'U1', health_score: 80, readiness_score: 60, insights: [], summary_daily: 'hi' });
    expect(i).toMatchObject({ healthScore: 80, readinessScore: 60, summaryDaily: 'hi' });
    expect(toRow.unitInsights(i)).toMatchObject({ unit_id: 'U1', health_score: 80, summary_daily: 'hi' });
  });
});

describe('research defaults', () => {
  it('maps unit types to areas', () => {
    expect(areaOf('Bar')).toBe('Bar');
    expect(areaOf('catering')).toBe('Food');
    expect(areaOf('cocktail')).toBe('Cocktail');
    expect(areaOf('Support')).toBe('General');
  });
  it('gives non-empty defaults for every checklist kind of a bar', () => {
    for (const kind of ['stock', 'paperwork', 'equipment', 'consumables', 'safety', 'operational'] as const) {
      expect(defaultLabels('Bar', kind).length).toBeGreaterThan(0);
    }
  });
  it('seedItems produces toggleable items', () => {
    const items = seedItems('Coffee', 'equipment');
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.on === false && typeof i.label === 'string')).toBe(true);
  });
});

function seed(): OpsState {
  return {
    meta: { version: 1, updatedAt: 1 },
    clients: { C001: { id: 'C001', name: 'JP', status: 'Active' } },
    events: { E1: { id: 'E1', clientId: 'C001', name: 'Latitude', start: '2026-07-23', unitIds: ['U001'] } },
    units: { U001: { id: 'U001', clientId: 'C001', type: 'Bar', code: 'BAR-01', name: 'Main Bar', crew: 2 } },
    staff: { S1: { id: 'S1', clientId: 'C001', name: 'Jo', role: 'Bartender' } },
    assignments: { A1: { id: 'A1', eventId: 'E1', unitId: 'U001', staffId: 'S1', confirmed: true } },
    stock: {
      K1: { id: 'K1', unitId: 'U001', item: 'Kegs', qty: 2, par: 6 },   // below par
      K2: { id: 'K2', unitId: 'U001', item: 'Wine', qty: 8, par: 6 },   // ok
    },
    applications: {}, kv: {}, certs: {}, availability: {}, pipeline: {}, movements: {},
    eventTasks: {}, timesheets: {}, vehicles: {}, invoices: {}, expenses: {},
    documents: { D1: { id: 'D1', clientId: 'C001', unitId: 'U001', title: 'PLI', docType: 'Insurance', expiry: '2020-01-01' } }, // expired
    shoppingLists: {},
    tasks: { T1: { id: 'T1', unitId: 'U001', title: 'Fix tap', status: 'open' } },
    unitChecklists: {
      UC1: { id: 'UC1', unitId: 'U001', kind: 'safety', items: [
        { id: 'a', label: 'Extinguisher', on: false },
        { id: 'b', label: 'First aid', on: true },
      ] },
    },
    unitInsights: {},
  };
}
function store(): OpsData {
  const d = new OpsData();
  // @ts-expect-error inject
  d.db = seed();
  return d;
}

describe('gatherUnitContext', () => {
  const ctx = gatherUnitContext(store(), 'U001')!;
  it('assembles stock/low/docs/tasks/events', () => {
    expect(ctx.stock).toHaveLength(2);
    expect(ctx.lowStock.map((s) => s.item)).toEqual(['Kegs']);
    expect(ctx.flaggedDocs).toHaveLength(1);        // expired PLI
    expect(ctx.openTasks).toHaveLength(1);
    expect(ctx.events.map((e) => e.id)).toEqual(['E1']);
    expect(ctx.crewTarget).toBe(2);
  });
});

describe('scoreUnit', () => {
  it('produces two 0-100 scores penalised by the gaps', () => {
    const ctx = gatherUnitContext(store(), 'U001')!;
    const s = scoreUnit(ctx);
    expect(s.health).toBeGreaterThanOrEqual(0);
    expect(s.health).toBeLessThanOrEqual(100);
    expect(s.readiness).toBeGreaterThanOrEqual(0);
    expect(s.readiness).toBeLessThanOrEqual(100);
    // an expired doc + below-par stock + open safety item should keep health well under 100
    expect(s.health).toBeLessThan(90);
  });
});

describe('ruleInsights (fallback, always available)', () => {
  const ins = ruleInsights(gatherUnitContext(store(), 'U001')!);
  it('flags the expired doc, low stock and open safety item', () => {
    const titles = ins.map((i) => i.title.toLowerCase()).join(' | ');
    expect(titles).toMatch(/document/);
    expect(titles).toMatch(/below par/);
    expect(titles).toMatch(/safety/);
    expect(ins.some((i) => i.tone === 'danger')).toBe(true);
  });
});

describe('buildPrompt + parseSummaries', () => {
  it('prompt includes the unit code and scores', () => {
    const ctx = gatherUnitContext(store(), 'U001')!;
    const p = buildPrompt(ctx, scoreUnit(ctx));
    expect(p).toContain('BAR-01');
    expect(p).toMatch(/health \d+\/100/);
  });
  it('parses DAILY/WEEKLY/MONTHLY + INSIGHT lines from a model reply', () => {
    const text = 'DAILY: Chill the kegs.\nWEEKLY: Renew PLI.\nMONTHLY: Watch stock trend.\nINSIGHT: Order kegs early.';
    const p = parseSummaries(text);
    expect(p.daily).toBe('Chill the kegs.');
    expect(p.weekly).toBe('Renew PLI.');
    expect(p.monthly).toBe('Watch stock trend.');
    expect(p.extraInsights).toEqual(['Order kegs early.']);
  });
});
