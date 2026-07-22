/* Phase 10 — Event Tasks tests. From user feedback (not a prototype port):
   tasks tied to a specific event, colour-coded by category, sortable by
   due date so an operator can work their "timetable" across events. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/supabase', () => {
  const ok = { data: null, error: null };
  const chain: any = {
    select: () => ({
      eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    }),
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
    clients: {
      C001: { id: 'C001', name: 'JP Events', status: 'Active' },
      C002: { id: 'C002', name: 'Coastal Kitchen', status: 'Active' },
    },
    events: {
      E001: { id: 'E001', clientId: 'C001', name: 'Latitude', start: '2026-07-23', end: '2026-07-26' },
      E002: { id: 'E002', clientId: 'C001', name: 'Cardiff', start: '2026-08-15', end: '2026-08-16' },
      E003: { id: 'E003', clientId: 'C002', name: 'Harbour Wedding', start: '2026-08-08', end: '2026-08-08' },
    },
    units: {}, staff: {}, assignments: {}, stock: {}, applications: {}, kv: {}, certs: {}, availability: {},
    pipeline: {}, movements: {}, eventTasks: {},
  };
}

function store(): OpsData {
  const d = new OpsData();
  // @ts-expect-error inject mirror
  d.db = seed();
  return d;
}

describe('adding and reading tasks', () => {
  let d: OpsData;
  beforeEach(() => { d = store(); });

  it('adds a task to an event with defaults', async () => {
    const t = await d.addTask('E001', 'Confirm crew call time');
    expect(t.category).toBe('General');
    expect(t.done).toBe(false);
    expect(d.tasksForEvent('E001')).toHaveLength(1);
  });

  it('accepts category, due date and assignee', async () => {
    const t = await d.addTask('E001', 'Order stock', { category: 'Stock', dueDate: '2026-07-20', assignedTo: 'S001' });
    expect(t.category).toBe('Stock');
    expect(t.dueDate).toBe('2026-07-20');
    expect(t.assignedTo).toBe('S001');
  });

  it('trims the title', async () => {
    const t = await d.addTask('E001', '  Check licence  ');
    expect(t.title).toBe('Check licence');
  });
});

describe('tasksForClient isolates by operator', () => {
  it('only includes tasks whose event belongs to this client', async () => {
    const d = store();
    await d.addTask('E001', 'JP task');
    await d.addTask('E003', 'Coastal task');
    const c001Tasks = d.tasksForClient('C001');
    expect(c001Tasks).toHaveLength(1);
    expect(c001Tasks[0].title).toBe('JP task');
    expect(c001Tasks[0].eventName).toBe('Latitude');
  });
});

describe('toggling done', () => {
  it('flips the done flag', async () => {
    const d = store();
    const t = await d.addTask('E001', 'Do the thing');
    expect(d.tasksForEvent('E001')[0].done).toBe(false);
    await d.toggleTaskDone(t.id);
    expect(d.tasksForEvent('E001')[0].done).toBe(true);
    await d.toggleTaskDone(t.id);
    expect(d.tasksForEvent('E001')[0].done).toBe(false);
  });
});

describe('removing a task', () => {
  it('removes it from the event\'s list', async () => {
    const d = store();
    const t = await d.addTask('E001', 'Temp task');
    await d.removeTask(t.id);
    expect(d.tasksForEvent('E001')).toHaveLength(0);
  });
});

describe('overdue detection', () => {
  it('a task with a past due date, not done, is overdue', async () => {
    const d = store();
    const t = await d.addTask('E001', 'Late task', { dueDate: '2026-07-01' });
    expect(d.isTaskOverdue(t, '2026-07-15')).toBe(true);
  });
  it('a done task is never overdue, even with a past due date', async () => {
    const d = store();
    const t = await d.addTask('E001', 'Late but done', { dueDate: '2026-07-01' });
    await d.toggleTaskDone(t.id);
    const updated = d.tasksForEvent('E001')[0];
    expect(d.isTaskOverdue(updated, '2026-07-15')).toBe(false);
  });
  it('a task with a future due date is not overdue', async () => {
    const d = store();
    const t = await d.addTask('E001', 'Future task', { dueDate: '2026-08-01' });
    expect(d.isTaskOverdue(t, '2026-07-15')).toBe(false);
  });
  it('a task with no due date is never overdue', async () => {
    const d = store();
    const t = await d.addTask('E001', 'No date');
    expect(d.isTaskOverdue(t, '2026-12-31')).toBe(false);
  });
});

describe('task summary', () => {
  it('counts total, open, overdue, and per-category for open tasks', async () => {
    const d = store();
    await d.addTask('E001', 'A', { category: 'Stock', dueDate: '2026-07-01' });
    await d.addTask('E001', 'B', { category: 'Stock' });
    const c = await d.addTask('E001', 'C', { category: 'Compliance' });
    await d.toggleTaskDone(c.id);

    const s = d.taskSummary('C001', '2026-07-15');
    expect(s.total).toBe(3);
    expect(s.open).toBe(2);
    expect(s.overdue).toBe(1);
    expect(s.byCategory.Stock).toBe(2);
    expect(s.byCategory.Compliance).toBeUndefined();
  });
});
