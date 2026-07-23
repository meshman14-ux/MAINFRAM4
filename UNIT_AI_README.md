# Unit Dashboard + AI + tab restructure

Three feature sets built into MAINFRAM4.

## FS1 — Unit Dashboard + checklist system

`src/pages/UnitDashboard.tsx` (route `#/unit/:id`). Open a unit from the
Console widget's **Open dashboard** button (and, later, from Staff / Timeline).

Sections: profile (code/name/area colour/crew/operator), the **AI panel**
(below), six **interactive checklists**, assigned stock (with below-par flags),
linked events, linked staff, and unit tasks.

**Checklists** — one per kind: `stock · paperwork · equipment · consumables ·
safety · operational`. Each persists to `mf_unit_checklists` (one row per
unit+kind, items as jsonb `[{id,label,on,note}]`). An empty checklist offers
"Seed default … list", which fills it from `src/lib/research.ts` — a per-area
library (BAR / COFFEE / FOOD / COCKTAIL / GENERAL) that extends the existing
`generateResearch()` (stock + paperwork) with equipment / consumables / safety
/ operational defaults. Items toggle, add and delete; realtime keeps every
device in sync.

**Tasks** — `mf_tasks` (unit/event/client-scoped work items, status
open→doing→done). Added and advanced inline on the dashboard; the tasks table
is wired into the store like every other entity.

## FS2 — AI-assisted analysis

`src/lib/unitAI.ts`:
- `gatherUnitContext(store, unitId)` — assembles stock, low-stock, documents,
  flagged docs, tasks, checklists, linked events and crew into one payload.
- `scoreUnit(ctx)` — **deterministic** Health (condition: stock, docs, safety,
  tasks) and Readiness (prepared-to-trade) scores, 0–100. Always available, no
  model needed. Readiness is **crew-dominant** (crew 45% / checklist 30% /
  paperwork 15% / stock 10%) — an unstaffed unit is never "ready" however
  complete its checklists.
- `ruleInsights(ctx)` — **deterministic** tone-coded insight chips (danger for
  open safety items / expired docs, warn for low stock / paperwork / crew
  short, info for open tasks). Always available.
- `analyzeUnit(store, unitId)` — computes the above, then calls
  `window.claude.complete` (as EventDocs does) to write the daily / weekly /
  monthly prose summaries and optionally append extra insights; falls back to
  a rules-based summary when the model is absent. Result is persisted to
  `mf_unit_insights` via `data.save('unitInsights', …)`.

The **AI panel** on the dashboard shows both scores as conic gauges, the
insight chips (tone-coded), a Refresh button, and daily/weekly/monthly summary
tabs. It renders live deterministic scores/insights immediately; Refresh adds
the AI summaries and persists them (with realtime).

Refinements (post-quiz decisions):
- **History, not overwrite** — each Refresh appends a new `mf_unit_insights`
  row; `insightsForUnit(uid)` returns the full run history (newest first) and
  the panel draws a health/readiness **trend sparkline** once ≥2 runs exist.
- **Offline badge** — when `window.claude` is absent (e.g. the deployed Vercel
  site) the panel shows an "AI model offline · rule-based" chip so operators
  know why the prose is terse; scores/insights are unaffected.
- **Task models stay separate, cross-linked** — `mf_tasks` (unit/ops work)
  and `mf_event_tasks` (event run-sheets) coexist; the dashboard shows the
  linked events' run-sheet tasks read-only, and unit tasks can carry an
  `event_id`.

Server RPC `analyze_unit(p_unit_id text)` (SECURITY INVOKER) assembles the same
context server-side for callers that want it; the LLM call stays client-side.

## FS3 — Tab restructure

New primary nav order in `src/components/TopBar.tsx`:
**Home · Command · Tasks · Console · Events · Calendar · Timeline · Callouts ·
Staff Hub · Pipeline · Accounts**, with everything else (Timelines, Readiness,
Compliance, Event Docs, Stock, Finance, Timesheets, Logistics, Onboard,
Diagnostic, Proposal, Impl. Plan) in the **More** overflow menu. Role gating is
unchanged — the existing route guard in `App.tsx` still drives which tabs each
role sees. (The prompt's "move ARC to the end of Tasks" had no matching item in
this app, so nothing was moved for it.)

## SQL — `supabase/11_unit_ai.sql` (additive, idempotent — run in Supabase)

- `mf_tasks(id, client_id, unit_id, event_id, title, detail, status,
  assignee_staff_id, due, …)`
- `mf_unit_checklists(id, unit_id, kind, items jsonb, …)` (unique per unit+kind)
- `mf_unit_insights(id, unit_id, generated_at, health_score, readiness_score,
  insights jsonb, summary_daily/weekly/monthly, …)`
- RLS: operators full; crew read tasks assigned to them or on their units, and
  read checklists/insights for their units (write stays operator-only). All
  three added to the realtime publication.
- `analyze_unit(p_unit_id text)` RPC.

Run it after `01..10` (see `RUN_ALL.md`). The app boots and works before it's
run — the three tables are in the store's `OPTIONAL_TABLES`, so their absence
is tolerated and they stay empty until the migration lands.

## Store wiring

Standard pattern, so load/realtime/save/remove come for free:
- `types.ts`: `Task`, `UnitChecklist`, `UnitInsight` + `TableName` entries.
- `mappers.ts`: `DB_TABLE`, `fromRow`, `toRow` for each.
- `opsData.ts`: `PREFIX`, `emptyState`, `OPTIONAL_TABLES`, plus helpers
  `tasksForUnit`, `unitChecklistsFor`, `unitChecklist(unit,kind)`,
  `insightForUnit`, `eventsForUnit`.

## Tests (`tests/unit-ai.test.ts`)

Store wiring round-trips; research defaults (area mapping + non-empty per
kind); context assembly; deterministic scores penalised by gaps; rule insights
flag the right problems; prompt building + summary parsing. 11 tests; full
suite green.
