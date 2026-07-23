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

-- ============================================================
--  Legacy reconciliation — an earlier mf_addons.sql drop created
--  some of these tables with older shapes (vehicles with type/
--  can_tow and no name; invoices with subtotal/total and no lines;
--  expenses without client_id; documents keyed by entity_type).
--  Add the columns the app expects, backfill from the old ones,
--  and relax legacy NOT NULLs so app inserts succeed. Every
--  statement is a no-op on a fresh database.
-- ============================================================

alter table if exists mf_vehicles add column if not exists name text;
alter table if exists mf_vehicles add column if not exists vtype text default 'Van';
alter table if exists mf_vehicles add column if not exists tow_capable boolean default false;
alter table if exists mf_vehicles add column if not exists updated_at timestamptz default now();

alter table if exists mf_invoices add column if not exists issue_date date;
alter table if exists mf_invoices add column if not exists due_date date;
alter table if exists mf_invoices add column if not exists lines jsonb default '[]'::jsonb;
alter table if exists mf_invoices add column if not exists updated_at timestamptz default now();

alter table if exists mf_expenses add column if not exists client_id text;
alter table if exists mf_expenses add column if not exists exp_date date;
alter table if exists mf_expenses add column if not exists descr text;
alter table if exists mf_expenses add column if not exists updated_at timestamptz default now();

alter table if exists mf_documents add column if not exists client_id text;
alter table if exists mf_documents add column if not exists unit_id text;
alter table if exists mf_documents add column if not exists staff_id text;
alter table if exists mf_documents add column if not exists title text;
alter table if exists mf_documents add column if not exists doc_type text default 'General';
alter table if exists mf_documents add column if not exists url text;
alter table if exists mf_documents add column if not exists notes text;
alter table if exists mf_documents add column if not exists updated_at timestamptz default now();

-- Backfill new columns from legacy ones and drop legacy NOT NULLs.
-- Guarded per column so it runs on any mix of old/new shapes.
do $$
  -- true when the table has this column (legacy shapes vary)
  declare
    function_note text := 'reconcile legacy add-on shapes';
  begin
    -- vehicles: type -> vtype, can_tow -> tow_capable, name from reg
    if to_regclass('mf_vehicles') is not null then
      if exists (select 1 from information_schema.columns where table_name='mf_vehicles' and column_name='type') then
        update mf_vehicles set vtype = type where type is not null;
        alter table mf_vehicles alter column type drop not null;
      end if;
      if exists (select 1 from information_schema.columns where table_name='mf_vehicles' and column_name='can_tow') then
        update mf_vehicles set tow_capable = coalesce(can_tow, false);
      end if;
      update mf_vehicles set name = coalesce(name, reg, id) where name is null;
    end if;

    -- invoices: issued_on/due_on -> issue_date/due_date; synthesise a
    -- single line from the legacy total so old invoices keep their value
    if to_regclass('mf_invoices') is not null then
      if exists (select 1 from information_schema.columns where table_name='mf_invoices' and column_name='issued_on') then
        update mf_invoices set issue_date = issued_on::date where issue_date is null and issued_on is not null;
      end if;
      if exists (select 1 from information_schema.columns where table_name='mf_invoices' and column_name='due_on') then
        update mf_invoices set due_date = due_on::date where due_date is null and due_on is not null;
      end if;
      if exists (select 1 from information_schema.columns where table_name='mf_invoices' and column_name='total') then
        update mf_invoices
          set lines = jsonb_build_array(jsonb_build_object('desc', 'Invoice total', 'qty', 1, 'unitPrice', total))
          where (lines is null or lines = '[]'::jsonb) and total is not null and total <> 0;
      end if;
      -- legacy money/kind columns must not block app inserts
      perform 1;
      begin alter table mf_invoices alter column kind drop not null;     exception when undefined_column then null; end;
      begin alter table mf_invoices alter column subtotal drop not null; exception when undefined_column then null; end;
      begin alter table mf_invoices alter column tax drop not null;      exception when undefined_column then null; end;
      begin alter table mf_invoices alter column total drop not null;    exception when undefined_column then null; end;
      begin alter table mf_invoices alter column currency drop not null; exception when undefined_column then null; end;
    end if;

    -- expenses: description -> descr, incurred_on -> exp_date,
    -- client_id derived from the expense's event
    if to_regclass('mf_expenses') is not null then
      if exists (select 1 from information_schema.columns where table_name='mf_expenses' and column_name='description') then
        update mf_expenses set descr = description where descr is null and description is not null;
        alter table mf_expenses alter column description drop not null;
      end if;
      if exists (select 1 from information_schema.columns where table_name='mf_expenses' and column_name='incurred_on') then
        update mf_expenses set exp_date = incurred_on::date where exp_date is null and incurred_on is not null;
        begin alter table mf_expenses alter column incurred_on drop not null; exception when undefined_column then null; end;
      end if;
      update mf_expenses e set client_id = ev.client_id
        from mf_events ev where e.client_id is null and e.event_id = ev.id;
    end if;

    -- documents: name -> title; entity_* keys must not block app inserts
    if to_regclass('mf_documents') is not null then
      if exists (select 1 from information_schema.columns where table_name='mf_documents' and column_name='name') then
        update mf_documents set title = name where title is null and name is not null;
        begin alter table mf_documents alter column name drop not null; exception when undefined_column then null; end;
      end if;
      begin alter table mf_documents alter column entity_type drop not null; exception when undefined_column then null; end;
      begin alter table mf_documents alter column entity_id drop not null;   exception when undefined_column then null; end;
      begin alter table mf_documents alter column kind drop not null;        exception when undefined_column then null; end;
      update mf_documents set title = coalesce(title, 'Untitled document') where title is null;
    end if;
  end $$;

-- Old SQL drops may have attached their own policies to these tables —
-- clear them all so the policy set below is the whole truth.
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('mf_timesheets','mf_vehicles','mf_invoices','mf_expenses','mf_documents','mf_shopping_lists')
  loop
    execute format('drop policy %I on %I', p.policyname, p.tablename);
  end loop;
end $$;

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
