/* ============================================================
   useWidgetLayout — layout state for the three timeline widgets.
   The reducer is pure and exported for tests; the hook adds
   persistence to mf_widget_layouts (per signed-in user) with a
   localStorage fallback so a logged-out/offline session still
   remembers the chosen layout.
   ============================================================ */
import { useEffect, useReducer, useRef } from 'react';
import { supabase } from './supabase';

export type WidgetId = 'year' | 'month' | 'day';
export type LayoutMode = 'stack' | 'columns' | 'grid';

export interface WidgetPref { collapsed: boolean; size: number } // size = flex/height weight (1 = default)
export interface LayoutState {
  mode: LayoutMode;
  order: WidgetId[];
  widgets: Record<WidgetId, WidgetPref>;
}

export type LayoutAction =
  | { type: 'setMode'; mode: LayoutMode }
  | { type: 'toggleCollapse'; id: WidgetId }
  | { type: 'resize'; id: WidgetId; size: number }
  | { type: 'reorder'; id: WidgetId; dir: -1 | 1 }
  | { type: 'reset' }
  | { type: 'hydrate'; state: LayoutState };

export const DEFAULT_LAYOUT: LayoutState = {
  mode: 'stack',
  order: ['year', 'month', 'day'],
  widgets: {
    year: { collapsed: false, size: 1 },
    month: { collapsed: false, size: 1 },
    day: { collapsed: false, size: 1 },
  },
};

const clampSize = (n: number) => Math.max(0.4, Math.min(3, Number.isFinite(n) ? n : 1));

export function layoutReducer(state: LayoutState, action: LayoutAction): LayoutState {
  switch (action.type) {
    case 'setMode':
      return { ...state, mode: action.mode };
    case 'toggleCollapse':
      return { ...state, widgets: { ...state.widgets, [action.id]: { ...state.widgets[action.id], collapsed: !state.widgets[action.id].collapsed } } };
    case 'resize':
      return { ...state, widgets: { ...state.widgets, [action.id]: { ...state.widgets[action.id], size: clampSize(action.size) } } };
    case 'reorder': {
      const order = [...state.order];
      const i = order.indexOf(action.id);
      const j = i + action.dir;
      if (i < 0 || j < 0 || j >= order.length) return state;
      [order[i], order[j]] = [order[j], order[i]];
      return { ...state, order };
    }
    case 'reset':
      return DEFAULT_LAYOUT;
    case 'hydrate':
      return normalize(action.state);
    default:
      return state;
  }
}

/** Defend against a malformed persisted blob (missing widgets, bad order). */
export function normalize(s: Partial<LayoutState> | null | undefined): LayoutState {
  if (!s || typeof s !== 'object') return DEFAULT_LAYOUT;
  const mode: LayoutMode = s.mode === 'columns' || s.mode === 'grid' ? s.mode : 'stack';
  const ids: WidgetId[] = ['year', 'month', 'day'];
  const seen = new Set<WidgetId>();
  const kept = Array.isArray(s.order)
    ? s.order.filter((x): x is WidgetId => ids.includes(x as WidgetId) && !seen.has(x as WidgetId) && (seen.add(x as WidgetId), true))
    : [];
  const order = [...kept, ...ids.filter((x) => !seen.has(x))];
  const widgets = {} as Record<WidgetId, WidgetPref>;
  ids.forEach((id) => {
    const w = s.widgets?.[id];
    widgets[id] = { collapsed: !!w?.collapsed, size: clampSize(w?.size ?? 1) };
  });
  return { mode, order: order as WidgetId[], widgets };
}

const LS_KEY = 'mf_widget_layout';

export function useWidgetLayout() {
  const [state, dispatch] = useReducer(layoutReducer, DEFAULT_LAYOUT);
  const loaded = useRef(false);

  // Hydrate once: try the signed-in user's row, else localStorage.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase.from('mf_widget_layouts').select('layout').eq('user_id', user.id).maybeSingle();
          if (!cancelled && data?.layout && Object.keys(data.layout).length) {
            dispatch({ type: 'hydrate', state: normalize(data.layout) });
            loaded.current = true;
            return;
          }
        }
      } catch { /* fall through to localStorage */ }
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (!cancelled && raw) dispatch({ type: 'hydrate', state: normalize(JSON.parse(raw)) });
      } catch { /* ignore */ }
      loaded.current = true;
    })();
    return () => { cancelled = true; };
  }, []);

  // Persist on change (after initial hydrate), to both stores.
  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* ignore */ }
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await supabase.from('mf_widget_layouts').upsert({ user_id: user.id, layout: state, updated_at: new Date().toISOString() });
      } catch { /* offline / logged out — localStorage already has it */ }
    })();
  }, [state]);

  return { layout: state, dispatch };
}
