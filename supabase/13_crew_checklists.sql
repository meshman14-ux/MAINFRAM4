-- ============================================================
--  MAINFRAME — Phase 17 migration: crew tick their own checklists
--  ADDITIVE / idempotent — safe to run on a live database.
--  Run AFTER 11 (mf_unit_checklists must exist).
-- ------------------------------------------------------------
--  Quiz decision Q5: on site it's crew doing the physical checks,
--  so crew may UPDATE checklist rows for units they are assigned
--  to (tick/untick items). INSERT and DELETE stay operator-only —
--  operators control what is ON a list (seeding, adding, removing
--  items happens before the crew arrives, or by an operator).
-- ============================================================

drop policy if exists unit_checklists_crew_update on mf_unit_checklists;
create policy unit_checklists_crew_update on mf_unit_checklists
  for update using (
    unit_id in (select unit_id from mf_assignments where staff_id = mf_staff_id())
  )
  with check (
    unit_id in (select unit_id from mf_assignments where staff_id = mf_staff_id())
  );
