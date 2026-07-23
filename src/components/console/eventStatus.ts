/* Shared event-status logic for the console: upcoming (T-minus), live, past.
   Pure — used by EventsTab cards and the OpsConsole KPI chips. */
import type { EventRec } from '../../data/types';

export type EventStatusKind = 'upcoming' | 'live' | 'past';

export interface EventStatus {
  kind: EventStatusKind;
  label: string;
  days: number;   // days until start (upcoming only, else 0)
}

export function eventStatus(e: EventRec, today = new Date().toISOString().slice(0, 10)): EventStatus {
  const start = e.start || '';
  const end = e.end || e.start || '';
  if (start && start > today) {
    const days = Math.round(
      (new Date(start + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000
    );
    return { kind: 'upcoming', label: `T-${days}`, days };
  }
  if (start && end >= today) return { kind: 'live', label: '● LIVE NOW', days: 0 };
  return { kind: 'past', label: 'DONE', days: 0 };
}
