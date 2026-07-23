# MAINFRAME — Combined build (Timeline + Unit/AI + Tabs/Tasks/Layout)

Track A: everything integrated into the existing React 18 + Vite + TS app.
This build merged three prior specs plus the Tasks/Command charts, Team
directory, PAL branches and the layout system. Most pieces landed in earlier
phases (migrations 10–11); this phase adds the deltas (migration 12).

## Architecture overview

```
                    ┌───────────────────────────────┐
                    │   Supabase (Postgres + RLS)   │
                    │  mf_* tables · RPCs · realtime │
                    └──────────────┬────────────────┘
                                   │ postgrest + websocket
                    ┌──────────────▼────────────────┐
                    │  OpsData store (singleton)     │
                    │  types.ts → mappers.ts →       │
                    │  opsData.ts (load/save/remove  │
                    │  /realtime for every table)    │
                    └──────────────┬────────────────┘
                                   │ useOpsData() { data, ready, error }
     ┌────────────┬────────────┬───┴─────────┬─────────────┬───────────┐
     ▼            ▼            ▼             ▼             ▼           ▼
TripleTimeline UnitDashboard  Tasks     CommandCentre    Team     (all other
 (3 Gantts +   (profile + AI  (event +   (KPI wall +    (people    pages)
  overlap.ts +  panel + 6     unit board  monthly chart  directory)
  layout)       checklists)   + chart)    + widgets)
```

## Component map (this build's surface)

| Piece | File | Notes |
|---|---|---|
| Triple Timeline | `src/pages/TripleTimeline.tsx` | Annual / monthly / daily Gantt widgets; drag, resize, collapse |
| Overlap engine | `src/lib/overlap.ts` | pure: detect, group (union-find), `assignLanes` greedy interval partitioning |
| Layout system | `src/lib/useWidgetLayout.ts` | vertical / horizontal / grid modes, order, collapse; persists `mf_widget_layouts` (auth.uid) with localStorage fallback |
| Timeline RPC wrappers | `src/lib/timelineApi.ts` | typed `get_events_for_year/month/day`, `get_overlapping_events`, `sort_events`, `filter_events` |
| Unit Dashboard | `src/pages/UnitDashboard.tsx` | route `#/unit/:id`; profile (incl. PAL branch), AI panel, 6 checklists, default-checklist modal, stock, events, staff, unit + event tasks |
| Research defaults | `src/lib/research.ts` | per-area (BAR/COFFEE/FOOD/COCKTAIL/GENERAL) stock/paperwork/equipment/consumables/safety/operational libraries |
| Unit AI | `src/lib/unitAI.ts` | context → deterministic Health/Readiness (crew-dominant) + rule insights → `window.claude.complete` summaries with fallback; history append + trend |
| Tasks page | `src/pages/Tasks.tsx` | event tasks + **ops board** (mf_tasks, open/doing/done) + **animated progress chart** (SVG donut + bars) |
| Command Centre | `src/pages/CommandCentre.tsx` | + **monthly analytics chart** (events vs crew cost per month) + compliance-evaluation strip (level compliance, readiness, trend) |
| Team | `src/pages/Team.tsx` | cross-operator people directory: search, role filter, RAG, unit chips |
| Tab structure | `src/components/TopBar.tsx` | primary: Home · Command · Tasks · Console · Events · Calendar · Timeline · Callouts · Staff Hub · Pipeline · Accounts; the rest (incl. Team) in More |

("Move ARC to the end of Tasks" — no ARC module exists in this app; skipped.)

## SQL (all additive + idempotent; run in Supabase, in order — see RUN_ALL.md)

- `10_timeline.sql` — `mf_events.category/priority`, `mf_widget_layouts`, timeline RPCs
- `11_unit_ai.sql` — `mf_tasks`, `mf_unit_checklists`, `mf_unit_insights`, `analyze_unit(text)`
- `12_combined.sql` — **this phase**: `mf_pal_branches` (id, name, region, notes),
  `mf_units.branch_id` (nullable FK), RLS (operators full, crew read),
  realtime, and `analyze_unit_ai(text)` = `analyze_unit()` ⊕ branch payload.

RLS matches the existing helper pattern everywhere: `mf_is_operator()` for
full operator access, `mf_staff_id()`-scoped reads for crew. All RPCs are
SECURITY INVOKER, so the caller's row-level security applies inside them.

## AI subsystem

`gatherUnitContext` → `scoreUnit` (deterministic; readiness crew-dominant
45/30/15/10) → `ruleInsights` (tone-coded chips) → optional
`window.claude.complete` for daily/weekly/monthly prose (+extra insights),
falling back to rules-based summaries; result rows **append** to
`mf_unit_insights` so the AI panel can draw a health/readiness trend
sparkline. The panel shows an "AI model offline · rule-based" badge when
`window.claude` is absent (e.g. the deployed site).

## Overlap logic (recap)

`overlapping(a, b)`: half-open interval intersection on start/end.
`groupOverlaps`: union-find over pairwise overlaps → connected components.
`assignLanes`: events sorted by start; each takes the lowest-numbered lane
whose last event ends before it starts (greedy interval partitioning —
optimal lane count). Overlap-count badges come from component sizes.

## Layout system (recap)

`useWidgetLayout(pageKey, widgetIds)` reducer: `mode`
(vertical | horizontal | grid), `order` (drag to reorder), `collapsed` set.
State persists per user to `mf_widget_layouts` keyed `auth.uid()`; when
signed out or the table is absent it falls back to localStorage. Used by
TripleTimeline; Command widgets share the same primitives.

## Styling guide

Neon theme tokens only (`--neon-*`, `--ok/warn/danger`, `--accent`,
`--panel/panel-line/inset`); mono labels via `--font-mono`; area colour from
`unitTheme.unitColor(type)`; per-operator accents from the client palette.
Interactive widgets: `:focus-visible` rings, `aria-pressed`/`aria-label` on
toggles, no colour-only signalling (chips carry text), and animations respect
`prefers-reduced-motion` (CSS transitions only, no JS loops).

## Testing + CI

Vitest: `tests/overlap.test.ts`, `tests/widget-layout.test.ts`,
`tests/timeline-api.test.ts`, `tests/unit-ai.test.ts`,
`tests/combined.test.ts` (PAL branch wiring, branchOfUnit, board grouping)
— 274 tests across 23 files, all green. CI: `.github/workflows/ci.yml`
runs `npm ci && npm run build && npm test` on push/PR to main.
