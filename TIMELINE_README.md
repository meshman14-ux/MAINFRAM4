# Triple Timeline — architecture

`src/pages/TripleTimeline.tsx` (route `#/timelines`, nav "Timelines") shows three
live Gantt widgets on the same event data — **Annual** (months), **Monthly**
(days) and **Daily** (hours) — with a shared sort/filter control bar and a
persisted layout system. It's built on the existing single-widget
`EventGantt` (`#/timeline`) patterns; both routes coexist.

## Component map

```
TripleTimeline (page)
├─ control bar        sort (time/duration/category/priority/overlap) + filter
│                     (category, priority) + layout mode (stack/columns/grid)
├─ useWidgetLayout()  layout state (order, collapse, size) — persisted
└─ per widget (order from layout):
   ├─ YearWidget   → GanttGrid  (12 month columns, drag = ± months)
   ├─ MonthWidget  → GanttGrid  (day columns, drag = ± days, right-edge resize)
   └─ DayWidget    → GanttGrid  (fitted hour axis, read-only within-day view)

GanttGrid (shared)   lane-stacked bars, colour, badges, drag/resize, multi-select
```

## Data flow

```
                 realtime (postgres_changes)
                        │
   mf_events ──► OpsData mirror ──► useOpsData() ──► TripleTimeline
   (+category,        (store)                         │  filter + sort (client-side)
    priority)                                         │  overlap.assignLanes()
                                                      ▼
                                              three GanttGrid widgets

   supabase/10_timeline.sql RPCs ──► src/lib/timelineApi.ts
     get_events_for_{year,month,day}, get_overlapping_events,
     sort_events, filter_events        (server-side reads / overlap when wanted)

   mf_widget_layouts ◄──► useWidgetLayout()  (per-user prefs; localStorage fallback)
```

The page **prefers the store** (`useOpsData`) for the common reads because
realtime already flows through it; the RPCs in `timelineApi.ts` are the
server-side equivalents (overlap detection, sort, filter) for callers that
want them. Both map rows through the same `fromRow.events`.

## SQL (`supabase/10_timeline.sql`, additive + idempotent)

- `mf_events.category text`, `mf_events.priority text` — nullable columns
  (no new events table; reuses `mf_events` + `mf_units` for the data).
- `mf_widget_layouts(user_id uuid pk → auth.users, layout jsonb, updated_at)`
  with RLS `user_id = auth.uid()` (each user only their own row) + realtime.
- RPCs, all **SECURITY INVOKER** so the existing `mf_events` RLS applies
  automatically (operators all; clients scoped; crew scoped) — no duplicated
  scoping logic:
  - `get_events_for_year(p_year int)` / `get_events_for_month(p_year,p_month)` /
    `get_events_for_day(p_date date)` — events whose `[start, end]` range
    intersects the window.
  - `get_overlapping_events(p_start timestamptz, p_end timestamptz)` — every
    id-pair whose date ranges intersect, with the overlap span.
  - `sort_events(p_sort_by text)` — time|duration|category|priority|name.
  - `filter_events(p_category text, p_priority text)` — null arg = don't filter.

Run it in the Supabase SQL editor after `01..09` (see `RUN_ALL.md`).

## Overlap logic (`src/lib/overlap.ts`, pure)

Callers convert events into numeric `[start, end)` intervals in the widget's
own unit (month index / day index / minute-of-day) and get back lane
assignments:

- `overlaps(a,b)` — half-open test (`a.start < b.end && b.start < a.end`).
- `overlapPairs` — sweep by start; every overlapping pair once.
- `groupOverlaps` — union-find clusters of transitively-overlapping events.
- `assignLanes` — greedy interval-partitioning: each event gets the lowest
  lane whose previous event has ended; `laneCount` = max simultaneous overlap.
  This is what stacks colliding events into rows.
- `overlapCounts` — per-event count, shown as the `⚠N` badge.

The placement/drag maths live in `src/lib/timelineScale.ts` (also pure):
`yearInterval` / `monthInterval` / `dayInterval` (where a bar sits) and
`shiftBoth` / `shiftEnd` (what a drag of N columns writes back). Keeping
these out of the JSX is why the interaction is unit-tested without a DOM.

## Layout system (`src/lib/useWidgetLayout.ts`)

- Pure `layoutReducer` over `{ mode, order, widgets:{collapsed,size} }`:
  `setMode` (stack | columns | grid), `toggleCollapse`, `resize` (clamped
  0.4–3), `reorder` (± within bounds), `reset`, `hydrate`.
- `normalize()` repairs any malformed persisted blob (bad mode, missing or
  duplicate widget ids).
- `useWidgetLayout()` hydrates from `mf_widget_layouts` for the signed-in user,
  falls back to `localStorage`, and persists changes to both.

## Interaction

- **Colour:** bar fill + border = operator (palette by client index, matching
  EventGantt); a dot shows the event's primary unit area (`unitColor`).
- **Badges:** priority dot (high=danger, medium=warn, low=faint), a 3-letter
  category tag, and `⚠N` overlap count.
- **Drag to reschedule (operators):** Annual moves by whole months, Monthly by
  whole days; a right-edge handle resizes the end. Writes go through
  `data.save('events', …)` — which now rolls back on failure (audit C4).
- **Multi-select:** shift-click toggles selection; dragging a selected bar
  moves the whole selection together.
- **Zoom:** clicking a bar in Annual focuses its month; in Monthly, its day;
  in Daily it opens the event's data pack.

## Tests

- `tests/overlap.test.ts` — detection, pairs, grouping, lane assignment, counts.
- `tests/timeline-scale.test.ts` — bar placement per widget + drag write-backs.
- `tests/timeline-layout.test.ts` — reducer (mode/collapse/resize/reorder/reset/
  hydrate) + `normalize` repair.
- `tests/timeline-api.test.ts` — every RPC wrapper's params + row mapping +
  error handling, with a mocked supabase client.

(No DOM-mount test: the repo has no jsdom/testing-library and this build didn't
add them; the render logic is covered at the unit level via `timelineScale`.)
