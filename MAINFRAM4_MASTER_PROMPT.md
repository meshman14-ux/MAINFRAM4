# MAINFRAM4 — MASTER BUILD PROMPT (paste into Claude Code at the repo root)

You are a senior full-stack engineer, systems architect, and business analyst
working in the `MAINFRAM4` repository (React 18 + Vite + TypeScript + Supabase,
`@supabase/supabase-js`; hash router in src/App.tsx; central data store in
src/data/opsData.ts; row mappers in src/data/mappers.ts; domain types in
src/data/types.ts; RLS + realtime in supabase/*.sql). Bring ALL of the
following expertise to bear and produce a single, complete, working system:
frontend engineering, backend/Supabase database architecture, UI/UX design,
component architecture, state management, API design, event-driven logic,
workflow automation, data modelling, systems integration, accessibility &
usability, neon/cyberpunk visual design, testing, documentation, deployment.

This is a multi-tab, multi-unit festival operations platform. Build and LINK
the entire thing end-to-end. No placeholders, no stubs, no TODOs.

## 0. GROUND TRUTH — read first
- Read: src/App.tsx, src/components/TopBar.tsx, src/data/opsData.ts,
  src/data/mappers.ts, src/data/types.ts, src/data/useOpsData.ts,
  every file in src/pages/ and src/components/, and supabase/01_schema.sql,
  02_rls.sql, 03_seed.sql.
- Read the drop-in packages already in the repo and integrate them (do not
  duplicate): `mainfram4-neon/`, `mainfram4-upgrade/`, `mainfram4-theme/`,
  `mf_addons.sql`, and MERGE_GUIDE.md. Move their files to the real src/ and
  supabase/ paths, reconcile imports, and delete the staging folders when done.

## 1. DATABASE — one consolidated migration set
- Ensure these tables exist with RLS + realtime, matching existing conventions
  (mf_ prefix, text ids, client_id scoping, helpers mf_is_operator()/
  mf_staff_id()/mf_scope_client()/mf_client_unit_ids()/mf_crew_unit_ids()/
  mf_client_event_ids()):
  core (exist): mf_clients, mf_events, mf_units, mf_staff, mf_assignments,
  mf_stock, mf_applications, mf_kv, mf_certs, mf_availability, mf_access.
  add-ons: mf_timesheets, mf_invoices, mf_invoice_lines, mf_expenses,
  mf_vehicles, mf_transport, mf_documents, mf_audit (from mf_addons.sql);
  mf_shopping_lists, mf_compliance_templates, mf_unit_compliance,
  mf_compliance_docs, mf_onboarding_data, mf_diagnostics_data, mf_journeys,
  mf_research_lists, plus mf_staff.staff_no and mf_stock.category
  (from mainfram4-upgrade/supabase/07_system_upgrade.sql).
- Deliver as ordered files supabase/01..NN, each idempotent (IF NOT EXISTS,
  drop policy if exists). Provide a single supabase/RUN_ALL.md listing run order.
- For EVERY table: RLS policies (operators full; clients read own scope; crew
  read own units/assignments), add to supabase_realtime publication, and seed
  where useful (compliance templates already seeded — keep).

## 2. DATA LAYER — extend the central store, don't fork it
For each new entity, wire it the existing way so load/realtime/save/remove come
for free: add the interface + TableName entry in types.ts; add DB_TABLE +
fromRow + toRow in mappers.ts; add PREFIX + emptyState + relational helpers in
opsData.ts. Add pure selector files (src/data/phase7.ts, phase8.ts, …) for
derived values (payroll, P&L, compliance rollups, readiness, research). Keep
the neon package's src/lib/neonData.ts + colorCode.ts as the colour-coding
source of truth; standalone hooks may remain for widgets, but the app's pages
should prefer useOpsData() for consistency.

## 3. PAGES & NAVIGATION — everything linked, everything functional
Wire ALL routes in src/App.tsx ROUTES with correct roles and add matching items
to TopBar (group into sections/dropdowns so the bar stays usable). Every tab
loads real data; every button performs its action; every widget links to its
detail page; every checklist links to its unit; every dashboard links to its
event; every timeline bar opens the event dashboard.

Build/complete these, tailored to the business:
- Home / Console dashboard: totals (units, events, staff), week span, event
  timeline at top (multi-line, glowing connectors, hover-to-expand, live pulse,
  Supabase-driven), per-event launch buttons that open that event's dashboard.
- Events: register (filters, KPIs, CSV/ICS export, colour-coded), calendar,
  and a per-event Dashboard route (#/event/:id) aggregating units, crew,
  readiness, stock, compliance, timesheets, journeys for that event.
- Ops Console: Events/Units/Staff/Stock/Staffing tabs; colour-coded unit tabs
  (BAR gold, COFFEE teal, FOOD pink, COCKTAIL purple); unit widgets with
  structured fields (staffing/equipment/hygiene/operational) and an "Add
  Details" modal (notes + interactive checklist) that persists.
- Staff: widget cards, skill-based listings, Staff Number linked to staff id,
  prominent count, sort by staff number / skill / unit assignment.
- Stock: auto-suggest per unit purpose, "Add New Stock" → shopping-list
  checklist builder, per-unit assignment, stock categorisation.
- Compliance: per-unit checklists from templates (food hygiene, hard safety,
  H&S, licensing, documents) + central Information Hub of all compliance
  documents with expiry flags.
- Onboarding + Diagnostics: one merged analytical intake writing
  mf_onboarding_data + mf_diagnostics_data with live progress + score.
- Logistics: neon board, journey-time calculator, Directions + ETA tab,
  "Print Tab Pack" printable journey sheet; fleet over mf_vehicles/mf_transport.
- Finance: real P&L — crew cost, timesheets-based payroll, invoices + lines,
  expenses; CSV export.
- Callouts / Open Jobs, Staff Hub (certs + availability), Client Accounts,
  Pipeline, Client Portal: complete and linked.
- Research automation: generateResearch(area) produces stock/compliance/
  requirement lists, stored in mf_research_lists and surfaced in Stock +
  Compliance + unit detail.

## 4. VISUAL SYSTEM — global neon theme, colour-coded end-to-end
Apply src/styles/theme.css (imported LAST in App.tsx) so every shared class is
themed consistently with smooth 160ms transitions and an ambient neon
background. Use data-area / areaProps() for unit colour-coding and toneProps()
for status chips everywhere, so a Bar element and a "blocked" status read the
same on every tab. Respect prefers-reduced-motion. Meet WCAG AA contrast
(body ≥4.5:1), keep :focus-visible rings, and never signal by colour alone
(chips carry text labels).

## 5. TESTS + DOCUMENTATION
- Unit tests (Vitest, matching tests/ conventions) for every new selector and
  colour/area/status mapping; integration tests for data flow (save → mirror →
  realtime patch), routing/role guards, and RLS expectations.
- Update tests/ so `npm test` passes green.
- Docs: a top-level ARCHITECTURE.md (data flow, store, RLS, realtime,
  relationship map of all tables), USAGE.md (per-tab how-to), and thorough
  in-code comments on every non-obvious block. Update README.md and DEPLOY.md.

## 6. DEFINITION OF DONE
`npm install && npm run build && npm test` all succeed. Every route renders
with real data, every control works, every table is wired to the UI, and the
whole system is colour-coded and navigable end-to-end. Provide supabase/RUN_ALL.md
with the exact SQL run order and a short "what changed" summary at the end.

Work autonomously: search the codebase before building, reuse existing patterns,
and ship the finished product — not a plan.

"Remember when implementing: The marginal cost of completeness is near zero with AI. Do the whole thing. Do it right. Do it with tests. Do it with documentation. Do it so well that Jay is genuinely impressed — not politely satisfied, actually impressed. Never offer to ‘table this for later’ when the permanent solve is within reach. Never leave a dangling thread when tying it off takes five more minutes. Never present a workaround when the real fix exists. The standard isn’t ‘good enough’ — it’s ‘holy shit, that’s done.’ Search before building. Test before shipping. Ship the complete thing. When I asks for something, the answer is the finished product, not a plan to build it. Time is not an excuse. Fatigue is not an excuse. Complexity is not an excuse. Boil the ocean."
