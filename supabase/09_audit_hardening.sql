-- ============================================================
--  MAINFRAME — Phase 13 migration: Audit hardening
--  ADDITIVE / idempotent — safe to run on a live database.
--  Run AFTER 01..08 (see RUN_ALL.md).
-- ------------------------------------------------------------
--  Closes the authorization holes found in the system audit:
--    C1  mf_kv was readable by ANY authenticated user — every kv
--        namespace (pins, eventDocs, diagnostics, accounts,
--        implplan, unitDetails) is operator business data, so
--        reads are now operator-only. (No crew/client page reads
--        kv, so this is a pure tightening.)
--    C2  crew could UPDATE any column of their own mf_staff row
--        (incl. rate, rtw='Verified') via the API — policy removed.
--        Crew self-service writes only mf_availability / mf_certs.
--    M6  clients could read staff phone + rate — base-table client
--        read removed; a name/role-only view is provided instead.
--    M7  crew could set their own timesheet rate — a trigger now
--        forces the staff-record rate for any non-operator writer,
--        so a padded rate cannot reach payroll.
-- ============================================================

-- ---------- C1: mf_kv reads become operator-only ----------
drop policy if exists kv_authed_read on mf_kv;
drop policy if exists kv_operator_read on mf_kv;
create policy kv_operator_read on mf_kv
  for select using (mf_is_operator());
-- (kv_operator_all from 02_rls.sql still governs writes.)

-- ---------- C2: remove crew full-row update on mf_staff ----------
-- RLS can't restrict columns, so a self-update policy = a rate/RTW
-- self-edit hole. Crew keep SELECT of their own row (staff_crew_self);
-- their real self-service lives in mf_availability / mf_certs.
drop policy if exists staff_crew_update_self on mf_staff;

-- ---------- M6: clients see staff names/roles only ----------
-- Remove the full-row client read from the base table…
drop policy if exists staff_client_read on mf_staff;
-- …and expose a safe, scope-filtered projection (no phone, no rate).
-- security_invoker=off so the view owner's rights apply, but the view
-- both drops sensitive columns AND filters to the caller's client
-- scope via mf_scope_client(), so a client only sees their own crew.
drop view if exists mf_staff_client;
create view mf_staff_client with (security_invoker = off) as
  select id, name, role, client_id
  from mf_staff
  where client_id = mf_scope_client();
-- Grant to the authenticated role when it exists (always true on Supabase;
-- guarded so the migration also runs before role creation in test harnesses).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on mf_staff_client to authenticated;
  end if;
end $$;

-- ---------- M7: lock timesheet rate for non-operators ----------
create or replace function mf_timesheets_lock_rate() returns trigger
language plpgsql security definer as $$
begin
  -- Operators may set an explicit per-sheet rate; everyone else's
  -- rate is forced to the staff record so crew can't pad their pay.
  if not mf_is_operator() then
    new.rate := (select rate from mf_staff where id = new.staff_id);
  end if;
  return new;
end $$;

drop trigger if exists mf_timesheets_rate_lock on mf_timesheets;
create trigger mf_timesheets_rate_lock
  before insert or update on mf_timesheets
  for each row execute function mf_timesheets_lock_rate();
