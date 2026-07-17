// Dev helper: execute the full schema against real Postgres (PGlite) to
// confirm it runs, seeds, and the promoted tables exist. Not a test — see
// tests/rls.test.ts for the authoritative RLS behaviour suite.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = await PGlite.create();
await db.exec(`
  create schema if not exists auth;
  create table auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create publication supabase_realtime;
`);

async function run(file) {
  try { await db.exec(readFileSync(file, 'utf8')); console.log(`✓ ${file}`); return true; }
  catch (e) { console.log(`✗ ${file}: ${e.message}`); return false; }
}

if (await run('supabase/01_schema.sql')
 && await run('supabase/02_rls.sql')
 && await run('supabase/03_seed.sql')) {
  const n = (await db.query('select count(*)::int n from mf_events')).rows[0].n;
  const tables = (await db.query(`select table_name from information_schema.tables where table_schema='public' order by table_name`)).rows.map(r=>r.table_name);
  console.log(`events seeded: ${n}`);
  console.log('tables:', tables.join(', '));
}
