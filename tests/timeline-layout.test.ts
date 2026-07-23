/* Tests for the layout reducer + normaliser (src/lib/useWidgetLayout.ts). */
import { describe, it, expect } from 'vitest';
import { layoutReducer, normalize, DEFAULT_LAYOUT, type LayoutState } from '../src/lib/useWidgetLayout';

describe('layoutReducer', () => {
  it('switches mode', () => {
    expect(layoutReducer(DEFAULT_LAYOUT, { type: 'setMode', mode: 'grid' }).mode).toBe('grid');
  });
  it('toggles collapse for one widget only', () => {
    const s = layoutReducer(DEFAULT_LAYOUT, { type: 'toggleCollapse', id: 'month' });
    expect(s.widgets.month.collapsed).toBe(true);
    expect(s.widgets.year.collapsed).toBe(false);
  });
  it('clamps resize into range', () => {
    expect(layoutReducer(DEFAULT_LAYOUT, { type: 'resize', id: 'day', size: 99 }).widgets.day.size).toBe(3);
    expect(layoutReducer(DEFAULT_LAYOUT, { type: 'resize', id: 'day', size: 0 }).widgets.day.size).toBe(0.4);
  });
  it('reorders within bounds and no-ops at the edges', () => {
    const moved = layoutReducer(DEFAULT_LAYOUT, { type: 'reorder', id: 'day', dir: -1 });
    expect(moved.order).toEqual(['year', 'day', 'month']);
    const edge = layoutReducer(DEFAULT_LAYOUT, { type: 'reorder', id: 'year', dir: -1 });
    expect(edge.order).toEqual(DEFAULT_LAYOUT.order);   // can't move first up
  });
  it('reset returns the default', () => {
    const dirty = layoutReducer(DEFAULT_LAYOUT, { type: 'setMode', mode: 'columns' });
    expect(layoutReducer(dirty, { type: 'reset' })).toEqual(DEFAULT_LAYOUT);
  });
  it('hydrate normalises the incoming state', () => {
    const s = layoutReducer(DEFAULT_LAYOUT, { type: 'hydrate', state: { mode: 'columns', order: ['day'] } as unknown as LayoutState });
    expect(s.mode).toBe('columns');
    expect(s.order).toEqual(['day', 'year', 'month']);   // missing ids appended
  });
});

describe('normalize', () => {
  it('defends against garbage', () => {
    expect(normalize(null)).toEqual(DEFAULT_LAYOUT);
    expect(normalize({ mode: 'nonsense' } as any).mode).toBe('stack');
  });
  it('fills missing widgets and dedupes/repairs order', () => {
    const n = normalize({ mode: 'grid', order: ['month', 'month', 'zzz'] } as any);
    expect(n.order).toEqual(['month', 'year', 'day']);
    expect(Object.keys(n.widgets).sort()).toEqual(['day', 'month', 'year']);
  });
});
