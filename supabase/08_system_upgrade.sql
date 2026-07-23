-- ============================================================
--  MAINFRAME — Phase 12 migration: System Upgrade
--  ADDITIVE — safe to run on a live production database.
--  Run AFTER 01/02/03/05/06/07, in order (see RUN_ALL.md).
-- ------------------------------------------------------------
--  Adds the commercial + fleet + document layer:
--    - mf_staff.staff_no      crew payroll/badge number
--    - mf_stock.category      stock categorisation (Drink/Food/…)
--    - mf_vehicles            the fleet (vans, trucks, trailers)
--    - mf_invoices            client invoices, line items as jsonb
--                             (matches the mf_events jsonb pattern:
--                             schedule/shortlist live on the row, so
--                             invoice lines do too — one table, one
--                             realtime patch, no join bookkeeping)
--    - mf_expenses            event/operator expenses for P&L
--    - mf_documents           compliance & ops document register
--                             with expiry dates (Information Hub)
--    - mf_shopping_lists      per-unit purchasing checklist
--  All operator-only (same pattern as Pipeline / Logistics / Tasks):
--  these are the business's commercial records, not crew/client data.
-- ============================================================

alter table mf_staff add column if not exists staff_no text;
alter table mf_stock add column if not exists category text;

-- ---------- timesheets (phase 11 shipped app-side without its SQL — fixed here) ----------
create table if not exists mf_timesheets (
  id            text primary key,
  event_id      text references mf_events(id) on delete cascade,
  unit_id       text references mf_units(id) on delete set null,
  staff_id      text references mf_staff(id) on delete cascade,
  assignment_id text references mf_assignments(id) on delete set null,
  work_date     date not null,
  clock_in      timestamptz,
  clock_out     timestamptz,
  break_mins    integer,
  hours         numeric,
  rate          numeric,
  overtime      boolean default false,
  status        text not null default 'draft', -- draft|submitted|approved|paid
  approved_by   uuid,
  notes         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists mf_timesheets_event_idx on mf_timesheets(event_id);
create index if not exists mf_timesheets_staff_idx on mf_timesheets(staff_id);

-- ---------- fleet ----------
create table if not exists mf_vehicles (
  id           text primary key,
  client_id    text references mf_clients(id) on delete cascade,
  name         text not null,
  reg          text,
  vtype        text not null default 'Van',   -- Van|Truck|Car|Trailer
  tow_capable  boolean default false,
  notes        text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
create index if not exists mf_vehicles_client_idx on mf_vehicles(client_id);

-- ---------- invoices (lines as jsonb: [{desc, qty, unitPrice}]) ----------
create table if not exists mf_invoices (
  id           text primary key,
  client_id    text references mf_clients(id) on delete cascade,
  event_id     text references mf_events(id) on delete set null,
  number       text,
  issue_date   date,
  due_date     date,
  status       text not null default 'draft', -- draft|sent|paid|overdue
  lines        jsonb default '[]'::jsonb,
  notes        text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
create index if not exists mf_invoices_client_idx on mf_invoices(client_id);
create index if not exists mf_invoices_event_idx  on mf_invoices(event_id);

-- ---------- expenses ----------
create table if not exists mf_expenses (
  id           text primary key,
  client_id    text references mf_clients(id) on delete cascade,
  event_id     text references mf_events(id) on delete set null,
  exp_date     date,
  category     text not null default 'General', -- Stock|Fuel|Hire|Repairs|Wages|General
  descr        text,
  amount       numeric default 0,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
create index if not exists mf_expenses_client_idx on mf_expenses(client_id);
create index if not exists mf_expenses_event_idx  on mf_expenses(event_id);

-- ---------- document register (Information Hub) ----------
create table if not exists mf_documents (
  id           text primary key,
  client_id    text references mf_clients(id) on delete cascade,
  unit_id      text references mf_units(id) on delete set null,
  staff_id     text references mf_staff(id) on delete set null,
  title        text not null,
  doc_type     text not null default 'General', -- Insurance|Licence|Hygiene|Safety|RAMS|General
  expiry       date,
  url          text,
  notes        text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
create index if not exists mf_documents_client_idx on mf_documents(client_id);
create index if not exists mf_documents_unit_idx   on mf_documents(unit_id);
create index if not exists mf_documents_expiry_idx on mf_documents(expiry);

-- ---------- per-unit shopping / purchasing checklist ----------
create table if not exists mf_shopping_lists (
  id           text primary key,
  unit_id      text references mf_units(id) on delete cascade,
  item         text not null,
  qty          numeric default 1,
  unit         text,
  category     text,
  done         boolean default false,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
create index if not exists mf_shopping_lists_unit_idx on mf_shopping_lists(unit_id);

-- ---------- touch triggers ----------
do $$
declare t text;
begin
  foreach t in array array['mf_timesheets','mf_vehicles','mf_invoices','mf_expenses','mf_documents','mf_shopping_lists'] loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format('create trigger %I_touch before update on %I for each row execute function mf_touch_updated_at()', t, t);
  end loop;
end $$;

-- ---------- RLS: operator only ----------
do $$
declare t text;
begin
  foreach t in array array['mf_timesheets','mf_vehicles','mf_invoices','mf_expenses','mf_documents','mf_shopping_lists'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_operator_all on %I', t, t);
    execute format('create policy %I_operator_all on %I for all using (mf_is_operator()) with check (mf_is_operator())', t, t);
  end loop;
end $$;

-- ---------- timesheets: crew self-service ----------
-- Crew read their own sheets and can create/edit them while still
-- draft/submitted (clock in/out from Staff Hub). Approving and paying
-- stay operator actions — the with-check blocks self-approval.
drop policy if exists timesheets_crew_read on mf_timesheets;
create policy timesheets_crew_read on mf_timesheets
  for select using (staff_id = mf_staff_id());

drop policy if exists timesheets_crew_insert on mf_timesheets;
create policy timesheets_crew_insert on mf_timesheets
  for insert with check (staff_id = mf_staff_id() and status in ('draft','submitted'));

drop policy if exists timesheets_crew_update on mf_timesheets;
create policy timesheets_crew_update on mf_timesheets
  for update using (staff_id = mf_staff_id() and status in ('draft','submitted'))
  with check (staff_id = mf_staff_id() and status in ('draft','submitted'));

-- ---------- realtime ----------
do $$
declare t text;
begin
  foreach t in array array['mf_timesheets','mf_vehicles','mf_invoices','mf_expenses','mf_documents','mf_shopping_lists'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
