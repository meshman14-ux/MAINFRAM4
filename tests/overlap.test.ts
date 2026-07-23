/* Tests for the pure overlap engine (src/lib/overlap.ts). */
import { describe, it, expect } from 'vitest';
import { overlaps, overlapPairs, groupOverlaps, assignLanes, overlapCounts, type Interval } from '../src/lib/overlap';

const iv = (id: string, start: number, end: number): Interval => ({ id, start, end });

describe('overlaps', () => {
  it('is true for genuinely overlapping intervals', () => {
    expect(overlaps(iv('a', 0, 5), iv('b', 3, 8))).toBe(true);
  });
  it('is false for touching-but-not-overlapping (half-open)', () => {
    expect(overlaps(iv('a', 0, 5), iv('b', 5, 9))).toBe(false);
  });
  it('treats a zero-length interval as a point that can overlap', () => {
    expect(overlaps(iv('a', 3, 3), iv('b', 0, 5))).toBe(true);
  });
});

describe('overlapPairs', () => {
  it('finds every overlapping pair once', () => {
    const items = [iv('a', 0, 4), iv('b', 2, 6), iv('c', 5, 9), iv('d', 20, 22)];
    const pairs = overlapPairs(items).map((p) => p.join('-')).sort();
    // a-b overlap, b-c overlap; a-c and d isolated
    expect(pairs).toEqual(['a-b', 'b-c']);
  });
  it('returns nothing when all intervals are disjoint', () => {
    expect(overlapPairs([iv('a', 0, 1), iv('b', 2, 3), iv('c', 4, 5)])).toHaveLength(0);
  });
});

describe('groupOverlaps', () => {
  it('clusters transitively-overlapping intervals', () => {
    const items = [iv('a', 0, 4), iv('b', 2, 6), iv('c', 5, 9), iv('d', 20, 22)];
    const groups = groupOverlaps(items).map((g) => g.map((x) => x.id).sort());
    // a-b-c chain into one group; d alone
    expect(groups).toContainEqual(['a', 'b', 'c']);
    expect(groups).toContainEqual(['d']);
    expect(groups).toHaveLength(2);
  });
});

describe('assignLanes', () => {
  it('puts overlapping intervals in different lanes and reuses freed lanes', () => {
    const items = [iv('a', 0, 4), iv('b', 2, 6), iv('c', 5, 9)];
    const { laned, laneCount } = assignLanes(items);
    const lane = (id: string) => laned.find((l) => l.item.id === id)!.lane;
    expect(lane('a')).not.toBe(lane('b'));   // a & b overlap
    expect(lane('c')).toBe(lane('a'));        // c starts after a ends → reuse lane 0
    expect(laneCount).toBe(2);
  });
  it('uses one lane when nothing overlaps', () => {
    expect(assignLanes([iv('a', 0, 1), iv('b', 2, 3)]).laneCount).toBe(1);
  });
  it('needs N lanes for N mutually-overlapping intervals', () => {
    const items = [iv('a', 0, 10), iv('b', 1, 10), iv('c', 2, 10)];
    expect(assignLanes(items).laneCount).toBe(3);
  });
});

describe('overlapCounts', () => {
  it('counts how many others each interval overlaps', () => {
    const items = [iv('a', 0, 4), iv('b', 2, 6), iv('c', 5, 9), iv('d', 20, 22)];
    const c = overlapCounts(items);
    expect(c.get('a')).toBe(1);   // a-b
    expect(c.get('b')).toBe(2);   // b-a, b-c
    expect(c.get('c')).toBe(1);   // c-b
    expect(c.get('d')).toBe(0);
  });
});
