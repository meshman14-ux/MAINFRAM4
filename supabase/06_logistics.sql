-- ============================================================
--  MAINFRAME — Phase 9 migration: Logistics (movements)
--  ADDITIVE — safe to run on a live production database.
--  Run AFTER 01/02/03/05, in order.
-- ------------------------------------------------------------
--  Ported from the original Logistics.dc.html prototype: one row
--  per planned vehicle/trailer movement for an event — who's
--  driving, what they're towing (if anything), when they depart,
--  and a status that cycles planned -> en-route -> on-site ->
--  returned. unit_id is nullable: null means "support van, no
--  trailer" (the prototype's '__van' sentinel).
-- ============================================================

create table if not exists mf_movements (
  id           text primary key,
  event_id     text references mf_events(id) on delete cascade,
  unit_id      text references mf_units(id)  on delete set null,  -- null = support van, no trailer
  driver_id    text references mf_staff(id)  on delete cascade,
  depart_date  date,
  depart_time  text,                             -- '08:00', kept as text like mf_events.call_time
  tow          boolean default false,             -- true when unit_id is a real towed unit
  status       text not null default 'planned',   -- planned|en-route|on-site|returned
  created_at   timestamptz default now()
);
create index if not exists mf_movements_event_idx  on mf_movements(event_id);
create index if not exists mf_movements_driver_idx on mf_movements(driver_id);

-- ---------- RLS: operator only, same as Pipeline ----------
-- Logistics is an internal ops-planning tool; crew and clients have no
-- need to see or edit vehicle/driver movement plans directly.
alter table mf_movements enable row level security;

drop policy if exists movements_operator_all on mf_movements;
create policy movements_operator_all on mf_movements
  for all using (mf_is_operator()) with check (mf_is_operator());

-- ---------- realtime ----------
do $$
begin
  execute 'alter publication supabase_realtime add table mf_movements;';
exception when duplicate_object then null;
end $$;
