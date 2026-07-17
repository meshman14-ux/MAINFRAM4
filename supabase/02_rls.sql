-- ============================================================
--  MAINFRAME — Access control + Row-Level Security
--  Run AFTER 01_schema.sql.
--
--  Four roles (from the Build Brief): owner · manager · crew · client
--    owner / manager  → full access across all clients they operate
--    client           → read-only, scoped to their own client_id
--    crew             → scoped to their own staff row + assignments
--
--  mf_access maps an authenticated Supabase user to a role and an
--  optional client scope. Every policy consults it via helper
--  functions so the logic lives in one place.
-- ============================================================

create table if not exists mf_access (
  user_id   uuid references auth.users primary key,
  role      text not null default 'crew',    -- owner | manager | crew | client
  client_id text references mf_clients(id),  -- scope for client/crew roles
  staff_id  text references mf_staff(id),    -- link a crew login to their staff row
  created_at timestamptz default now()
);
alter table mf_access enable row level security;

-- A user can always read their own access row.
drop policy if exists "read own access" on mf_access;
create policy "read own access" on mf_access
  for select using (auth.uid() = user_id);

-- ---------- helper functions ----------
-- All are SECURITY DEFINER so their internal reads of mf_access /
-- mf_assignments do NOT re-trigger RLS (which would recurse). They are
-- owned by the definer (table owner) and marked STABLE.

create or replace function mf_role() returns text
language sql stable security definer set search_path = public as $$
  select role from mf_access where user_id = auth.uid()
$$;

-- Returns the client_id ONLY for users whose role is 'client'. Crew rows
-- also carry a client_id (for their own scoping) but must NOT satisfy the
-- client-portal read policies, so we gate on role here.
create or replace function mf_scope_client() returns text
language sql stable security definer set search_path = public as $$
  select client_id from mf_access
  where user_id = auth.uid() and role = 'client'
$$;

-- The crew member's own client_id, regardless of role (used where crew
-- genuinely need their client scope, if ever). Kept separate from the
-- client-portal gate above.
create or replace function mf_own_client() returns text
language sql stable security definer set search_path = public as $$
  select client_id from mf_access where user_id = auth.uid()
$$;

create or replace function mf_staff_id() returns text
language sql stable security definer set search_path = public as $$
  select staff_id from mf_access where user_id = auth.uid()
$$;

create or replace function mf_is_operator() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(mf_role() in ('owner','manager'), false)
$$;

-- Event ids the current crew member is assigned to (RLS-free internal read).
create or replace function mf_crew_event_ids() returns setof text
language sql stable security definer set search_path = public as $$
  select event_id from mf_assignments where staff_id = mf_staff_id()
$$;

-- Unit ids the current crew member is assigned to.
create or replace function mf_crew_unit_ids() returns setof text
language sql stable security definer set search_path = public as $$
  select unit_id from mf_assignments where staff_id = mf_staff_id()
$$;

-- Event ids belonging to the current client scope (for client portal reads).
create or replace function mf_client_event_ids() returns setof text
language sql stable security definer set search_path = public as $$
  select id from mf_events where client_id = mf_scope_client()
$$;

-- Unit ids belonging to the current client scope.
create or replace function mf_client_unit_ids() returns setof text
language sql stable security definer set search_path = public as $$
  select id from mf_units where client_id = mf_scope_client()
$$;

-- ---------- enable RLS on every table ----------
do $$
declare t text;
begin
  foreach t in array array[
    'mf_clients','mf_events','mf_units','mf_staff',
    'mf_assignments','mf_stock','mf_applications','mf_kv','mf_certs','mf_availability'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
  end loop;
end $$;

-- ============================================================
--  POLICIES
--  Operators (owner/manager): full read+write everywhere.
--  Clients: read rows belonging to their client_id.
--  Crew: read their own staff row, their assignments, and the
--        events/units/stock connected to those assignments.
-- ============================================================

-- ---------- mf_clients ----------
drop policy if exists clients_operator_all on mf_clients;
create policy clients_operator_all on mf_clients
  for all using (mf_is_operator()) with check (mf_is_operator());

drop policy if exists clients_client_read on mf_clients;
create policy clients_client_read on mf_clients
  for select using (id = mf_scope_client());

-- ---------- mf_events ----------
drop policy if exists events_operator_all on mf_events;
create policy events_operator_all on mf_events
  for all using (mf_is_operator()) with check (mf_is_operator());

drop policy if exists events_client_read on mf_events;
create policy events_client_read on mf_events
  for select using (client_id = mf_scope_client());

drop policy if exists events_crew_read on mf_events;
create policy events_crew_read on mf_events
  for select using (
    mf_role() = 'crew' and id in (select mf_crew_event_ids())
  );

-- ---------- mf_units ----------
drop policy if exists units_operator_all on mf_units;
create policy units_operator_all on mf_units
  for all using (mf_is_operator()) with check (mf_is_operator());

drop policy if exists units_client_read on mf_units;
create policy units_client_read on mf_units
  for select using (client_id = mf_scope_client());

drop policy if exists units_crew_read on mf_units;
create policy units_crew_read on mf_units
  for select using (
    mf_role() = 'crew' and id in (select mf_crew_unit_ids())
  );

-- ---------- mf_staff ----------
drop policy if exists staff_operator_all on mf_staff;
create policy staff_operator_all on mf_staff
  for all using (mf_is_operator()) with check (mf_is_operator());

drop policy if exists staff_client_read on mf_staff;
create policy staff_client_read on mf_staff
  for select using (client_id = mf_scope_client());

-- Crew can read + update their OWN staff row (availability, cert upload).
drop policy if exists staff_crew_self on mf_staff;
create policy staff_crew_self on mf_staff
  for select using (id = mf_staff_id());

drop policy if exists staff_crew_update_self on mf_staff;
create policy staff_crew_update_self on mf_staff
  for update using (id = mf_staff_id()) with check (id = mf_staff_id());

-- ---------- mf_assignments ----------
drop policy if exists assign_operator_all on mf_assignments;
create policy assign_operator_all on mf_assignments
  for all using (mf_is_operator()) with check (mf_is_operator());

drop policy if exists assign_client_read on mf_assignments;
create policy assign_client_read on mf_assignments
  for select using (event_id in (select mf_client_event_ids()));

drop policy if exists assign_crew_read on mf_assignments;
create policy assign_crew_read on mf_assignments
  for select using (staff_id = mf_staff_id());

-- Crew can confirm/decline their own shift (update the confirmed flag).
drop policy if exists assign_crew_confirm on mf_assignments;
create policy assign_crew_confirm on mf_assignments
  for update using (staff_id = mf_staff_id()) with check (staff_id = mf_staff_id());

-- ---------- mf_stock ----------
drop policy if exists stock_operator_all on mf_stock;
create policy stock_operator_all on mf_stock
  for all using (mf_is_operator()) with check (mf_is_operator());

drop policy if exists stock_client_read on mf_stock;
create policy stock_client_read on mf_stock
  for select using (unit_id in (select mf_client_unit_ids()));

-- ---------- mf_applications ----------
drop policy if exists app_operator_all on mf_applications;
create policy app_operator_all on mf_applications
  for all using (mf_is_operator()) with check (mf_is_operator());

-- Crew can see and create their own applications (apply for open jobs).
drop policy if exists app_crew_read on mf_applications;
create policy app_crew_read on mf_applications
  for select using (staff_id = mf_staff_id());

drop policy if exists app_crew_apply on mf_applications;
create policy app_crew_apply on mf_applications
  for insert with check (staff_id = mf_staff_id());

-- ---------- mf_kv (global JSON blobs; operators write, others read) ----------
drop policy if exists kv_operator_all on mf_kv;
create policy kv_operator_all on mf_kv
  for all using (mf_is_operator()) with check (mf_is_operator());

drop policy if exists kv_authed_read on mf_kv;
create policy kv_authed_read on mf_kv
  for select using (auth.uid() is not null);

-- ---------- mf_certs (crew self-service; operators full) ----------
drop policy if exists certs_operator_all on mf_certs;
create policy certs_operator_all on mf_certs
  for all using (mf_is_operator()) with check (mf_is_operator());

drop policy if exists certs_crew_self on mf_certs;
create policy certs_crew_self on mf_certs
  for select using (staff_id = mf_staff_id());

drop policy if exists certs_crew_upload on mf_certs;
create policy certs_crew_upload on mf_certs
  for insert with check (staff_id = mf_staff_id());

drop policy if exists certs_crew_update on mf_certs;
create policy certs_crew_update on mf_certs
  for update using (staff_id = mf_staff_id()) with check (staff_id = mf_staff_id());

-- ---------- mf_availability (crew self-service; operators read) ----------
drop policy if exists avail_operator_all on mf_availability;
create policy avail_operator_all on mf_availability
  for all using (mf_is_operator()) with check (mf_is_operator());

drop policy if exists avail_crew_self on mf_availability;
create policy avail_crew_self on mf_availability
  for all using (staff_id = mf_staff_id()) with check (staff_id = mf_staff_id());

-- ============================================================
--  REALTIME — publish table changes so every device stays live
--  (mirrors the prototype's subscribe/emit pattern).
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'mf_clients','mf_events','mf_units','mf_staff',
    'mf_assignments','mf_stock','mf_applications','mf_kv','mf_certs','mf_availability'
  ]
  loop
    -- add table to the realtime publication if not already present
    begin
      execute format('alter publication supabase_realtime add table %I;', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
