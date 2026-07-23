-- ============================================================
--  MAINFRAME — Phase 15 migration: Unit Dashboard + AI
--  ADDITIVE / idempotent — safe to run on a live database.
--  Run AFTER 01..10 (see RUN_ALL.md). DO NOT re-run destructively.
-- ------------------------------------------------------------
--  Adds:
--    - mf_tasks            per-unit / per-event work items
--    - mf_unit_checklists  interactive per-unit checklists by kind
--                          (stock|paperwork|equipment|consumables|
--                           safety|operational), items as jsonb
--    - mf_unit_insights    persisted AI analysis (scores + insights
--                          + daily/weekly/monthly summaries)
--    - analyze_unit(text)  RPC that assembles a unit's full server-
--                          side context payload (the LLM call itself
--                          happens client-side via window.claude).
--  RLS reuses the existing helpers (mf_is_operator/mf_staff_id).
-- ============================================================

-- ---------- mf_tasks ----------
create table if not exists mf_tasks (
  id                text primary key,
  client_id         text references mf_clients(id) on delete cascade,
  unit_id           text references mf_units(id)  on delete cascade,
  event_id          text references mf_events(id) on delete set null,
  title             text not null,
  detail            text,
  status            text not null default 'open',   -- open|doing|done
  assignee_staff_id text references mf_staff(id) on delete set null,
  due               date,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);
create index if not exists mf_tasks_unit_idx  on mf_tasks(unit_id);
create index if not exists mf_tasks_event_idx on mf_tasks(event_id);
create index if not exists mf_tasks_assignee_idx on mf_tasks(assignee_staff_id);

-- ---------- mf_unit_checklists ----------
create table if not exists mf_unit_checklists (
  id         text primary key,
  unit_id    text references mf_units(id) on delete cascade,
  kind       text not null,                 -- stock|paperwork|equipment|consumables|safety|operational
  items      jsonb default '[]'::jsonb,     -- [{id,label,on,note}]
  updated_at timestamptz default now()
);
create index if not exists mf_unit_checklists_unit_idx on mf_unit_checklists(unit_id);
create unique index if not exists mf_unit_checklists_unit_kind on mf_unit_checklists(unit_id, kind);

-- ---------- mf_unit_insights ----------
create table if not exists mf_unit_insights (
  id              text primary key,
  unit_id         text references mf_units(id) on delete cascade,
  generated_at    timestamptz default now(),
  health_score    int,
  readiness_score int,
  insights        jsonb default '[]'::jsonb, -- [{kind,tone,title,detail}]
  summary_daily   text,
  summary_weekly  text,
  summary_monthly text,
  updated_at      timestamptz default now()
);
create index if not exists mf_unit_insights_unit_idx on mf_unit_insights(unit_id);

-- ---------- touch triggers ----------
do $$
declare t text;
begin
  foreach t in array array['mf_tasks','mf_unit_checklists','mf_unit_insights'] loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format('create trigger %I_touch before update on %I for each row execute function mf_touch_updated_at()', t, t);
  end loop;
end $$;

-- ---------- RLS ----------
alter table mf_tasks            enable row level security;
alter table mf_unit_checklists  enable row level security;
alter table mf_unit_insights    enable row level security;

-- operators: full access to all three
do $$
declare t text;
begin
  foreach t in array array['mf_tasks','mf_unit_checklists','mf_unit_insights'] loop
    execute format('drop policy if exists %I_operator_all on %I', t, t);
    execute format('create policy %I_operator_all on %I for all using (mf_is_operator()) with check (mf_is_operator())', t, t);
  end loop;
end $$;

-- crew: read tasks assigned to them or on a unit they work; read checklists/
-- insights for units they work. (Write stays operator-only.)
drop policy if exists tasks_crew_read on mf_tasks;
create policy tasks_crew_read on mf_tasks
  for select using (
    assignee_staff_id = mf_staff_id()
    or unit_id in (select unit_id from mf_assignments where staff_id = mf_staff_id())
  );

drop policy if exists unit_checklists_crew_read on mf_unit_checklists;
create policy unit_checklists_crew_read on mf_unit_checklists
  for select using (
    unit_id in (select unit_id from mf_assignments where staff_id = mf_staff_id())
  );

drop policy if exists unit_insights_crew_read on mf_unit_insights;
create policy unit_insights_crew_read on mf_unit_insights
  for select using (
    unit_id in (select unit_id from mf_assignments where staff_id = mf_staff_id())
  );

-- ---------- realtime ----------
do $$
declare t text;
begin
  foreach t in array array['mf_tasks','mf_unit_checklists','mf_unit_insights'] loop
    begin execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;

-- ============================================================
--  analyze_unit(p_unit_id) — assemble the unit's full context as
--  one jsonb payload for the client-side LLM call. SECURITY
--  INVOKER so the caller's RLS on every table applies.
-- ============================================================
create or replace function analyze_unit(p_unit_id text)
returns jsonb language sql stable security invoker as $$
  select jsonb_build_object(
    'unit', (select to_jsonb(u) from mf_units u where u.id = p_unit_id),
    'stock', coalesce((select jsonb_agg(to_jsonb(s)) from mf_stock s where s.unit_id = p_unit_id), '[]'::jsonb),
    'assignments', coalesce((select jsonb_agg(to_jsonb(a)) from mf_assignments a where a.unit_id = p_unit_id), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(to_jsonb(d)) from mf_documents d where d.unit_id = p_unit_id), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(to_jsonb(t)) from mf_tasks t where t.unit_id = p_unit_id), '[]'::jsonb),
    'checklists', coalesce((select jsonb_agg(to_jsonb(c)) from mf_unit_checklists c where c.unit_id = p_unit_id), '[]'::jsonb),
    'shopping', coalesce((select jsonb_agg(to_jsonb(sl)) from mf_shopping_lists sl where sl.unit_id = p_unit_id), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(e)) from mf_events e
      where (e.unit_ids ? p_unit_id)
         or (e.unit_ids is null and e.client_id = (select client_id from mf_units where id = p_unit_id))
    ), '[]'::jsonb)
  );
$$;
