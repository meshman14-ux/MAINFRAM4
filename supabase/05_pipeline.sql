-- ============================================================
--  MAINFRAME — Phase 8 migration: Sales Pipeline (CRM)
--  ADDITIVE — safe to run on a live production database.
--  Does not touch 01/02/03; run this AFTER them (in order).
-- ------------------------------------------------------------
--  Ported from the original Pipeline.dc.html prototype:
--  lead -> contacted -> diagnostic -> proposal -> won, with a
--  'lost' side-branch reachable from (and returning to) any stage.
--  Deliberately does NOT depend on the Client Diagnostic tool
--  (deferred / advisory layer) — a lead can move through every
--  stage ungraded; scoring can be layered in later without a
--  schema change.
-- ============================================================

create table if not exists mf_pipeline (
  id          text primary key,
  name        text not null,                 -- prospect/lead name (free text until won)
  client_id   text references mf_clients(id) on delete set null,  -- set once resolved/created
  stage       text not null default 'lead',  -- lead|contacted|diagnostic|proposal|won|lost
  prior_stage text,                           -- remembered stage so 'lost' can be reopened
  value       numeric,                        -- deal value, £
  next_step   text,                           -- free-text next action
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists mf_pipeline_client_idx on mf_pipeline(client_id);
create index if not exists mf_pipeline_stage_idx  on mf_pipeline(stage);

-- auto-touch updated_at (reuses the function created in 01_schema.sql)
drop trigger if exists mf_pipeline_touch on mf_pipeline;
create trigger mf_pipeline_touch before update on mf_pipeline
  for each row execute function mf_touch_updated_at();

-- ---------- RLS: operators ONLY. The pipeline is confidential ----------
-- business-development data — crew and clients must never see it,
-- unlike every other table which has some crew/client read path.
alter table mf_pipeline enable row level security;

drop policy if exists pipeline_operator_all on mf_pipeline;
create policy pipeline_operator_all on mf_pipeline
  for all using (mf_is_operator()) with check (mf_is_operator());

-- ---------- realtime ----------
do $$
begin
  execute 'alter publication supabase_realtime add table mf_pipeline;';
exception when duplicate_object then null;
end $$;
