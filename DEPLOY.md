# Deploying MAINFRAME

MAINFRAME is a Vite + React single-page app backed by Supabase (Postgres +
Auth + Realtime). Deployment is two connected accounts: a **Supabase project**
(the database and auth) and a **Vercel project** (the hosted frontend). This
guide walks the whole thing end to end.

You do not need any of this to run locally — see "Local development" at the
bottom. This guide is for putting it on the internet.

---

## 1. Create the Supabase project

1. Sign in at <https://supabase.com> and create a new project. Choose a region
   close to your users (e.g. London for UK operators).
2. Note the database password you set — you'll need it if you ever connect
   directly.
3. Once the project is provisioned, go to **Project Settings → API** and copy:
   - **Project URL** (looks like `https://abcdxyz.supabase.co`)
   - **anon public** key

These become `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

---

## 2. Run the database migrations

In the Supabase dashboard, open **SQL Editor** and run the files from the
`supabase/` folder **in order**. Each is safe to re-run (idempotent).

1. `01_schema.sql` — the 11 tables (events, units, staff, assignments, stock,
   applications, kv, certs, availability, clients, access).
2. `02_rls.sql` — row-level security: the policies that scope every table by
   role. **This is what makes the app multi-tenant-safe** — without it, RLS is
   off and everyone sees everything.
3. `03_seed.sql` — *optional* demo data (JP Events, a few events, crew, stock).
   Skip this for a clean production start; run it if you want something to look
   at immediately.

> The RLS policies rely on Supabase's built-in `auth.uid()` and the
> `authenticated` role, both of which exist automatically in a Supabase
> project — no shims needed (those are only used in the local test suite).

### Verify RLS is on

In the SQL editor:

```sql
select relname, relrowsecurity
from pg_class
where relname like 'mf_%' and relkind = 'r';
```

Every `mf_` table should show `relrowsecurity = true`.

---

## 3. Create your first login (the owner)

Supabase Auth manages logins; the `mf_access` table maps a login to a role.

1. **Authentication → Users → Add user.** Create yourself with an email and
   password. Copy the generated **User UID**.
2. In the SQL editor, grant yourself owner access (see
   `supabase/04_auth_setup.sql` for all the role variants):

   ```sql
   insert into mf_access (user_id, role) values
     ('PASTE-YOUR-USER-UID', 'owner');
   ```

You can now sign in as a full operator. Invite managers, crew, and clients the
same way — create their login, then insert an `mf_access` row with the right
role and scope (`client_id` / `staff_id`). A user who signs in with no
`mf_access` row sees an "account pending" screen, which is the intended safe
default.

### Turn off open sign-ups (recommended)

Under **Authentication → Providers → Email**, disable "Enable sign ups" so only
users you invite can get a login. MAINFRAME has no public registration by
design — access is granted, not self-served.

---

## 4. Deploy the frontend to Vercel

1. Push this project to a Git repository (GitHub/GitLab/Bitbucket).
2. At <https://vercel.com>, **Add New → Project**, and import the repo.
3. Vercel auto-detects Vite (the included `vercel.json` also pins it). Leave
   the build command (`npm run build`) and output directory (`dist`) as they
   are.
4. Under **Environment Variables**, add the two values from step 1:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. **Deploy.**

When it finishes, you'll get a `*.vercel.app` URL. Open it, sign in with the
owner login from step 3, and you're live.

---

## 5. Point Supabase at your live URL

So auth redirects and realtime work from the deployed domain:

- **Authentication → URL Configuration** → set the **Site URL** to your Vercel
  URL (and add any custom domain to **Redirect URLs**).

---

## Updating

Push to your Git branch; Vercel rebuilds and redeploys automatically. Database
changes are new SQL files you run in the Supabase SQL editor — keep them
numbered and in order.

---

## Local development

```bash
npm install
cp .env.example .env        # then fill in your Supabase URL + anon key
npm run dev                 # http://localhost:5173
```

Useful scripts:

```bash
npm run build         # production build into dist/
npm test              # full test suite (includes real-Postgres RLS tests)
npm run verify:schema # execute schema+rls+seed against an in-memory Postgres
npm run verify:rls    # role-scope checks with simulated logins
npm run verify:jwt    # prove the JWT -> auth.uid() -> RLS seam
```

The verify scripts and the RLS test suite run against a real Postgres engine
(PGlite/WASM), so you can confirm the security model before you ever deploy.

---

## Architecture at a glance

- **Frontend:** Vite + React + TypeScript, a single bundle, hash-routed.
- **Data layer:** one `OpsData` store mirroring Supabase tables, with realtime
  subscriptions and optimistic writes (`src/data/opsData.ts`).
- **Auth:** Supabase Auth + `useAccess()` resolving role/scope from
  `mf_access`; every screen is role-gated and every table is RLS-scoped.
- **No server of your own** to run — Supabase is the backend, Vercel serves the
  static frontend.
