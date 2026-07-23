# Supabase migration run order

Run each file in the Supabase SQL editor, in this order. Every file is
idempotent (`if not exists` / `drop policy if exists`), so re-running a file
you have already run is safe.

| # | File | What it adds | Already run? |
|---|------|--------------|--------------|
| 1 | `01_schema.sql` | Core tables (clients, events, units, staff, assignments, stock, applications, kv) + helpers | ✅ (existing installs) |
| 2 | `02_rls.sql` | Row-level security for the core tables | ✅ |
| 3 | `03_seed.sql` | Demo seed data (optional on a fresh DB) | ✅ |
| 4 | `04_auth_setup.sql` | `mf_access` roles + auth wiring | ✅ |
| 5 | `05_addons_clientaccounts.sql` | Client-accounts kv policies | ✅ |
| 6 | `05_pipeline.sql` | `mf_pipeline` (sales CRM) | ✅ |
| 7 | `06_logistics.sql` | `mf_movements` (vehicle/driver movements) | ✅ |
| 8 | `07_tasks.sql` | `mf_event_tasks` (per-event tasks) | ✅ |
| 9 | `08_system_upgrade.sql` | `mf_timesheets` (was missing its migration), `staff_no`, stock `category`, `mf_vehicles`, `mf_invoices`, `mf_expenses`, `mf_documents`, `mf_shopping_lists` (+ RLS + realtime for all) | ⬜ run this |
| 10 | `09_audit_hardening.sql` | security fixes from the audit: `mf_kv` reads operator-only, remove crew `mf_staff` self-update, `mf_staff_client` name/role view for clients, timesheet-rate lock trigger | ⬜ run this |
| 11 | `10_timeline.sql` | Triple Timeline: `mf_events.category`/`.priority` columns, `mf_widget_layouts` (per-user layout prefs) + RLS + realtime, and the year/month/day/overlap/sort/filter RPCs | ⬜ run this |
| 12 | `11_unit_ai.sql` | **NEW** — Unit Dashboard + AI: `mf_tasks`, `mf_unit_checklists`, `mf_unit_insights` (+ RLS: operator all, crew read own units; + realtime) and the `analyze_unit(text)` context RPC | ⬜ run this |

After running a migration, no app redeploy is needed — the running app picks
the new tables up on next load.
