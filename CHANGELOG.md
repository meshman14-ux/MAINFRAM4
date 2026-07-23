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

_Tests: RLS suite 29 → 34; full suite 207 → 212. Build clean._
