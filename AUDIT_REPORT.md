# MAINFRAM4 — System Audit Report

**Phase 1 (read-only).** No code was changed. Audited through ten expert
lenses by three parallel reviewers plus direct verification; every finding
cites file:line. Toolchain state at audit time: `tsc` **0 errors**, build
**clean** (largest chunk 360 kB / 87 kB gz), **207/207 tests pass**, no lint
script configured, no secrets tracked in git (`.env` ignored, only
`.env.example` with placeholders).

---

## Executive summary

| Severity | Count |
|---|---|
| 🔴 Critical | **5** |
| 🟠 Major | **18** |
| 🟡 Minor | **16** |
| 🔵 Enhancement | **13** |

**Top 5 to fix first**
1. **C1 — `mf_kv` is readable by every signed-in user.** Crew/client logins can pull operator pins, Event Docs, client diagnostics and accounts via the raw API.
2. **C2 — Crew can rewrite their own `mf_staff` row**, including `rate` and `rtw='Verified'` — bypassing the compliance gate and inflating payroll, invisible in the UI.
3. **C3+C4+C5 — the failure triangle:** no error boundary (any render crash blanks the app), optimistic saves never roll back on Supabase error, and no click handler catches rejections — so a failed save *looks* saved until reload.
4. **M1 — the data mirror survives sign-out.** A different user signing in on the same tab sees the previous session's data until a hard refresh.
5. **M2 — kv/certs/availability have no realtime subscription.** Pins, Event Docs, diagnostics, cert uploads and availability changes don't sync across devices until reload (the UI implies they do).

**Top 5 enhancement ideas** (full backlog in the 🔵 section)
1. Audit trail — who changed/confirmed/cancelled what, when (dispute protection).
2. Invoice PDF generation + VAT support (money is currently display-only).
3. Proactive notifications/reminders — callouts opening, certs expiring, shifts unconfirmed.
4. Data export (CSV/JSON) for payroll, accountant and backup.
5. Link Event Docs checklists to real events so they feed the readiness hard gate.

---

## 🔴 Critical

### C1 — `mf_kv` readable by every authenticated user
**Lens:** Security · **Confidence:** confirmed (two independent reviewers)
**Where:** `supabase/02_rls.sql:214-216` — `create policy kv_authed_read on mf_kv for select using (auth.uid() is not null);`
**What:** `mf_kv` holds `pins` (operator private notes), `eventDocs`, `diagnostics` (43-field client intake), `accounts`, `implplan`, `unitDetails`. Any crew or client JWT can `select * from mf_kv` via the REST API and read it all. The same class of business data is operator-locked in `mf_pipeline` but wide open here.
**Fixes:** (A) per-namespace policies — operator-only for the sensitive list, allow-list the genuinely shared blobs; least schema churn. (B) promote sensitive namespaces to real tables with FK scoping + RLS; more work, permanently ends the kv-leak pattern.

### C2 — Crew can rewrite any column of their own staff row (incl. `rate`, `rtw`)
**Lens:** Security, Integrity · **Confidence:** confirmed
**Where:** `supabase/02_rls.sql:164-166` — `staff_crew_update_self` is a full-row UPDATE policy; RLS cannot restrict columns.
**What:** A crew JWT can set `rate` arbitrarily or self-mark `rtw='Verified'`, which clears the compliance gate (`opsData.ts:1110`) and feeds payroll (`opsData.ts:1150-1159`). The app UI never writes these fields, so it's invisible in-app but fully reachable via the API.
**Fixes:** (A) drop the crew UPDATE policy entirely — StaffHub self-service already writes only `mf_availability`/`mf_certs`; zero functional loss. **Recommended.** (B) column-level grants; fragile and easy to get wrong.

### C3 — No React error boundary anywhere
**Lens:** Reliability · **Confidence:** confirmed
**Where:** `src/main.tsx:5-9`, `src/App.tsx` (`{active.el}` unwrapped); grep for `ErrorBoundary|componentDidCatch` = nothing.
**What:** Any render-time throw in any page unmounts the entire app to a blank screen with no recovery. Given C-12/C-13-class unguarded paths below, this is when-not-if.
**Fixes:** class ErrorBoundary around `{active.el}` with a reload fallback (cheap, contains blast radius); optionally per-page boundaries later.

### C4 — Optimistic writes never rolled back on failure
**Lens:** Reliability · **Confidence:** confirmed
**Where:** `src/data/opsData.ts:317-325` (`save`), same pattern in `remove` (:345), `kvSet` (:381), `saveCert`, `setAvailability`, `savePipelineRow`, `saveMovementRow`, `saveTaskRow`.
**What:** The mirror is mutated and `emit()`ed before the network call; on error the phantom row stays until full reload. Combined with C5 the UI shows success for writes that never happened (RLS denial, offline, constraint).
**Fixes:** (A) snapshot + restore in catch, re-throw; simplest. (B) pending-state + realtime reconciliation; more robust, more work.

### C5 — Write rejections are swallowed app-wide
**Lens:** Reliability, QA · **Confidence:** confirmed
**Where:** every `onClick={() => data.save(...)}` handler; only `EventDocs.tsx:159,180` has any catch (the AI calls). E.g. `CommandCentre.tsx:312,322`, `StaffHub.tsx:46`, `Compliance.tsx:151,189`, `Finance.tsx:195,233`, `Timesheets.tsx:78-91`, `Logistics.tsx:91`.
**What:** Failed saves produce an unhandled rejection — no toast, no banner, no retry.
**Fixes:** a store-level write wrapper that surfaces failures via a global banner/toast + `unhandledrejection` listener as backstop.

---

## 🟠 Major

### M1 — Store never resets on sign-out; stale data crosses sessions
**Lens:** Security, Reliability · confirmed — `useOpsData.ts:17,29-33` (`loadStarted` module global), `useAccess.signOut` doesn't touch the store. A different user on the same tab sees the previous session's mirror; old realtime channel stays subscribed. **Fix:** `opsData.reset()` (clear db, remove channel, `loadStarted=false`) invoked on `SIGNED_OUT`.

### M2 — `mf_kv` / `mf_certs` / `mf_availability` have no realtime handlers
**Lens:** Integrity, Integration · confirmed — the tables are IN the publication (`02_rls.sql:251-262`) but `subscribeRealtime()` (`opsData.ts:182-211`) only wires `DB_TABLE` + pipeline/movements/tasks. Pins, Event Docs, diagnostics, cert uploads and availability never live-sync; also `kvSet` doesn't `markLocalWrite`, so adding the subscription without echo handling would double-apply. **Fix:** add the three postgres_changes handlers matching the pipeline pattern (+ echo marks for kv).

### M3 — No realtime disconnect/reconnect handling
Reliability · confirmed — `ch.subscribe()` with no status callback (`opsData.ts:211`); no offline indicator, no `removeChannel`. Users silently look at stale data on a dropped websocket. **Fix:** status callback → "reconnecting" banner; refetch on re-subscribe.

### M4 — kv whole-blob read-modify-write races (multi-device last-write-wins)
Reliability, Integrity · confirmed — `CommandCentre.tsx:120-130` (pins), `EventDocs.tsx:94-146` (incl. a stale-closure write after `await` at :117-124), `ImplementationPlan.tsx:75-76`, `ClientAccounts.tsx:112-116`, `ClientDiagnostic.tsx:223-224`. Two writers to different keys of one namespace clobber each other. **Fix:** re-read before write (cheap mitigation) → per-row tables or server-side JSONB merge (real fix).

### M5 — `moveToStock` is non-atomic and computes from a stale base
QA · confirmed — `StockOrdering.tsx:137-152`: `existing` captured once; duplicate ticked items lose increments; a mid-loop failure leaves half-moved state. **Fix:** coalesce by target line first; DB-side increment RPC for true concurrency safety.

### M6 — Clients can read staff `phone` and `rate` (PII / margin leak)
Security · confirmed — `02_rls.sql:155-157` `staff_client_read` returns full rows to client JWTs for their scope. **Fix:** restricted view for the portal (name/role only) or column grants.

### M7 — Crew set their own timesheet `hours`/`rate`; approval doesn't lock them
Security, Integrity · confirmed — `08_system_upgrade.sql:274-281` (crew write incl. those columns), `Timesheets.tsx:85-88` approve only stamps status, `timesheetHours` trusts explicit `hours` (`opsData.ts:437-443`). Padded rates flow to "paid" unless eyeballed. **Fix:** exclude `rate` from crew-writable (derive from staff row); on approve, recompute/clamp hours from clocks.

### M8 — "Crew need/gap" is computed three different ways and can disagree
Integrity, Integration · confirmed — (a) `home.ts:88-94` `staffingFor`-based; (b) `phase13.ts:96-109` `calloutFill` per-unit-gap-based; (c) `EventGantt.tsx:192-193` raw `unit.crew` sum, while its own allocation bars use (a). Also `StaffingTab.tsx:59` uses `unit.crew` per-unit next to a `staffingFor` header — for events with a manager `staffing` override the numbers don't reconcile on the same screen. **Fix:** one shared selector, override-aware, reused everywhere.

### M9 — `diagnostics`/`accounts` kv keyed by client NAME → orphaned on rename
Integrity · confirmed — `ClientDiagnostic.tsx:223`, `ClientAccounts.tsx:116`. Renaming a client silently detaches its diagnostic/account data (pins and unitDetails, keyed by id, survive). **Fix:** re-key by `client_id` with a one-time name→id migration.

### M10 — Weak `uid()` entropy + UPSERT = silent overwrite on collision
Integrity · confirmed — `opsData.ts:279-283` (~46k random space per ms) and `save()` uses `.upsert` so a collision clobbers an existing row instead of erroring. **Fix:** `crypto.randomUUID()` (keep prefix), and/or `insert` for new rows so collisions fail loudly.

### M11 — 4s echo-suppression can swallow a genuine remote edit
Integrity · suspected (mechanism confirmed, occurrence probabilistic) — `opsData.ts:57-68,272-274`; a remote change to the same row inside the window is consumed as "our echo" and dropped; a failed save still marks the id, suppressing the next real event. **Fix:** nonce/updated_by matching instead of timing.

### M12 — Command Centre re-implements the "needs action" feed
Integration · confirmed — `CommandCentre.tsx:81-95` vs `home.ts:132-188`: overlapping but different alert sets (Home has RTW; Command has DOCS/PAYROLL/COMPLIANCE), thresholds and ordering differ — two sources of truth. **Fix:** one shared alerts selector parameterised by client.

### M13 — Event Docs checklists aren't linked to real events and never feed readiness
Integration, Product · confirmed — `EventDocs.tsx:21-27,102-111` free-text `DocEvent` vs `mf_events`; the readiness documents section reads `eventOnboarding.docs` (`phase13.ts:229-242`), not these checklists. Operators will assume ticking docs makes the event ready; it doesn't. **Fix:** attach checklists to a real event id and feed status into `prepPanel`.

### M14 — Timeline Day/Week views can't look at past days
UX · confirmed — `EventGantt.tsx:74-76` builds days from today forward only (Month/Year can page back). Blocks post-event review/payroll disputes in the primary views. **Fix:** back-navigation or date picker on the day strip.

### M15 — `prepPanel` (heavy) runs un-memoized per item per render
Performance · confirmed — `Readiness.tsx:65`, `EventGantt.tsx:177`, `EventDashboard.tsx:52`; each call scans stock + assignments + per-staff certs; every store emit re-renders every card. Fine today, degrades with data volume. **Fix:** `useMemo` per event keyed on `updatedAt`; precompute a staff→RAG map per pass.

### M16 — Contrast failures in the dominant caption style + chart labels
A11y · confirmed — `--ink-3` (0.52 L, annotated "3:1 large-text only", `tokens.css:19`) is used at 8–10.5px across Gantt/Command/EventDocs (~3:1, needs 4.5:1); Gantt crew label is near-black on the dark 45%-mix breakdown segment (`EventGantt.tsx:223` vs `:55`). **Fix:** lighten `--ink-3` for small text or bump sizes; adaptive label colour.

### M17 — Load-bearing info in `title` tooltips + sub-24px hit targets
A11y · confirmed — phase timings, readiness state and double-booking warnings exist only in `title` attrs (13 sites in `EventGantt.tsx`, 7 in `CommandCentre.tsx`); invisible on touch/keyboard. Hit targets: 20-22px bars/cells/ticks (`console.css:245`, `EventGantt.tsx:203,390`), chip buttons. **Fix:** disclosure popovers or inline text for the warnings; min 24px targets.

### M18 — Key pages effectively desktop-only
UX/Mobile · confirmed — hard `minWidth` 720–940 behind scroll (Gantt, Command schedule), Command's two-column grids never stack (`CommandCentre.tsx:222,274`). The cockpit and timeline are unusable one-handed on site. **Fix:** media-query stacking; let bars reflow. (Effort L.)

---

## 🟡 Minor

1. **Crew can flip `overtime`/`area`/`unit_id` on their own assignment** — `02_rls.sql:182-184` full-row confirm policy (suspected exploit path; ×1.5 pay if payroll keys off it). Column-restrict or RPC.
2. **No DB CHECK constraints on money/stock numerics** — negative `qty/par/amount/unitPrice` possible (`Finance.tsx:230,270`, `StockOrdering.tsx:128`); `min=` is only an HTML hint. Add `check (>= 0)` + clamps.
3. **Malformed date strings silently classify certs as `ok`** — `opsData.ts:1120` NaN comparisons all false → an unparseable expiry passes compliance. Guard with `Number.isNaN(Date.parse(...))` → treat as missing. (Suspected in the wild, confirmed mechanism.)
4. **`shortlist` JSONB reduce can poison readiness with NaN** — `opsData.ts:1176` assumes every value is an array. `Array.isArray` guard.
5. **`useOpsSelector` is a latent infinite-loop trap and currently dead code** — `useOpsData.ts:50-54` fresh snapshot per call. Delete or cache by version.
6. **~27 `any` casts in the store layer** — `opsData.ts` (`'certs' as any` etc.), `Row = Record<string, any>`; typos compile clean. Type the mirror and widen echo-mark keys.
7. **Single global `updatedAt` invalidates every page memo on any write** — correct but coarse; fan-out grows with traffic (`opsData.ts:176-179`). Per-table versions later.
8. **TopBar "More" menu: no Esc-to-close, no focus return, no menu roles** — `TopBar.tsx:76-94`.
9. **Expandable panels don't manage focus/aria-expanded** — Calendar itinerary, Gantt collapse, EventDocs view switch.
10. **`role="button"` divs handle Enter but not Space** — Calendar/Gantt bars and cells.
11. **Load-error text exposes setup internals to end users** — `Home.tsx:62-63` ("Check your Supabase keys in .env…"). Generic message for non-owners.
12. **Print stylesheet only covers Logistics** — `theme.css:36-56`; Event Docs has a Print button whose output is broken neon-on-dark.
13. **Supabase client silently falls back to `http://localhost`** when env is missing (`lib/supabase.ts:16-20`) — confusing network errors instead of one clear config screen.
14. **Primary nav crowding** — 10-11 primary tabs + 11-item More; overflow scrolls with hidden scrollbar (`home.css:232-240`), no affordance.
15. **Three overlapping schedule surfaces** (Timeline page, Command season strip, Calendar) with no stated hierarchy — trust/maintenance cost.
16. **`approved_by uuid` has no FK to `auth.users`** (`08:159`); Command Centre micro-empties don't guide a zero-data vendor; Gantt "now" line label not announced; EventDocs `N/A` selected-state contrast; Gantt collapse button lacks `aria-expanded`.

---

## 🔵 Enhancements (ranked by payoff-to-effort)

| # | Idea | Problem it solves | Effort |
|---|---|---|---|
| E1 | **Store hardening test-pack** — tests for realtime patch, echo suppression, rollback, kv races (the highest-risk code has zero coverage today) | Regressions in the most stateful layer | S-M |
| E2 | **Audit trail** (who/what/when on writes; `updated_by` column + history) | Shift-confirmation and payroll disputes | M |
| E3 | **Proactive reminders** — certs/docs expiring, callouts open, unconfirmed shifts at T-7 | Everything is pull-based today (see M2/M13) | M |
| E4 | **Invoice PDF + VAT + deposits** | Money is display-only; UK VAT + festival deposit/balance flows are unmodelled | M |
| E5 | **Data export** — CSV/JSON for events, crew, finance, timesheets | Operators can't hand data to accountant/payroll | S |
| E6 | **Link Event Docs → real events → readiness gate** (fixes M13 as a feature) | One compliance truth | M |
| E7 | **Timesheet approver queue** — named approver, one-screen approve flow | "N to approve" is a count, not a workflow | S |
| E8 | **Multi-currency** (currency field + formatter) | Hard-coded £ blocks non-UK ops | M |
| E9 | **Weather on events/readiness** | Outdoor ops with no environmental signal | M |
| E10 | **Kv → real tables migration** (accounts, diagnostics, pins, eventDocs) | Ends C1/M4/M9 class permanently | L |
| E11 | **Crew shortfall prediction** — flag events trending under-crewed vs T-minus | Reactive-only staffing today | M |
| E12 | **Operator scorecard** — per-vendor season KPIs (fill rate, margin, compliance %) | No comparative view across operators | M |
| E13 | **Fine-grained store subscriptions** (per-table versions) | M15/M7 perf class at scale | L |

---

## Verified non-issues
- Migration order is sound on a fresh DB; `04_auth_setup.sql` is documentation-only; 08's legacy reconciliation is fully guarded (no-op when clean).
- No secrets in git; anon-key-only client (correct posture — which is exactly why the RLS findings are the ones that matter).
- Route guard correctly redirects disallowed roles; removed `#/overview` falls through safely.
- `role="button"` elements are keyboard-reachable (Enter); responsive nav CSS exists (scroll style aside).
- `useSyncExternalStore` subscription in `useOpsData` unsubscribes correctly.

*Phase 1 complete. Phases 2-4 (quiz → approved fixes → invention backlog) not started — no code was changed for this report.*
