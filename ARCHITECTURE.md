# MAINFRAME — Architecture

React 18 + Vite + TypeScript single-page app, backed by Supabase
(Postgres + Auth + Realtime), deployed on Vercel. No server of our own —
the database enforces access (RLS) and pushes changes (realtime).

## Data flow

```
Supabase (Postgres, RLS)                      Browser
┌─────────────────────┐   initial load   ┌──────────────────────────┐
│ mf_* tables         │ ───────────────▶ │ OpsData (in-memory       │
│ + supabase_realtime │   postgres_      │  mirror, singleton)      │
│   publication       │ ◀─── changes ─── │  all()/get() sync reads  │
└─────────────────────┘                  │  save()/remove() writes  │
        ▲    optimistic upsert/delete    │  subscribe() → emit()    │
        └────────────────────────────────│  useOpsData() React hook │
                                         └──────────────────────────┘
```

- **`src/data/opsData.ts`** — the store. One initial `load()` pulls every
  table into an in-memory mirror shaped `{table: {id: row}}`. Reads are
  synchronous against the mirror; writes upsert to Supabase optimistically
  and `emit()`; realtime patches from other devices land in the same mirror.
  Echo suppression stops our own writes bouncing back and clobbering newer
  local edits.
- **`src/data/mappers.ts`** — the only place snake_case ⇄ camelCase happens.
  `DB_TABLE` maps logical names to `mf_*` tables; `fromRow`/`toRow` translate;
  `prune()` drops undefined keys so partial upserts never blank columns.
- **`src/data/types.ts`** — domain shapes. `TableName` is the master list of
  generic tables: **adding an entry there (+ mapper + PREFIX + emptyState)
  wires load, realtime, save and remove automatically.**
- **Pure selectors** (`phase4/6/7/12.ts`…) — derived values (payroll, P&L,
  compliance rollups, ETA maths, research lists) as pure functions of the
  store, unit-tested directly.
- **kv namespaces** (`mf_kv`) — JSON blobs for page-scoped state that isn't
  tabular: `accounts`, `diagnostics`, `implplan`, `unitDetails`. Same sync,
  RLS and realtime as tables, without schema churn.

## Tables & relationships

```
mf_clients ─┬─ mf_events ──┬─ mf_assignments ── mf_staff ─┬─ mf_certs
            │              ├─ mf_movements (driver=staff) └─ mf_availability
            │              ├─ mf_event_tasks
            │              ├─ mf_timesheets
            │              ├─ mf_invoices (lines jsonb)
            │              └─ mf_expenses
            ├─ mf_units ──┬─ mf_stock (category)
            │             ├─ mf_shopping_lists
            │             └─ mf_documents (also client/staff scoped)
            ├─ mf_staff (staff_no)
            ├─ mf_vehicles
            └─ mf_pipeline (pre-client prospects)
mf_access — auth.users → role (owner/manager/crew/client) + client/staff binding
mf_kv     — JSON namespaces (accounts, diagnostics, implplan, unitDetails)
```

Events store `schedule`, `shortlist`, `callout` and `staffing` as jsonb on
the row — invoices follow the same pattern for `lines`. One row, one
realtime patch, no join bookkeeping.

## Security (RLS)

Roles come from `mf_access` (uuid → role + optional client/staff binding).

- **operators** (owner/manager): full read/write everywhere
  (`mf_is_operator()`).
- **crew**: read their own staff row, units they can work, their
  assignments/certs/availability; write their own availability, certs and
  assignment confirmations.
- **clients**: read their own scope (`mf_scope_client()`), nothing else.
- Commercial tables (pipeline, movements, tasks, timesheets, vehicles,
  invoices, expenses, documents, shopping lists) are operator-only.

The app's route guard (`ROUTES` in `App.tsx`) controls which screens each
role sees; RLS is the real enforcement layer server-side.

## Routing

Hash router in `App.tsx` — first segment picks the page (`#/console`,
`#/event/E001`, `#/plan/<client>`). Deep-linkable pages parse their param
from the hash. `TopBar` renders primary tabs + a "More" dropdown, filtered
by role.

## Visual system

- `tokens.css` — the neon palette (`--neon-cyan/pink/purple/green/yellow/blue`),
  glow tokens, ambient background. Imported first.
- `unitTheme.ts` — one hue per unit type (Bar cyan, Coffee yellow, Food
  green, Cocktail pink, Catering purple, Support blue) + per-tab hues.
  Components set `--uc` (or `--evc` for event colours) inline; CSS derives
  borders, chips and glows from it, so an element's identity is set in
  exactly one place.
- Status chips always pair colour WITH a text label (`chip-green` +
  "confirmed"), body contrast meets WCAG AA, `:focus-visible` rings are
  global, `prefers-reduced-motion` disables drift/pulse/lift.
- `theme.css` — imported last: uniform 160ms transitions and the print
  stylesheet that turns Logistics into a clean paper "tab pack".

## Tests

Vitest in `tests/`. Store logic is tested by injecting a seeded mirror into
`OpsData` (no network); selectors are pure-function tests; `rls.test.ts`
asserts the live policy expectations. `npm test` must be green before push.
