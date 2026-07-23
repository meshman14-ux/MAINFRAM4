-- ============================================================
--  MAINFRAME — Phase 14 migration: Triple Timeline
--  ADDITIVE / idempotent — safe to run on a live database.
--  Run AFTER 01..09 (see RUN_ALL.md).
-- ------------------------------------------------------------
--  Adds the data behind src/pages/TripleTimeline.tsx:
--    - mf_events.category / .priority  (nullable, additive)
--    - mf_widget_layouts               (per-user layout prefs)
--    - RPCs for year/month/day reads, overlap detection, and
--      server-side sort/filter. All functions are SECURITY
--      INVOKER, so the caller's existing RLS on mf_events
--      applies automatically (operators see all; clients scope;
--      crew scope) — no new scoping logic to keep in sync.
-- ============================================================

alter table mf_events add column if not exists category text;
alter table mf_events add column if not exists priority text;

-- ---------- per-user widget layout prefs ----------
create table if not exists mf_widget_layouts (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  layout     jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

drop trigger if exists mf_widget_layouts_touch on mf_widget_layouts;
create trigger mf_widget_layouts_touch before update on mf_widget_layouts
  for each row execute function mf_touch_updated_at();

alter table mf_widget_layouts enable row level security;

-- Each user reads/writes only their own layout row.
drop policy if exists widget_layouts_self on mf_widget_layouts;
create policy widget_layouts_self on mf_widget_layouts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- realtime
do $$
begin
  execute 'alter publication supabase_realtime add table mf_widget_layouts';
exception when duplicate_object then null;
end $$;

-- ============================================================
--  RPCs — all SECURITY INVOKER so mf_events RLS applies.
--  Dates in mf_events are DATE columns; an event covers a period
--  when its [start, end] range intersects the requested window.
-- ============================================================

create or replace function get_events_for_year(p_year int)
returns setof mf_events language sql stable security invoker as $$
  select * from mf_events
  where start is not null
    and start <= make_date(p_year, 12, 31)
    and coalesce("end", start) >= make_date(p_year, 1, 1)
  order by start;
$$;

create or replace function get_events_for_month(p_year int, p_month int)
returns setof mf_events language sql stable security invoker as $$
  select * from mf_events
  where start is not null
    and start <= (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date
    and coalesce("end", start) >= make_date(p_year, p_month, 1)
  order by start;
$$;

create or replace function get_events_for_day(p_date date)
returns setof mf_events language sql stable security invoker as $$
  select * from mf_events
  where start is not null
    and start <= p_date
    and coalesce("end", start) >= p_date
  order by start;
$$;

-- Overlap detection over a window: every pair of events whose date ranges
-- intersect within [p_start, p_end]. Returns id pairs + the overlap span.
create or replace function get_overlapping_events(p_start timestamptz, p_end timestamptz)
returns table (a_id text, b_id text, a_name text, b_name text, overlap_start date, overlap_end date)
language sql stable security invoker as $$
  with win as (
    select * from mf_events
    where start is not null
      and start <= p_end::date
      and coalesce("end", start) >= p_start::date
  )
  select a.id, b.id, a.name, b.name,
         greatest(a.start, b.start) as overlap_start,
         least(coalesce(a."end", a.start), coalesce(b."end", b.start)) as overlap_end
  from win a
  join win b
    on a.id < b.id
   and a.start <= coalesce(b."end", b.start)
   and b.start <= coalesce(a."end", a.start)
  order by overlap_start;
$$;

-- Server-side sort. p_sort_by ∈ time|duration|category|priority|name.
create or replace function sort_events(p_sort_by text)
returns setof mf_events language sql stable security invoker as $$
  select * from mf_events
  order by
    case when p_sort_by = 'duration' then (coalesce("end", start) - start) end desc nulls last,
    case when p_sort_by = 'category' then category end asc nulls last,
    case when p_sort_by = 'priority' then priority end asc nulls last,
    case when p_sort_by = 'name'     then name end asc nulls last,
    start asc nulls last;
$$;

-- Server-side filter by category and/or priority (null arg = don't filter on it).
create or replace function filter_events(p_category text, p_priority text)
returns setof mf_events language sql stable security invoker as $$
  select * from mf_events
  where (p_category is null or category = p_category)
    and (p_priority is null or priority = p_priority)
  order by start;
$$;
