/* RLS behaviour tests against a REAL Postgres (PGlite/WASM).
   Proves the policies actually scope owner / manager / crew / client,
   not just that the SQL parses. Catches recursion and scope leaks. */
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const sql = (f: string) => readFileSync(join(here, '..', 'supabase', f), 'utf8');

const OWNER = '00000000-0000-0000-0000-000000000001';
const CREW = '00000000-0000-0000-0000-000000000002';   // S006 @ C001, unassigned in seed
const CLIENT = '00000000-0000-0000-0000-000000000003'; // client scoped to C002

let db: PGlite;

async function asUser<T = any>(uid: string, query: string): Promise<T[]> {
  // Set the full JWT claims JSON, exactly as PostgREST does after verifying a
  // Supabase token — auth.uid() reads sub from here.
  const claims = JSON.stringify({
    sub: uid, role: 'authenticated', aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  return db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated;`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    const r = await tx.query(query);
    return r.rows as T[];
  });
}

beforeAll(async () => {
  db = await PGlite.create();
  // Supabase shims: auth schema + auth.uid() + realtime publication.
  // auth.uid() reads the modern `request.jwt.claims` JSON GUC (as current
  // Supabase does), the same path a verified JWT flows through in PostgREST.
  await db.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key);
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid $$;
    create publication supabase_realtime;
  `);
  await db.exec(sql('01_schema.sql'));
  await db.exec(sql('02_rls.sql'));
  await db.exec(sql('03_seed.sql'));
  await db.exec(sql('05_pipeline.sql'));
  await db.exec(sql('06_logistics.sql'));
  await db.exec(sql('07_tasks.sql'));
  await db.exec(sql('08_system_upgrade.sql'));
  await db.exec(sql('09_audit_hardening.sql'));
  // A non-superuser role that does NOT bypass RLS (like Supabase 'authenticated').
  await db.exec(`
    create role authenticated nosuperuser nobypassrls;
    grant usage on schema public, auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);
  await db.exec(`
    insert into auth.users(id) values ('${OWNER}'),('${CREW}'),('${CLIENT}');
    insert into mf_access(user_id, role, client_id, staff_id) values
      ('${OWNER}','owner', null, null),
      ('${CREW}','crew','C001','S006'),
      ('${CLIENT}','client','C002', null);
  `);
}, 30000);

describe('RLS: policies execute without recursion', () => {
  it('reading events does not raise (no infinite recursion)', async () => {
    await expect(asUser(OWNER, 'select id from mf_events')).resolves.toBeDefined();
  });
});

describe('JWT -> auth.uid() -> role resolution seam', () => {
  it('extracts sub from the claims JSON and resolves the role', async () => {
    const rows = await asUser(OWNER, 'select auth.uid()::text as uid, mf_role() as role');
    expect(rows[0].uid).toBe(OWNER);
    expect(rows[0].role).toBe('owner');
  });
  it('a different token resolves a different role/scope', async () => {
    const rows = await asUser(CLIENT, 'select mf_role() as role, mf_scope_client() as scope');
    expect(rows[0].role).toBe('client');
    expect(rows[0].scope).toBe('C002');
  });
});

describe('RLS: owner', () => {
  it('sees all events', async () => {
    const rows = await asUser(OWNER, 'select id from mf_events order by id');
    expect(rows.map((r) => r.id)).toEqual(['E001', 'E002', 'E003']);
  });
});

describe('RLS: client (C002)', () => {
  it('sees only their own events', async () => {
    const rows = await asUser(CLIENT, 'select id from mf_events order by id');
    expect(rows.map((r) => r.id)).toEqual(['E003']);
  });
  it('cannot write events', async () => {
    await expect(
      asUser(CLIENT, `insert into mf_events(id,client_id,name) values ('E999','C002','x')`)
    ).rejects.toBeTruthy();
  });
});

describe('RLS: crew (S006, unassigned in seed)', () => {
  it('sees no events until assigned', async () => {
    const rows = await asUser(CREW, 'select id from mf_events');
    expect(rows).toHaveLength(0);
  });
  it('does not see other staff assignments', async () => {
    const rows = await asUser(CREW, 'select id from mf_assignments');
    expect(rows).toHaveLength(0);
  });
  it('sees an event once assigned to it', async () => {
    await asUser(OWNER, `insert into mf_assignments(id,event_id,unit_id,staff_id,area) values ('A099','E002','U001','S006','Bar')`);
    const rows = await asUser(CREW, 'select id from mf_events');
    expect(rows.map((r) => r.id)).toContain('E002');
  });
  it('can read and write only its own availability', async () => {
    await asUser(CREW, `insert into mf_availability(staff_id, date, available) values ('S006','2026-07-24', false)`);
    const mine = await asUser(CREW, `select date from mf_availability`);
    expect(mine).toHaveLength(1);
  });

  it('can upload its own cert but not another staff member\'s', async () => {
    // own cert: allowed
    await asUser(CREW, `insert into mf_certs(id, staff_id, type, expiry) values ('CERT-S006-x','S006','Food Hygiene L2','2030-01-01')`);
    const mine = await asUser(CREW, `select id from mf_certs`);
    expect(mine.some((r) => r.id === 'CERT-S006-x')).toBe(true);
    // foreign cert: denied by WITH CHECK
    await expect(
      asUser(CREW, `insert into mf_certs(id, staff_id, type, expiry) values ('CERT-S001-x','S001','First Aid','2030-01-01')`)
    ).rejects.toBeTruthy();
  });
});

describe('RLS: sales pipeline is operator-only (Phase 8)', () => {
  it('owner can read and write the pipeline', async () => {
    await asUser(OWNER, `insert into mf_pipeline(id, name, stage) values ('P001','Coastal Kitchen','lead')`);
    const rows = await asUser(OWNER, `select id from mf_pipeline`);
    expect(rows.some((r) => r.id === 'P001')).toBe(true);
  });

  it('crew cannot see the pipeline at all', async () => {
    const rows = await asUser(CREW, `select id from mf_pipeline`);
    expect(rows).toHaveLength(0);
  });

  it('crew cannot write to the pipeline', async () => {
    await expect(
      asUser(CREW, `insert into mf_pipeline(id, name, stage) values ('P002','Sneaky Co','lead')`)
    ).rejects.toBeTruthy();
  });

  it('client cannot see the pipeline at all', async () => {
    const rows = await asUser(CLIENT, `select id from mf_pipeline`);
    expect(rows).toHaveLength(0);
  });
});

describe('RLS: logistics movements are operator-only (Phase 9)', () => {
  it('owner can read and write movements', async () => {
    await asUser(OWNER, `insert into mf_movements(id, event_id, driver_id, status) values ('MV001','E001','S001','planned')`);
    const rows = await asUser(OWNER, `select id from mf_movements`);
    expect(rows.some((r) => r.id === 'MV001')).toBe(true);
  });

  it('crew cannot see movements at all', async () => {
    const rows = await asUser(CREW, `select id from mf_movements`);
    expect(rows).toHaveLength(0);
  });

  it('client cannot see movements at all', async () => {
    const rows = await asUser(CLIENT, `select id from mf_movements`);
    expect(rows).toHaveLength(0);
  });
});

describe('RLS: event tasks are operator-only (Phase 10)', () => {
  it('owner can read and write tasks', async () => {
    await asUser(OWNER, `insert into mf_event_tasks(id, event_id, title, category) values ('T001','E001','Confirm crew','General')`);
    const rows = await asUser(OWNER, `select id from mf_event_tasks`);
    expect(rows.some((r) => r.id === 'T001')).toBe(true);
  });

  it('crew cannot see event tasks at all', async () => {
    const rows = await asUser(CREW, `select id from mf_event_tasks`);
    expect(rows).toHaveLength(0);
  });

  it('client cannot see event tasks at all', async () => {
    const rows = await asUser(CLIENT, `select id from mf_event_tasks`);
    expect(rows).toHaveLength(0);
  });
});

describe('RLS: timesheets — crew self-service (Phase 12)', () => {
  it('crew can clock in (insert their own draft sheet)', async () => {
    await asUser(CREW, `insert into mf_timesheets(id, event_id, staff_id, work_date, status) values ('TS900','E002','S006','2026-08-15','draft')`);
    const mine = await asUser(CREW, `select id from mf_timesheets`);
    expect(mine.some((r) => r.id === 'TS900')).toBe(true);
  });

  it('crew cannot create a timesheet for someone else', async () => {
    await expect(
      asUser(CREW, `insert into mf_timesheets(id, event_id, staff_id, work_date, status) values ('TS901','E001','S001','2026-07-23','draft')`)
    ).rejects.toBeTruthy();
  });

  it("crew cannot see other people's timesheets", async () => {
    await asUser(OWNER, `insert into mf_timesheets(id, event_id, staff_id, work_date, status) values ('TS902','E001','S001','2026-07-23','approved')`);
    const mine = await asUser(CREW, `select id from mf_timesheets`);
    expect(mine.map((r) => r.id)).toEqual(['TS900']);
  });

  it('crew can submit but NOT self-approve', async () => {
    await asUser(CREW, `update mf_timesheets set status='submitted' where id='TS900'`);
    await expect(
      asUser(CREW, `update mf_timesheets set status='approved' where id='TS900'`)
    ).rejects.toBeTruthy();
  });

  it('owner sees and can approve everything', async () => {
    await asUser(OWNER, `update mf_timesheets set status='approved' where id='TS900'`);
    const rows = await asUser(OWNER, `select id, status from mf_timesheets order by id`);
    expect(rows.map((r) => r.id)).toEqual(['TS900', 'TS902']);
    expect(rows[0].status).toBe('approved');
  });
});

describe('RLS: phase-12 commercial tables are operator-only', () => {
  it('owner can write invoices, expenses, vehicles, documents, shopping lists', async () => {
    await asUser(OWNER, `insert into mf_invoices(id, client_id, status, lines) values ('I001','C001','draft','[{"desc":"Bar","qty":1,"unitPrice":500}]'::jsonb)`);
    await asUser(OWNER, `insert into mf_expenses(id, client_id, category, amount) values ('X001','C001','Fuel',80)`);
    await asUser(OWNER, `insert into mf_vehicles(id, client_id, name, vtype) values ('V001','C001','Sprinter 1','Van')`);
    await asUser(OWNER, `insert into mf_documents(id, client_id, title, doc_type) values ('D001','C001','PL insurance','Insurance')`);
    await asUser(OWNER, `insert into mf_shopping_lists(id, unit_id, item) values ('L001','U001','Limes')`);
    const inv = await asUser(OWNER, `select id from mf_invoices`);
    expect(inv.some((r) => r.id === 'I001')).toBe(true);
  });

  it('crew and client see none of the commercial tables', async () => {
    for (const t of ['mf_invoices', 'mf_expenses', 'mf_vehicles', 'mf_documents', 'mf_shopping_lists']) {
      expect(await asUser(CREW, `select id from ${t}`)).toHaveLength(0);
      expect(await asUser(CLIENT, `select id from ${t}`)).toHaveLength(0);
    }
  });

  it('crew cannot write to a commercial table', async () => {
    await expect(
      asUser(CREW, `insert into mf_expenses(id, client_id, category, amount) values ('X999','C001','Fuel',1)`)
    ).rejects.toBeTruthy();
  });
});

describe('RLS: audit hardening (Phase 13 / migration 09)', () => {
  it('C1 — kv is operator-only read; crew and client cannot read it', async () => {
    await asUser(OWNER, `insert into mf_kv(ns, data) values ('pins', '{"C001":[{"text":"secret"}]}'::jsonb)`);
    expect(await asUser(OWNER, `select ns from mf_kv`)).toHaveLength(1);
    expect(await asUser(CREW, `select ns from mf_kv`)).toHaveLength(0);
    expect(await asUser(CLIENT, `select ns from mf_kv`)).toHaveLength(0);
  });

  it('C2 — crew can read their own staff row but cannot update it (no rate/RTW self-edit)', async () => {
    // CREW is S006 @ C001. Reads own row:
    const mine = await asUser(CREW, `select id from mf_staff where id = mf_staff_id()`);
    expect(mine).toHaveLength(1);
    // Set a known baseline as operator, then have crew attempt a self-edit.
    await asUser(OWNER, `update mf_staff set rate = 12, rtw = 'Pending' where id = 'S006'`);
    // With no crew UPDATE policy, RLS filters the row out — the update touches
    // zero rows (no error), so the values are unchanged.
    await asUser(CREW, `update mf_staff set rate = 999, rtw = 'Verified' where id = mf_staff_id()`);
    const after = (await asUser(OWNER, `select rate, rtw from mf_staff where id = 'S006'`))[0];
    expect(Number(after.rate)).toBe(12);
    expect(after.rtw).toBe('Pending');
  });

  it('M6 — client cannot read the staff base table, but the name/role view hides phone + rate', async () => {
    // base table: no rows for a client now
    expect(await asUser(CLIENT, `select id from mf_staff`)).toHaveLength(0);
    // the safe view returns their scope's crew, names/roles only (no phone/rate columns exist on it)
    const rows = await asUser(CLIENT, `select id, name, role from mf_staff_client`);
    expect(rows.every((r) => 'name' in r && 'role' in r && !('rate' in r) && !('phone' in r))).toBe(true);
  });

  it('M7 — a crew-submitted timesheet rate is forced to the staff record rate', async () => {
    // give S006 a known rate as operator
    await asUser(OWNER, `update mf_staff set rate = 11 where id = 'S006'`);
    // crew assigned to an event so the insert passes the crew policy
    await asUser(OWNER, `insert into mf_assignments(id,event_id,unit_id,staff_id,area) values ('A200','E002','U001','S006','Bar') on conflict (id) do nothing`);
    // crew submits a padded rate of 500 — the trigger must overwrite it to 11
    await asUser(CREW, `insert into mf_timesheets(id, event_id, staff_id, work_date, status, hours, rate) values ('TSX','E002','S006','2026-08-15','submitted', 8, 500)`);
    const row = (await asUser(OWNER, `select rate from mf_timesheets where id = 'TSX'`))[0];
    expect(Number(row.rate)).toBe(11);
  });

  it('M7 — an operator CAN set an explicit per-sheet rate', async () => {
    await asUser(OWNER, `insert into mf_timesheets(id, event_id, staff_id, work_date, status, hours, rate) values ('TSY','E001','S001','2026-07-23','approved', 8, 25)`);
    const row = (await asUser(OWNER, `select rate from mf_timesheets where id = 'TSY'`))[0];
    expect(Number(row.rate)).toBe(25);
  });
});
