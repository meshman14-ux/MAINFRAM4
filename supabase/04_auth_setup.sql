-- ============================================================
--  MAINFRAME — Auth provisioning (run AFTER 01_schema + 02_rls)
--  How to give real people access. Supabase Auth manages the
--  login (email/password); mf_access maps each auth user to a
--  role and scope. Without an mf_access row, a signed-in user
--  sees the "account pending" screen.
-- ============================================================

-- STEP 1 — create the login in Supabase Auth
--   Dashboard → Authentication → Users → "Add user"
--   (email + password). Copy the generated user UID.
--   Or via SQL admin / the Admin API.

-- STEP 2 — grant access by inserting an mf_access row.
--   Replace the UUID below with the real auth user's id.

-- ---- the founder / owner (full access) ----
-- insert into mf_access (user_id, role) values
--   ('<AUTH-USER-UUID>', 'owner');

-- ---- a manager (full access, same as owner for now) ----
-- insert into mf_access (user_id, role) values
--   ('<AUTH-USER-UUID>', 'manager');

-- ---- a crew member (scoped to their own staff row) ----
--   client_id = the operator they work for; staff_id = their mf_staff row.
-- insert into mf_access (user_id, role, client_id, staff_id) values
--   ('<AUTH-USER-UUID>', 'crew', 'C001', 'S006');

-- ---- a client (read-only portal, scoped to their own client) ----
-- insert into mf_access (user_id, role, client_id) values
--   ('<AUTH-USER-UUID>', 'client', 'C002');

-- ------------------------------------------------------------
-- Quick check: who has access to what?
--   select a.role, a.client_id, a.staff_id, u.email
--   from mf_access a join auth.users u on u.id = a.user_id;
-- ============================================================
