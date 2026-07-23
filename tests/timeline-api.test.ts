/* Tests for the timeline RPC wrappers (src/lib/timelineApi.ts) with a mocked
   supabase client — asserts each wrapper calls the right RPC with the right
   params and maps rows through fromRow.events. */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const calls: { fn: string; args: any }[] = [];
let rpcResult: any = { data: [], error: null };

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    rpc: (fn: string, args: any) => { calls.push({ fn, args }); return Promise.resolve(rpcResult); },
  },
}));

import {
  getEventsForYear, getEventsForMonth, getEventsForDay,
  getOverlappingEvents, sortEvents, filterEvents,
} from '../src/lib/timelineApi';

beforeEach(() => { calls.length = 0; rpcResult = { data: [], error: null }; });

describe('read wrappers pass the right RPC + params', () => {
  it('getEventsForYear', async () => {
    await getEventsForYear(2026);
    expect(calls[0]).toEqual({ fn: 'get_events_for_year', args: { p_year: 2026 } });
  });
  it('getEventsForMonth (1-based month)', async () => {
    await getEventsForMonth(2026, 7);
    expect(calls[0]).toEqual({ fn: 'get_events_for_month', args: { p_year: 2026, p_month: 7 } });
  });
  it('getEventsForDay', async () => {
    await getEventsForDay('2026-07-23');
    expect(calls[0]).toEqual({ fn: 'get_events_for_day', args: { p_date: '2026-07-23' } });
  });
  it('sortEvents / filterEvents', async () => {
    await sortEvents('duration');
    expect(calls[0]).toEqual({ fn: 'sort_events', args: { p_sort_by: 'duration' } });
    await filterEvents('Festival', null);
    expect(calls[1]).toEqual({ fn: 'filter_events', args: { p_category: 'Festival', p_priority: null } });
  });
});

describe('row mapping', () => {
  it('maps event rows through fromRow (snake → camel)', async () => {
    rpcResult = { data: [{ id: 'E1', client_id: 'C1', name: 'Latitude', start: '2026-07-23', end: '2026-07-26', category: 'Festival', priority: 'high' }], error: null };
    const rows = await getEventsForYear(2026);
    expect(rows[0]).toMatchObject({ id: 'E1', clientId: 'C1', name: 'Latitude', category: 'Festival', priority: 'high' });
  });

  it('maps overlap pairs', async () => {
    rpcResult = { data: [{ a_id: 'E1', b_id: 'E2', a_name: 'A', b_name: 'B', overlap_start: '2026-07-25', overlap_end: '2026-07-26' }], error: null };
    const pairs = await getOverlappingEvents('2026-07-01T00:00:00Z', '2026-07-31T00:00:00Z');
    expect(pairs[0]).toEqual({ aId: 'E1', bId: 'E2', aName: 'A', bName: 'B', overlapStart: '2026-07-25', overlapEnd: '2026-07-26' });
  });
});

describe('error handling', () => {
  it('throws with a descriptive message on RPC error', async () => {
    rpcResult = { data: null, error: { message: 'boom' } };
    await expect(getEventsForDay('2026-07-23')).rejects.toThrow(/get_events_for_day: boom/);
  });
});
