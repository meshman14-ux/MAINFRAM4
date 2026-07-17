import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = await PGlite.create();

// Supabase shims
await db.exec(`
  create schema if not exists auth;
  create table auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create publication supabase_realtime;
`);

await db.exec(readFileSync('supabase/01_schema.sql','utf8'));
await db.exec(readFileSync('supabase/02_rls.sql','utf8'));
await db.exec(readFileSync('supabase/03_seed.sql','utf8'));

// Create a NON-superuser role that does NOT bypass RLS — this is how the
// Supabase "authenticated" role behaves. Grant it table privileges, then
// switch to it so policies actually engage.
await db.exec(`
  create role authenticated nosuperuser nobypassrls;
  grant usage on schema public, auth to authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant execute on all functions in schema public to authenticated;
`);

const OWNER='00000000-0000-0000-0000-000000000001';
const CREW ='00000000-0000-0000-0000-000000000002';
const CLIENT='00000000-0000-0000-0000-000000000003';
await db.exec(`
  insert into auth.users(id) values ('${OWNER}'),('${CREW}'),('${CLIENT}');
  insert into mf_access(user_id, role, client_id, staff_id) values
    ('${OWNER}','owner', null, null),
    ('${CREW}','crew','C001','S006'),
    ('${CLIENT}','client','C002', null);
`);

// Run a block AS the authenticated role with a given uid claim.
async function asUser(uid, sql){
  await db.exec(`
    set local role authenticated;
    select set_config('request.jwt.claim.sub', '${uid}', true);
  ` );
  // Must run within the same implicit tx; PGlite exec/query autocommit, so
  // wrap in an explicit transaction.
  return db.transaction(async (tx)=>{
    await tx.exec(`set local role authenticated;`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    const r = await tx.query(sql);
    return r.rows;
  });
}

const ownerEvents  = await asUser(OWNER,  'select id from mf_events order by id');
const clientEvents = await asUser(CLIENT, 'select id from mf_events order by id');
const crewEvents   = await asUser(CREW,   'select id from mf_events order by id');
// Crew must only see their OWN assignments, not everyone's.
const crewAssignsPre = await asUser(CREW, 'select id from mf_assignments order by id');

// owner assigns crew S006 -> E002
await db.transaction(async (tx)=>{
  await tx.exec(`set local role authenticated;`);
  await tx.query(`select set_config('request.jwt.claim.sub',$1,true)`,[OWNER]);
  await tx.query(`insert into mf_assignments(id,event_id,unit_id,staff_id,area) values ('A099','E002','U001','S006','Bar')`);
});
const crewEvents2  = await asUser(CREW, 'select id from mf_events order by id');

let clientWriteDenied=false;
try {
  await db.transaction(async (tx)=>{
    await tx.exec(`set local role authenticated;`);
    await tx.query(`select set_config('request.jwt.claim.sub',$1,true)`,[CLIENT]);
    await tx.query(`insert into mf_events(id,client_id,name) values ('E999','C002','hack')`);
  });
} catch(e){ clientWriteDenied=true; }

console.log('owner sees:', ownerEvents.map(r=>r.id).join(',')||'(none)');
console.log('client sees:', clientEvents.map(r=>r.id).join(',')||'(none)');
console.log('crew pre:', crewEvents.map(r=>r.id).join(',')||'(none)');
console.log('crew own assignments (pre):', crewAssignsPre.map(r=>r.id).join(',')||'(none)');
console.log('crew post-assign:', crewEvents2.map(r=>r.id).join(',')||'(none)');
console.log('client write denied:', clientWriteDenied);

const checks = [
  ['owner sees all 3', ownerEvents.length===3],
  ['client sees only E003', clientEvents.length===1 && clientEvents[0].id==='E003'],
  ['crew sees no events pre-assign (S006 unassigned)', crewEvents.length===0],
  ['crew sees no foreign assignments', crewAssignsPre.length===0],
  ['crew sees E002 post-assign', crewEvents2.some(r=>r.id==='E002')],
  ['client cannot write', clientWriteDenied],
];
let all=true;
console.log('');
for(const [n,p] of checks){ console.log(`${p?'✓':'✗'} ${n}`); if(!p) all=false; }
console.log(all?'\nALL RLS CHECKS PASSED':'\nRLS CHECKS FAILED');
process.exit(all?0:1);
