-- ============================================================
--  MAINFRAME / OPSDECK — Supabase schema (Postgres)
--  Run once in Supabase → SQL Editor.
--
--  Mirrors the exact shapes in opsdeck-data.js:
--    clients, events, units, staff, assignments, stock, applications
--  Every row keeps its stable string id (e.g. 'C001', 'E001') as the
--  primary key, so the migration from localStorage is a storage swap,
--  not a reshape. Nested arrays/objects (schedule, unitIds, staffing,
--  shortlist, pool, skills) are stored as jsonb columns.
--
--  Order matters: parents before children (foreign keys).
-- ============================================================

-- ---------- clients ----------
create table if not exists mf_clients (
  id       text primary key,
  name     text not null,
  contact  text,
  phone    text,
  email    text,
  status   text default 'Active',           -- Active | Lead | ...
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- events ----------
create table if not exists mf_events (
  id         text primary key,
  client_id  text references mf_clients(id) on delete cascade,
  name       text not null,
  loc        text,
  start      date,
  "end"      date,
  call_time  text,                          -- '07:00' — kept as text like the prototype
  notes      text,
  unit_ids   jsonb,                          -- optional explicit fleet for this event
  staffing   jsonb,                          -- optional manager override: { Bar:3, Coffee:2, ... }
  schedule   jsonb default '[]'::jsonb,      -- day-by-day phases
  shortlist  jsonb default '{}'::jsonb,      -- { unitId: [staffId, ...] }
  callout    jsonb,                           -- job-board callout state: { open, message, sentAt }
  event_onboarding jsonb,                     -- { ready, ...manual step flags }
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists mf_events_client_idx on mf_events(client_id);

-- ---------- units ----------
create table if not exists mf_units (
  id         text primary key,
  client_id  text references mf_clients(id) on delete cascade,
  type       text,                           -- Bar | Coffee | Food | Catering | Support
  code       text,                           -- BAR-01
  name       text,
  "desc"     text,                            -- free-text description
  crew       int default 0,                  -- target headcount per unit
  pool       jsonb default '[]'::jsonb,      -- standing pool of staff ids who CAN work it
  checklist  jsonb default '[]'::jsonb,      -- load-out items: {id, cat, item, on}
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists mf_units_client_idx on mf_units(client_id);

-- ---------- staff ----------
create table if not exists mf_staff (
  id         text primary key,
  client_id  text references mf_clients(id) on delete cascade,
  name       text not null,
  role       text,
  phone      text,
  rate       numeric,
  rtw        text default 'Pending',         -- Verified | Pending | ...
  can_tow    boolean default false,
  skills     jsonb,                           -- optional explicit skill list; else derived from role
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists mf_staff_client_idx on mf_staff(client_id);

-- ---------- assignments (staff -> unit @ event) ----------
-- A gap is simply the ABSENCE of a row for a needed slot.
create table if not exists mf_assignments (
  id         text primary key,
  event_id   text references mf_events(id) on delete cascade,
  unit_id    text references mf_units(id)  on delete cascade,
  staff_id   text references mf_staff(id)  on delete cascade,
  area       text,                             -- Bar | Coffee | Food | General | ...
  confirmed  boolean default false,
  overtime   boolean default false,
  created_at timestamptz default now()
);
create index if not exists mf_assign_event_idx on mf_assignments(event_id);
create index if not exists mf_assign_staff_idx on mf_assignments(staff_id);
create index if not exists mf_assign_unit_idx  on mf_assignments(unit_id);

-- ---------- stock (per unit) ----------
create table if not exists mf_stock (
  id       text primary key,
  unit_id  text references mf_units(id) on delete cascade,
  item     text not null,
  qty      numeric default 0,
  par      numeric default 0,
  unit     text,                             -- kegs | kg | ea | ...
  updated_at timestamptz default now()
);
create index if not exists mf_stock_unit_idx on mf_stock(unit_id);

-- ---------- applications (job callouts) ----------
create table if not exists mf_applications (
  id            text primary key,
  event_id      text references mf_events(id) on delete cascade,
  unit_id       text references mf_units(id)  on delete set null,
  staff_id      text references mf_staff(id)  on delete cascade,
  area          text,                          -- area applied for
  status        text default 'applied',        -- applied | approved | declined
  overtime      boolean default false,
  assignment_id text,                           -- set when approved -> creates assignment
  created_at    timestamptz default now()
);
create index if not exists mf_app_event_idx on mf_applications(event_id);

-- ---------- kv: namespaced key-value store ----------
-- Holds diagnostics, crm, accounts, advisor, finance, eventDocs, etc.
-- Blueprint §07: keyed by ns alone (global blobs).
-- NOTE: staffCerts and availability have been PROMOTED to real tables
-- below (mf_certs, mf_availability) so they can be RLS-scoped per crew
-- member and written without rewriting a shared blob.
create table if not exists mf_kv (
  ns         text primary key,                 -- 'finance', 'crm', 'diagnostics', ...
  data       jsonb,
  updated_at timestamptz default now()
);

-- ---------- certs (promoted from kv 'staffCerts') ----------
create table if not exists mf_certs (
  id         text primary key,
  staff_id   text references mf_staff(id) on delete cascade,
  type       text not null,                    -- 'Personal Licence', 'Food Hygiene L2', ...
  expiry     date,
  created_at timestamptz default now()
);
create index if not exists mf_certs_staff_idx on mf_certs(staff_id);

-- ---------- availability (promoted from kv 'availability') ----------
-- One row per unavailable date per staff member.
create table if not exists mf_availability (
  staff_id   text references mf_staff(id) on delete cascade,
  date       date not null,
  available  boolean default false,            -- false = unavailable that day
  primary key (staff_id, date)
);

-- ---------- auto-touch updated_at ----------
create or replace function mf_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['mf_clients','mf_events','mf_units','mf_staff','mf_stock','mf_kv']
  loop
    execute format(
      'drop trigger if exists %I_touch on %I;
       create trigger %I_touch before update on %I
       for each row execute function mf_touch_updated_at();',
      t, t, t, t
    );
  end loop;
end $$;
