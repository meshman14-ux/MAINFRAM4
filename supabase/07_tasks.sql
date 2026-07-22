-- ============================================================
--  MAINFRAME — Phase 10 migration: Event Tasks
--  ADDITIVE — safe to run on a live production database.
--  Run AFTER 01/02/03/05/06, in order.
-- ------------------------------------------------------------
--  From user feedback (not a prototype port): a per-event task
--  list so an operator can organise "my timetable" across events,
--  colour-coded by category, sortable by due date. Deliberately
--  operator-only for now — a crew-facing "my tasks" view (via
--  assigned_to) is a natural follow-on for Staff Hub, not built
--  yet.
-- ============================================================

create table if not exists mf_event_tasks (
  id           text primary key,
  event_id     text references mf_events(id) on delete cascade,
  title        text not null,
  category     text not null default 'General',  -- Prep|Crew|Stock|Compliance|Client|General
  done         boolean default false,
  due_date     date,
  assigned_to  text references mf_staff(id) on delete set null,
  notes        text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
create index if not exists mf_event_tasks_event_idx on mf_event_tasks(event_id);
create index if not exists mf_event_tasks_due_idx   on mf_event_tasks(due_date);

drop trigger if exists mf_event_tasks_touch on mf_event_tasks;
create trigger mf_event_tasks_touch before update on mf_event_tasks
  for each row execute function mf_touch_updated_at();

-- ---------- RLS: operator only (same pattern as Pipeline / Logistics) ----------
alter table mf_event_tasks enable row level security;

drop policy if exists tasks_operator_all on mf_event_tasks;
create policy tasks_operator_all on mf_event_tasks
  for all using (mf_is_operator()) with check (mf_is_operator());

-- ---------- realtime ----------
do $$
begin
  execute 'alter publication supabase_realtime add table mf_event_tasks;';
exception when duplicate_object then null;
end $$;
