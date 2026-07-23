/* ============================================================
   timelineApi — typed wrappers over the timeline Postgres RPCs
   (supabase/10_timeline.sql). The page prefers the central store
   (useOpsData) for the common reads because realtime already
   flows through it; these RPCs are used for server-side overlap
   detection and server-side sort/filter when asked for.
   ============================================================ */
import { supabase } from './supabase';
import { fromRow } from '../data/mappers';
import type { EventRec } from '../data/types';

export interface OverlapPair {
  aId: string; bId: string; aName: string; bName: string;
  overlapStart: string; overlapEnd: string;
}

const mapEvents = (rows: unknown): EventRec[] =>
  Array.isArray(rows) ? rows.map((r) => fromRow.events(r as any)) : [];

export async function getEventsForYear(year: number): Promise<EventRec[]> {
  const { data, error } = await supabase.rpc('get_events_for_year', { p_year: year });
  if (error) throw new Error(`get_events_for_year: ${error.message}`);
  return mapEvents(data);
}

export async function getEventsForMonth(year: number, month: number): Promise<EventRec[]> {
  // month is 1-12 for the RPC (JS Date months are 0-11 — convert at the call site).
  const { data, error } = await supabase.rpc('get_events_for_month', { p_year: year, p_month: month });
  if (error) throw new Error(`get_events_for_month: ${error.message}`);
  return mapEvents(data);
}

export async function getEventsForDay(dateISO: string): Promise<EventRec[]> {
  const { data, error } = await supabase.rpc('get_events_for_day', { p_date: dateISO });
  if (error) throw new Error(`get_events_for_day: ${error.message}`);
  return mapEvents(data);
}

export async function getOverlappingEvents(startISO: string, endISO: string): Promise<OverlapPair[]> {
  const { data, error } = await supabase.rpc('get_overlapping_events', { p_start: startISO, p_end: endISO });
  if (error) throw new Error(`get_overlapping_events: ${error.message}`);
  return (Array.isArray(data) ? data : []).map((r: any) => ({
    aId: r.a_id, bId: r.b_id, aName: r.a_name, bName: r.b_name,
    overlapStart: r.overlap_start, overlapEnd: r.overlap_end,
  }));
}

export type SortKey = 'time' | 'duration' | 'category' | 'priority' | 'name';

export async function sortEvents(sortBy: SortKey): Promise<EventRec[]> {
  const { data, error } = await supabase.rpc('sort_events', { p_sort_by: sortBy });
  if (error) throw new Error(`sort_events: ${error.message}`);
  return mapEvents(data);
}

export async function filterEvents(category: string | null, priority: string | null): Promise<EventRec[]> {
  const { data, error } = await supabase.rpc('filter_events', { p_category: category, p_priority: priority });
  if (error) throw new Error(`filter_events: ${error.message}`);
  return mapEvents(data);
}
