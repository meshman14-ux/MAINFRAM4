/* ============================================================
   overlap.ts — pure interval-overlap algorithms for the Gantt
   widgets. Scale-agnostic: callers convert their events into
   numeric [start, end) intervals (month index, day index, or
   minute-of-day) and get back lane assignments + overlap counts.
   No React, no store — fully unit-testable.
   ============================================================ */

export interface Interval {
  id: string;
  start: number;   // inclusive
  end: number;     // exclusive; a zero-length event is treated as end = start + epsilon
}

/** Half-open overlap: a and b share time iff a.start < b.end && b.start < a.end. */
export function overlaps(a: Interval, b: Interval): boolean {
  const ae = Math.max(a.end, a.start + EPS);
  const be = Math.max(b.end, b.start + EPS);
  return a.start < be && b.start < ae;
}
const EPS = 1e-9;

/** Every unordered overlapping pair, as [idA, idB] with idA < idB by input order. */
export function overlapPairs(items: Interval[]): [string, string][] {
  const sorted = [...items].sort((x, y) => x.start - y.start || x.end - y.end);
  const out: [string, string][] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      // sorted by start: once b.start >= a.end no later item can overlap a.
      if (sorted[j].start >= Math.max(sorted[i].end, sorted[i].start + EPS)) break;
      if (overlaps(sorted[i], sorted[j])) out.push([sorted[i].id, sorted[j].id]);
    }
  }
  return out;
}

/** Connected clusters of transitively-overlapping intervals (union-find). */
export function groupOverlaps(items: Interval[]): Interval[][] {
  const parent = new Map<string, string>();
  items.forEach((i) => parent.set(i.id, i.id));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    while (parent.get(x) !== r) { const n = parent.get(x)!; parent.set(x, r); x = n; }
    return r;
  };
  const union = (a: string, b: string) => { parent.set(find(a), find(b)); };
  overlapPairs(items).forEach(([a, b]) => union(a, b));

  const groups = new Map<string, Interval[]>();
  items.forEach((i) => {
    const r = find(i.id);
    (groups.get(r) ?? groups.set(r, []).get(r)!).push(i);
  });
  // Deterministic order: by earliest start in each group.
  return [...groups.values()].sort((g1, g2) =>
    Math.min(...g1.map((x) => x.start)) - Math.min(...g2.map((x) => x.start)));
}

export interface Laned<T extends Interval> { item: T; lane: number; }

/**
 * Greedy interval-partitioning: assign each item the lowest lane whose last
 * event has already ended. Overlapping items always land in different lanes;
 * laneCount is the max simultaneous overlap (chromatic number for intervals).
 */
export function assignLanes<T extends Interval>(items: T[]): { laned: Laned<T>[]; laneCount: number } {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const laneEnds: number[] = [];   // laneEnds[i] = end of the last item placed in lane i
  const laned: Laned<T>[] = [];
  for (const item of sorted) {
    const e = Math.max(item.end, item.start + EPS);
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(e); }
    else laneEnds[lane] = e;
    laned.push({ item, lane });
  }
  return { laned, laneCount: laneEnds.length };
}

/** How many other intervals each interval overlaps (for the overlap-count badge). */
export function overlapCounts(items: Interval[]): Map<string, number> {
  const counts = new Map<string, number>();
  items.forEach((i) => counts.set(i.id, 0));
  for (const [a, b] of overlapPairs(items)) {
    counts.set(a, (counts.get(a) ?? 0) + 1);
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  return counts;
}
