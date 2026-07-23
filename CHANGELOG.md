# Changelog

Post-audit fix pass (Phase 3). Scope approved: the 5 critical findings plus
the security/data-integrity majors from `AUDIT_REPORT.md`. Each entry notes
the finding id it closes.

## Unreleased

### Security / database (migration `supabase/09_audit_hardening.sql` — run it after 08)
- **C1** — `mf_kv` was readable by every authenticated user (all operator
  namespaces: pins, eventDocs, diagnostics, accounts, implplan, unitDetails).
  Reads are now operator-only. No crew/client page reads kv, so this is a pure
  tightening. Covered by a new RLS test.
- **C2** — crew could UPDATE any column of their own `mf_staff` row via the API
  (including `rate` and `rtw='Verified'`, bypassing the compliance gate). The
  crew self-update policy is removed; crew keep read of their own row and
  self-service via `mf_availability` / `mf_certs`. RLS test asserts a crew
  self-edit now touches zero rows.
- **M6** — clients could read staff `phone` and `rate`. The client base-table
  read is removed and replaced with a scope-filtered `mf_staff_client` view
  exposing name/role/id only. RLS test confirms no phone/rate columns.
- **M7** — crew could set their own timesheet `rate`. A `before insert/update`
  trigger now forces the staff-record rate for any non-operator writer;
  operators may still set an explicit per-sheet rate. Two RLS tests cover both
  paths.

### Reliability (app + store)
- **C3** — added a React `ErrorBoundary` around the active route (+ a per-route
  key so navigating clears a prior error). A render-time throw in one page now
  shows a recoverable fallback instead of blanking the whole app.
- **C4** — every store write (`save`, `remove`, `kvSet`, `saveCert`,
  `removeCert`, `setAvailability`, pipeline/movement/task save+remove) now
  snapshots the mirror and rolls it back if the Supabase call fails, so the UI
  can no longer show a phantom "saved" row that never persisted.
- **C5** — failed writes are reported through a new store error channel and a
  `WriteErrorToast`; a `window.unhandledrejection` listener backstops stray
  rejections. No more silent data-loss.

### Store lifecycle
- **M1** — `opsData.reset()` (clears the mirror, tears down the realtime
  channel, re-arms load) now runs on `SIGNED_OUT`; the load-once guard moved
  from a module global onto the store so the next session reloads clean. Fixes
  stale data crossing sign-out/sign-in on the same tab.
- **M2** — realtime handlers added for `mf_kv`, `mf_certs`, `mf_availability`
  (they were in the publication but never subscribed). Pins, Event Docs,
  diagnostics, cert uploads and availability now sync live across devices.
- **M10** — `uid()` now uses `crypto.randomUUID()` (keeping the readable table
  prefix); the old ~46k-per-ms random space could birthday-collide and `save()`
  upserts, so a collision would have silently overwritten a row.

_Tests: RLS suite 29 → 34; new store-hardening suite (+7: rollback, reset,
uid); full suite 207 → 219. Build clean._
