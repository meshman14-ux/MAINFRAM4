-- ============================================================
--  MAINFRAME — Phase 16 migration: Combined build deltas
--  ADDITIVE / idempotent — safe to run on a live database.
--  Run AFTER 01..11 (see RUN_ALL.md).
-- ------------------------------------------------------------
--  Adds:
--    - mf_pal_branches        PAL branch directory
--    - mf_units.branch_id     unit → branch association (nullable)
--    - analyze_unit_ai(text)  RPC alias of analyze_unit() that also
--                             includes the unit's PAL branch
--  Everything else in the combined spec (mf_tasks,
--  mf_unit_checklists, mf_unit_insights, mf_widget_layouts,
--  mf_events.category/priority, timeline RPCs) already landed in
--  migrations 10 and 11.
-- ============================================================

-- ---------- mf_pal_branches ----------
create table if not exists mf_pal_branches (
  id         text primary key,
  name       text not null,
  region     text,
  notes      text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

drop trigger if exists mf_pal_branches_touch on mf_pal_branches;
create trigger mf_pal_branches_touch before update on mf_pal_branches
  for each row execute function mf_touch_updated_at();

-- ---------- mf_units.branch_id ----------
alter table mf_units add column if not exists branch_id text references mf_pal_branches(id) on delete set null;
create index if not exists mf_units_branch_idx on mf_units(branch_id);

-- ---------- RLS ----------
alter table mf_pal_branches enable row level security;

-- operators: full access; crew: read (branch names are not sensitive and
-- appear on unit dashboards crew can open).
drop policy if exists pal_branches_operator_all on mf_pal_branches;
create policy pal_branches_operator_all on mf_pal_branches
  for all using (mf_is_operator()) with check (mf_is_operator());

drop policy if exists pal_branches_crew_read on mf_pal_branches;
create policy pal_branches_crew_read on mf_pal_branches
  for select using (mf_staff_id() is not null);

-- ---------- realtime ----------
do $$
begin
  begin execute 'alter publication supabase_realtime add table mf_pal_branches';
  exception when duplicate_object then null; end;
end $$;

-- ============================================================
--  analyze_unit_ai(p_unit_id) — the combined-spec name for the
--  server-side context assembler. Wraps analyze_unit() (from
--  migration 11) and adds the unit's PAL branch. SECURITY
--  INVOKER so the caller's RLS applies.
-- ============================================================
create or replace function analyze_unit_ai(p_unit_id text)
returns jsonb language sql stable security invoker as $$
  select analyze_unit(p_unit_id) || jsonb_build_object(
    'branch', (
      select to_jsonb(b) from mf_pal_branches b
      where b.id = (select branch_id from mf_units where id = p_unit_id)
    )
  );
$$;
