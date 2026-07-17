// Verify the JWT -> auth.uid() -> RLS seam the way Supabase's PostgREST wires
// it: the gateway verifies the JWT, then sets `request.jwt.claims` (a JSON GUC)
// on the SQL session. Supabase's auth.uid() reads sub from that GUC. We
// reproduce that exact path so the mechanism is proven, not assumed.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = await PGlite.create();

// Supabase's REAL auth.uid() reads request.jwt.claims ->> 'sub'.
await db.exec(`
  create schema if not exists auth;
  create table auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(
      current_setting('request.jwt.claims', true)::json ->> 'sub', ''
    )::uuid
  $$;
  create publication supabase_realtime;
`);
await db.exec(readFileSync('supabase/01_schema.sql','utf8'));
await db.exec(readFileSync('supabase/02_rls.sql','utf8'));
await db.exec(readFileSync('supabase/03_seed.sql','utf8'));
await db.exec(`
  create role authenticated nosuperuser nobypassrls;
  grant usage on schema public, auth to authenticated;
  grant select,insert,update,delete on all tables in schema public to authenticated;
  grant execute on all functions in schema public to authenticated;
`);
const OWNER='00000000-0000-0000-0000-000000000001';
const CLIENT='00000000-0000-0000-0000-000000000003';
await db.exec(`
  insert into auth.users(id) values ('${OWNER}'),('${CLIENT}');
  insert into mf_access(user_id, role, client_id) values
    ('${OWNER}','owner', null),
    ('${CLIENT}','client','C002');
`);

// Simulate what PostgREST does after verifying a JWT: set the FULL claims
// JSON (as a real Supabase token carries: sub, role, email, exp, ...).
function claimsFor(uid) {
  return JSON.stringify({
    sub: uid, role: 'authenticated', email: 'x@y.z',
    aud: 'authenticated', exp: Math.floor(Date.now()/1000) + 3600,
  });
}

async function asJwt(uid, sql) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated;`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claimsFor(uid)]);
    return (await tx.query(sql)).rows;
  });
}

// Prove auth.uid() extracts sub from the claims JSON, and RLS follows.
const uidSeen = await asJwt(OWNER, `select auth.uid() as u, mf_role() as r`);
console.log('claims->auth.uid():', JSON.stringify(uidSeen[0]));

const ownerEvents = await asJwt(OWNER, 'select id from mf_events order by id');
const clientEvents = await asJwt(CLIENT, 'select id from mf_events order by id');
console.log('owner via JWT sees:', ownerEvents.map(r=>r.id).join(','));
console.log('client via JWT sees:', clientEvents.map(r=>r.id).join(','));

const pass =
  uidSeen[0].u === OWNER &&
  uidSeen[0].r === 'owner' &&
  ownerEvents.length === 3 &&
  clientEvents.length === 1 && clientEvents[0].id === 'E003';

console.log(pass ? '\n✓ JWT->auth.uid()->RLS seam verified' : '\n✗ JWT seam FAILED');
process.exit(pass ? 0 : 1);
