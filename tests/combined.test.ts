/* Tests for the combined-build deltas: PAL branches, unit branch link,
   and the Tasks-page board/progress groupings. */
import { describe, it, expect } from 'vitest';
import { OpsData } from '../src/data/opsData';
import { fromRow, toRow, DB_TABLE } from '../src/data/mappers';
import type { OpsState, Task } from '../src/data/types';

describe('palBranches store wiring', () => {
  it('maps the table name', () => {
    expect(DB_TABLE.palBranches).toBe('mf_pal_branches');
  });
  it('round-trips snake↔camel', () => {
    const dom = fromRow.palBranches({ id: 'PB1', name: 'North', region: 'Yorkshire', notes: 'hub' });
    expect(dom).toMatchObject({ id: 'PB1', name: 'North', region: 'Yorkshire' });
    expect(toRow.palBranches(dom)).toMatchObject({ id: 'PB1', name: 'North', region: 'Yorkshire' });
  });
  it('units carry branch_id', () => {
    const u = fromRow.units({ id: 'U1', client_id: 'C1', type: 'Bar', code: 'B-1', name: 'Bar', crew: 2, branch_id: 'PB1' });
    expect(u.branchId).toBe('PB1');
    expect(toRow.units(u)).toMatchObject({ branch_id: 'PB1' });
  });
});

function store(): OpsData {
  const d = new OpsData();
  const db: Partial<OpsState> = {
    meta: { version: 1, updatedAt: 1 },
    clients: { C1: { id: 'C1', name: 'JP', status: 'Active' } as any },
    units: { U1: { id: 'U1', clientId: 'C1', type: 'Bar', code: 'B-1', name: 'Bar', crew: 2, branchId: 'PB1' } as any },
    palBranches: { PB1: { id: 'PB1', name: 'North', region: 'Yorkshire' } },
    tasks: {
      T1: { id: 'T1', clientId: 'C1', unitId: 'U1', title: 'a', status: 'open' } as Task,
      T2: { id: 'T2', clientId: 'C1', title: 'b', status: 'doing' } as Task,
      T3: { id: 'T3', clientId: 'C1', title: 'c', status: 'done' } as Task,
      T4: { id: 'T4', clientId: 'C9', title: 'other client', status: 'open' } as Task,
    },
  };
  // @ts-expect-error inject partial state over the empty default
  d.db = { ...d.db, ...db };
  return d;
}

describe('branchOfUnit', () => {
  it('resolves the unit’s PAL branch, null when unset', () => {
    const d = store();
    const u = d.get<import('../src/data/types').Unit>('units', 'U1')!;
    expect(d.branchOfUnit(u)?.name).toBe('North');
    expect(d.branchOfUnit({ ...u, branchId: undefined })).toBeNull();
    expect(d.branchOfUnit(null)).toBeNull();
  });
});

describe('ops board grouping (client-scoped tasks by status)', () => {
  it('splits the operator’s tasks into open/doing/done and excludes other clients', () => {
    const d = store();
    const mine = d.all<Task>('tasks').filter((t) => t.clientId === 'C1');
    expect(mine).toHaveLength(3);
    const by = (s: string) => mine.filter((t) => t.status === s).length;
    expect(by('open')).toBe(1);
    expect(by('doing')).toBe(1);
    expect(by('done')).toBe(1);
  });
});
