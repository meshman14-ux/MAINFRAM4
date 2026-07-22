# MAINFRAME — Foundation (Supabase schema + typed data-access layer)

This is the **foundation layer** from the Build Brief: the real database and
the typed data-access layer that every module becomes a thin view over. It's
built directly from the shapes in your `opsdeck-data.js`, so moving off
`localStorage` is a **storage swap, not a rewrite**.

## What's here

```
supabase/
  01_schema.sql   7 real tables (mf_clients … mf_applications) + mf_kv,
                  mirroring the exact OPSDATA shapes. jsonb for nested
                  fields (schedule, unitIds, staffing, shortlist, pool, skills).
  02_rls.sql      mf_access + Row-Level Security for the four roles
                  (owner · manager · crew · client) + realtime publication.
  03_seed.sql     the exact seed data from opsdeck-data.js.

src/
  data/types.ts       TypeScript types matching every record shape.
  data/mappers.ts     snake_case (DB) ⇄ camelCase (app) row mapping.
  data/opsData.ts     OpsData store: same API as window.OPSDATA
                      (all/get/save/remove/subscribe) + every derived
                      helper (staffingFor, staffCompliance, suitableForUnit,
                      lowStockForClient, eventColor …), Supabase-backed,
                      with realtime.
  data/useOpsData.ts  React hook — load once, re-render on any change
                      (local write OR realtime from another device).
  lib/supabase.ts     Supabase client singleton (reads Vite env vars).

tests/
  parity.test.ts      13 tests proving the ported logic gives identical
                      answers to opsdeck-data.js on the seed data.
```

## The migration in one sentence

The prototype's `load() / persist() / subscribe() / emit()` becomes
`OpsData.load()` (fetch all tables into an in-memory mirror), `save()/remove()`
(write to Supabase + optimistic mirror update), and `subscribe()` + Postgres
realtime (every device stays live). **The method surface is identical**, so
each existing `.dc.html` module ports to a React component that calls the same
methods.

## Set up the database

1. Create a Supabase project.
2. In **SQL Editor**, run the files in order: `01_schema.sql`,
   `02_rls.sql`, then `03_seed.sql`.
3. For each role, add an `mf_access` row linking a Supabase Auth user to a
   role (`owner` / `manager` / `crew` / `client`) and, for crew/client, a
   `client_id` scope (and `staff_id` for crew).

## Run the app shell

```bash
npm install
cp .env.example .env          # fill in your Supabase URL + anon key
npm run dev
```

Any component:

```tsx
import { useOpsData } from './data/useOpsData';

function Home() {
  const { data, ready } = useOpsData();
  if (!ready) return <p>Loading…</p>;

  const events = data.all('events');
  const gaps = events.reduce((n, e) => {
    const need = data.staffingFor(e);
    const total = need.Bar + need.Coffee + need.Food + need.General;
    return n + Math.max(0, total - data.assignmentsForEvent(e.id).length);
  }, 0);

  return <div>{events.length} events · {gaps} crew gaps</div>;
}
```

## Verify

```bash
npm run typecheck    # strict TS, clean
npm run test         # 13 parity tests, all pass
```

## Why real tables (not the prototype's single-row cloud model)

`opsdeck-data.js` ships an opt-in Supabase path that stores the whole state as
one `jsonb` blob in `opsdeck_state`. That's fine for one user syncing devices,
but the Build Brief wants **multi-user with per-role security** — which needs
real rows so RLS can filter them. This foundation builds the brief's target
(real `mf_*` tables + RLS) while keeping the in-app data shapes identical, so
you get multi-user security *and* the storage-swap migration.

## Next (say the word)

Per the brief's build order: **Home → Ops Console → Events + Calendar →
Staff Hub → Callouts + Onboarding → Compliance/Stock/Finance → Client Portal.**
Each is now a thin view over `useOpsData()`.

---

## Home module (built)

The first module is complete. It renders the whole daily loop from the
screenshots:

- **KPI row** — operators, events ahead, crew gaps, unconfirmed, stock low.
- **Needs action feed** — staffing gaps, unconfirmed crew, low stock and
  RTW-pending, colour-tagged and ordered by urgency.
- **Crew confirmations rail** — the next event's crew with one-tap WhatsApp
  (pre-filled message) and a Mark-confirmed toggle that writes straight
  through `OpsData.save` (optimistic + realtime).
- **Events register** — every upcoming event, colour-coded per event with a
  T-minus countdown, crew filled/needed, confirmed count and stock status.

Files:

```
src/pages/Home.tsx          the screen
src/components/TopBar.tsx    brand + nav + live date
src/data/home.ts            pure selectors (homeKpis, needsAction,
                            eventRows, nextEventConfirmations)
src/styles/tokens.css       the MAINFRAME dark theme tokens
src/styles/home.css         Home layout
tests/home.test.ts          12 tests pinning the numbers to the screenshot
```

Everything in `home.ts` is a pure function over `OpsData`, so it's unit-tested
without a database. `tests/home.test.ts` asserts the exact figures from the
15 Jul 2026 screenshot (Latitude 4/8 T-8, 16 crew gaps, 0/4 confirmed, etc.).

Reference screenshots of the rendered module (desktop + mobile) ship alongside
this project.

---

## Ops Console module (built)

The client-scoped workbench from Blueprint §04, Phase 3. Pick an operator, then
work across five tabs:

- **Events** — CRUD with a schedule builder that auto-fills day rows from the
  event's date range (phases: Travel, Build, Trading Day, Breakdown …), plus
  `.ics` export.
- **Units** — CRUD for bars / coffee / food / catering / support units.
  Creating a unit seeds the default stock catalogue for its type.
- **Staff** — CRUD with role, rate, one-tap RTW toggle, and a live compliance
  chip (compliant / expiring / blocked) from the cert algorithm.
- **Stock** — par tracking with inline on-hand editing, below-par highlighting,
  and a reorder `.csv` export.
- **Staffing** — the heart: per-unit columns showing filled slots and gaps,
  a ranked candidate picker driven by the suitability score (skill + availability
  + compliance + own-client + reliability), with blocked crew flagged and
  un-bookable, plus per-assignment confirm toggles.

Files:

```
src/pages/OpsConsole.tsx              client selector + tabs
src/components/console/EventsTab.tsx  events CRUD + schedule builder + ics
src/components/console/UnitsTab.tsx   units CRUD + default-stock seeding
src/components/console/StaffTab.tsx   staff CRUD + RTW + compliance chips
src/components/console/StockTab.tsx   par tracking + reorder csv
src/components/console/StaffingTab.tsx assign crew, derive gaps, confirm
src/styles/console.css                console layout
tests/console.test.ts                 6 tests: assign/confirm/seed flows
```

Routing: the app uses a tiny hash router — `#/` is Home, `#/console` is Ops
Console. No router dependency.

---

## Blueprint alignment (System Blueprint v1)

The schema and data layer were aligned to the engineering blueprint:

- `mf_assignments` gains `area` + `overtime`; `mf_units` gains `desc` +
  `checklist`; `mf_events` gains `callout` + `event_onboarding`;
  `mf_applications` gains `area`, `overtime`, `assignment_id`.
- `mf_kv` is keyed by `ns` alone (global JSON blobs), per §07.
- New algorithms ported from §03 and tested: **required certs per area**,
  **full compliance detail** (expired / expiring ≤60d / missing → blocked),
  **crew cost** (`rate × tradingHours`, 8h/day), **event readiness**
  (9-step scoring), and the **default stock catalogue** per unit type.

`tests/algorithms.test.ts` locks these to the blueprint's stated behaviour.

---

## Build order status

- [x] **Phase 1** — Schema + typed data layer (OPSDATA contract, realtime, `importAll`)
- [x] **Phase 2** — Auth + roles: login, `useAccess()`, role-scoped routing, **JWT seam verified**
- [x] **Phase 3a** — Home dashboard
- [x] **Phase 3b** — Ops Console (Events, Units, Staff, Stock, Staffing)
- [x] **Hardening pass** — save-merge, realtime echo, promoted cert/availability tables
- [x] **Phase 4** — Events Register + Calendar + Staff Hub
- [x] **Phase 5** — Callouts & Open Jobs + Onboarding wizard + Readiness screen
- [x] **Phase 6** — Compliance register + Stock ordering + Finance
- [x] **Phase 7** — Client Portal + deployment scaffolding
- [x] **Phase 8** — Sales Pipeline (CRM), first of the operational features
      ported from the original prototype library
- [x] **Phase 9** — Logistics (vehicle & driver movements), second of the
      operational features
- [x] **Phase 10** — Event Tasks, first item from the user-feedback batch

**All seven blueprint phases plus Phases 8–10 are built.** See `DEPLOY.md` for
going live and `LAUNCH_CHECKLIST.md` for the real-users pre-flight. New work
after go-live ships as additive migrations (see `05_pipeline.sql`,
`06_logistics.sql`, `07_tasks.sql`) so a live database never needs to be
rebuilt.

### Banked for later (from user feedback, not yet built)

A round of handwritten feedback covered UI polish across Compliance, Home,
Console, Callouts, Calendar and Events, plus three larger asks. The task
module (below) is done; still queued:
- **PWA installability** so the web app can be added to an Android home
  screen (a manifest + service worker — much smaller than a native app).
- A **detailed new-client onboarding flow** with a full diagnostic and
  checklist, surfaced on the Home page.
- Wiring **"add to task" quick-actions onto other screens** (e.g. turning a
  Compliance issue or a low-stock line directly into a task) — the
  underlying `addTask()` method is generic enough to support this now; only
  the buttons on those other screens remain.
- The UI polish pass itself (widget widths, cross-navigation between
  widgets, row descriptions, visual tidy-ups).

---

## Phase 10 — Event Tasks (built)

From user feedback, not a prototype port: tasks tied to a specific event
(not a personal to-do list), colour-coded by category, sortable by due date
so an operator can work their "timetable" across every upcoming event.

- **Tasks page** (`#/tasks`, operator-only, on the primary nav given how
  often it's likely to be used) — add a task against an event with a
  category and optional due date, filter by colour-coded category tabs
  (Prep / Crew / Stock / Compliance / Client / General), tick off when done,
  remove when no longer needed. A summary strip shows open tasks, overdue
  count, and total. `src/pages/Tasks.tsx`.
- **Sorting matches the "timetable" framing**: open tasks sort by due date
  ascending (undated tasks last), done tasks always sort to the bottom
  regardless of date — verified in the screenshot with a 6-task mix across
  two events.
- **Overdue is done-aware**: a task with a past due date that's already
  been completed is never flagged overdue, even though the date has passed
  — proven with a dedicated test.
- **Operator-only for now** — `mf_event_tasks` is RLS-restricted like
  Pipeline and Logistics. A crew-facing "my tasks" view (via the
  `assignedTo` field, already in the schema) is a natural follow-on for
  Staff Hub, not built yet.

---

## Phase 9 — Logistics (built)

Ported from the original `Logistics.dc.html` prototype: vehicle and driver
movement planning per event.

- **Per-event movement planning** (`#/logistics`, operator-only) — plan a
  movement (unit/trailer or "support van, no trailer" + driver + depart
  date/time), cycle its status forward through
  `planned → en-route → on-site → returned`, and remove it. A summary strip
  shows total movements, how many are en-route right now, and how many
  tow-capable drivers the operator has. `src/pages/Logistics.tsx`.
- **Driver clash detection reuses Phase 6's `eventsOverlap()` directly** —
  the driver pool for an event flags anyone already on a movement for a
  *different, date-overlapping* event (e.g. "⚠ Camp Bestival"), the same
  double-booking concept the Compliance register already surfaces for crew
  assignments, applied here to drivers.
- **Tow-capability warning** — selecting a real towed unit with a driver who
  isn't marked `canTow` shows a warning ("needs a tow-qualified driver, or
  send them in the support van") without blocking the plan, matching the
  prototype's own soft-warn behaviour.
- **Adapted for real multi-tenancy** — the original prototype showed every
  client's events on one shared screen (it had no per-operator isolation).
  This build scopes Logistics to one operator at a time via the same
  client-selector pattern as Compliance/Finance/Stock, which is how the rest
  of this multi-tenant app already works — a deliberate improvement, not a
  faithful port of that part.
- **Operator-only by design** — `mf_movements` is RLS-restricted like
  `mf_pipeline`; crew and clients cannot see vehicle/driver planning.
  Proven with 3 dedicated RLS tests against real Postgres.

---

## Phase 8 — Sales Pipeline (built)

Ported from the original `Pipeline.dc.html` prototype (found in a fuller
export of the original design library, uploaded after go-live). Rather than
a separate system, this is the next slice of already-designed functionality
that didn't make the first seven phases.

- **Kanban board** (`#/pipeline`, operator-only) — six stages:
  `lead → contacted → diagnostic → proposal → won`, plus a `lost` side-branch
  reachable from (and returning to) any stage. Add a lead by name, edit a deal
  value and next-step note inline per card, move a card forward/back with the
  arrow buttons, mark it lost or reopen it, and — the connective bit — **book
  a job straight from a card**, which resolves-or-creates the client and
  creates the event for real, exactly like the Onboarding wizard does.
  `src/pages/Pipeline.tsx`.
- **Two deliberate improvements over the original prototype**, both called
  out explicitly rather than silently changed:
  1. Reopening a lost lead now restores its *exact* prior stage. The
     original always reset to a fixed stage depending on which button was
     clicked — a real inconsistency in the source, not a design choice worth
     preserving.
  2. Booking a job now auto-advances the matching pipeline card to "won".
     The original left this as a separate manual drag, which is an easy step
     to forget. Pass `{ advanceToWon: false }` to `bookJob()` to disable this
     and match the prototype exactly.
- **Deliberately deferred**: the original prototype's lead-scoring (an
  "ops maturity" score from a linked Client Diagnostic tool) is not built —
  that lives in a separate advisory/consultancy layer that scores *other*
  businesses, which is out of scope for this pass. Leads move through every
  stage ungraded; the schema (`mf_pipeline`) has room to add scoring later
  without a migration.
- **Confidential by design** — `mf_pipeline` is RLS-restricted to
  owner/manager only. Crew and clients cannot see the sales pipeline exists,
  proven with 4 dedicated RLS tests against real Postgres.

### New migration — additive, safe on a live database

`supabase/05_pipeline.sql` adds the `mf_pipeline` table, its RLS policy, and
realtime — nothing else. It does **not** touch `01`–`03`. On an already-live
project: **paste this one file into the Supabase SQL Editor and Run**, then
push the updated code so Vercel redeploys. No downtime, no re-running earlier
migrations.

---

## Test summary

```
tests/parity.test.ts       14  derived logic == opsdeck-data.js (exact scores)
tests/home.test.ts         12  Home KPIs/feed match the screenshot
tests/algorithms.test.ts   10  blueprint §03 algorithms
tests/console.test.ts       9  console flows + save-merge + echo suppression
tests/phase4.test.ts       10  register / calendar / staff-hub selectors
tests/phase5.test.ts       10  callouts / apply→approve→assign / onboarding / readiness
tests/phase6.test.ts        9  compliance / double-booking / reorder / finance
tests/portal.test.ts        4  client portal: own-events isolation + progress
tests/pipeline.test.ts     16  CRM stages, lost/reopen, book-job, summary math
tests/logistics.test.ts    12  movements, status cycling, driver clash detection
tests/tasks.test.ts        11  task CRUD, overdue detection (done-aware), category summary
tests/routing.test.ts      14  role landing + route guarding + pipeline/logistics/tasks/portal access
tests/rls.test.ts          21  RLS scope + crew self-service + JWT seam + pipeline/logistics/tasks lock (real Postgres)
                           ---
                          152  all passing
```

---

## Real-user readiness pass (built)

Three gaps that only matter once strangers log in, now closed:

- **Password reset** — "Forgot password?" on the login screen sends a Supabase
  reset email; the link returns the user to a "Set a new password" screen
  (recovery sessions are detected via the `PASSWORD_RECOVERY` auth event and
  gated in `App`). `src/pages/SetNewPassword.tsx`, extensions in
  `src/data/useAccess.ts` (`resetPassword`, `updatePassword`, `isRecovery`).
- **First-run experience** — an owner signing in to an empty production
  database (no seed) gets a welcome card on Home pointing at the Onboarding
  wizard, instead of a dashboard of zeros.
- **Mobile navigation fix** — the nav was hidden entirely under 620px, which
  would have stranded crew on phones with no way to navigate or sign out. It's
  now a horizontally scrollable tab row with the sign-out kept reachable.
  Verified at iPhone width as a crew login: lands on Staff Hub, shifts visible,
  Confirm tappable, sign-out visible, zero horizontal overflow.

`LAUNCH_CHECKLIST.md` is the pre-flight for inviting real people: RLS
verification on the live project, disabling open sign-ups, a three-role smoke
test script, a two-device realtime check, cross-tenant verification, backups,
and the repeatable invite procedure.

---

## Phase 7 — Client Portal & deploy (built)

- **Client Portal** (`#/portal`, the `client` role's landing page) — a calm,
  read-only view of *their own* events, each with a crew-confirmed meter and a
  preparation (readiness) meter, plus a highlighted "next event". No operator
  controls; RLS scopes the data to their `client_id` server-side and the portal
  selector shapes it for reassurance rather than control.
  `src/pages/ClientPortal.tsx`, selector in `src/data/portal.ts`,
  tested in `tests/portal.test.ts` (including the "never leaks another client's
  events" isolation check).
- **Deployment scaffolding** — `vercel.json` (Vite framework + SPA rewrite) and
  a full `DEPLOY.md` walking through Supabase project setup, running the SQL
  migrations in order, provisioning the first owner, and connecting Vercel with
  the two env vars. `.env.example` documents the required config.

### Going live (summary — full steps in `DEPLOY.md`)

1. Create a Supabase project; run `supabase/01_schema.sql`, then `02_rls.sql`
   (and optionally `03_seed.sql`).
2. Create your owner login in Supabase Auth, then `insert into mf_access …`.
3. Import the repo into Vercel, set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`, and deploy.

Anthropic can't click "deploy" for you — this needs your own Supabase and Vercel
accounts — but everything required is in the repo and the build is verified.

---

---

## Phase 6 modules (built)

Three operator screens, all reusing algorithms proven in earlier phases plus
one new one (double-booking detection):

- **Compliance register** (`#/compliance`) — every crew member's RTW and cert
  status (compliant / expiring / blocked), sorted worst-first, with a summary
  strip and a **scheduling-conflict banner** that flags any crew member
  double-booked across overlapping events. `src/pages/Compliance.tsx`.
- **Stock ordering** (`#/stock`) — a consolidated reorder list across all of an
  operator's units (below-par lines only, order = par − on-hand) with CSV
  export for a supplier. `src/pages/StockOrdering.tsx`.
- **Finance** (`#/finance`) — per-event crew cost (confirmed crew × rate × 8h
  per trading day) with a client rollup: total, upcoming, confirmed shifts.
  `src/pages/Finance.tsx`.

New store logic: `eventsOverlap`, `doubleBookingsForStaff`,
`doubleBookingsForClient`. Selectors in `src/data/phase6.ts`, tested in
`tests/phase6.test.ts`.

The operator nav now groups the less-frequent tools (Readiness, Compliance,
Stock, Finance, Onboard) under a **"More"** dropdown to keep the bar clean.

---

## Phase 5 modules (built)

Three operator screens that reuse the suitability and readiness algorithms:

- **Callouts & Open Jobs** (`#/callouts`) — toggle a job callout open/closed per
  event, see open positions derived from unit crew gaps, and review applicants
  ranked by the suitability score. **Approve → creates the assignment** (linked
  back on the application via `assignmentId`); decline closes it out. The whole
  apply→approve→assign flow is tested. `src/pages/Callouts.tsx`.
- **Onboarding wizard** (`#/onboard`) — a 4-step guided setup (Operator → Units
  → Staff → Review) for a new client. Adding a unit seeds its default stock
  catalogue automatically; the review step reports completeness.
  `src/pages/Onboarding.tsx`.
- **Readiness** (`#/readiness`) — the 9-step go-live scorecard per upcoming
  event (units, shortlist, booked, confirmed, stock, compliance, schedule,
  docs, client notified) with a percentage bar and READY / IN PREP badge.
  `src/pages/Readiness.tsx`.

Selectors and the apply/approve/callout workflow live in `src/data/phase5.ts`
and the store, tested in `tests/phase5.test.ts`.

---

## Phase 2 — Auth & roles (built)

MAINFRAME is now a real multi-user system: people sign in, and every screen
respects their role and scope.

- **Login** (`src/pages/Login.tsx`) — email/password via Supabase Auth.
- **`useAccess()`** (`src/data/useAccess.ts`) — resolves the current session and
  the caller's `mf_access` row (role + client/staff scope), and reacts to
  sign-in / sign-out / token refresh.
- **Role-scoped routing** (`src/App.tsx`) — the nav only offers screens a role
  may reach, direct hash access is guarded, and each role lands on the right
  home: operators → Home, crew → Staff Hub, clients → Events.
- **Scope binding** — Staff Hub binds a crew user to *their own* `staff_id`
  (the operator "view as" picker only appears for operators). This is the piece
  that turns the earlier demo picker into a real per-user session.
- **Provisioning** — `supabase/04_auth_setup.sql` documents how to create the
  first owner and invite crew/clients by inserting `mf_access` rows. A signed-in
  user with no `mf_access` row sees an "account pending" screen.

### The JWT seam is verified, not assumed

The riskiest untested link was: does a real signed-in session's JWT actually
drive `auth.uid()` and therefore RLS? It does. `tests/rls.test.ts` and
`npm run verify:jwt` set the full `request.jwt.claims` JSON exactly as
Supabase's PostgREST does after verifying a token, then confirm `auth.uid()`
extracts `sub`, `mf_role()` resolves, and the data scopes correctly. (This also
corrected the older `request.jwt.claim.sub` convention to the current
`request.jwt.claims` JSON form.)

---

## Phase 4 modules (built)

Three modules from Blueprint §04, all thin views over `useOpsData()`:

- **Events Register** (`#/events`) — every event across all operators with a
  live/upcoming/past scope filter, staffing and stock rollups, colour accent
  and T-minus countdown. `src/pages/EventsRegister.tsx`.
- **Calendar** (`#/calendar`) — a Monday-first month grid spanning all
  operators, each event drawn on every day it runs, colour-coded, with
  month navigation and a Today jump. `src/pages/Calendar.tsx`.
- **Staff Hub** (`#/staff`) — crew self-service: my shifts with
  confirm/withdraw, my compliance (RTW + required certs with expiry states),
  a cert uploader, and a tap-to-toggle availability calendar. Reads and writes
  the promoted `mf_certs` / `mf_availability` tables. `src/pages/StaffHub.tsx`.

Selectors live in `src/data/phase4.ts` (register rows, month grid, my-shifts,
my-compliance) and are unit-tested in `tests/phase4.test.ts`.

### A note the compliance model surfaced

Building Staff Hub confirmed the compliance rules bite correctly: a Unit
Manager (Supervisor skill) **requires a First Aid certificate**, so a manager
without one shows as `blocked` — caught by a test, not in production.

---

## Hardening pass — weaknesses found and fixed

A deliberate review surfaced six weaknesses; all are now fixed and tested.

**1. `save()` could wipe JSONB on a cold mirror.** A partial save (e.g. editing
an event's call time) upserted the whole row, so if the full row wasn't in
memory it blanked `schedule`, `shortlist`, etc. Fixed: `save()` now fetches the
current row before merging when doing a partial update on a row it hasn't
loaded, and a new `patchJson()` does safe read-modify-write on a single nested
field. Tested in `console.test.ts`.

**2. Optimistic writes raced their own realtime echo.** A write's own
`postgres_changes` echo could clobber a newer local edit. Fixed with an
echo-suppression window (`markLocalWrite` / `isOwnEcho`). Tested.

**3. `load()` fetches all rows with no pagination.** Acceptable for the pilot
(the blueprint's single-operator model); flagged as a known ceiling. Not yet
changed — revisit before multi-season scale.

**4. Suitability tests were too loose.** Now pin **exact** scores
(Jordan/Aaron 170, Emma 70, Tom 45) and assert strict descending rank order.

**5. RLS was syntax-only and had real bugs.** Now verified against **real
Postgres** (PGlite/WASM). The verification caught two genuine bugs that syntax
checks never would:
  - **Infinite recursion** — crew policies on `mf_events`/`mf_units` subqueried
    `mf_assignments`, whose policies subqueried back. Fixed by moving the
    cross-table lookups into `SECURITY DEFINER` helper functions.
  - **Crew leaked into the client portal** — crew rows carry a `client_id` for
    their own scoping, which accidentally satisfied the client-portal read
    policies. Fixed by gating `mf_scope_client()` on `role = 'client'`.
  `tests/rls.test.ts` now runs 8 behavioural checks (owner/client/crew scope,
  write-denial, availability isolation) against real Postgres, in CI.

**6. `staffCerts` / `availability` as global kv blobs.** Every crew cert write
would rewrite one shared JSON row, and RLS couldn't scope a crew member to
their own certs. **Promoted to real tables** `mf_certs` and `mf_availability`
with per-crew RLS. `importAll` translates the old kv shape into them.

### Verifying the database yourself

```bash
npm run verify:schema   # executes schema+rls+seed against real Postgres
npm run verify:rls      # runs the role-scope checks with simulated logins
npm test                # includes tests/rls.test.ts (real-Postgres RLS)
```

---
