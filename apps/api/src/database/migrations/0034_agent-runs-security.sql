-- Agent runs: custom SQL (runs as surefy_owner). FORCE RLS on agent_runs, the partitioned
-- append-only agent_run_steps parent with its checks, indexes and first partitions (docs:
-- plan/database/agents-and-runs.md, §5–6).
alter table agent_runs force row level security;
--> statement-breakpoint
create table agent_run_steps (
  id uuid not null default uuidv7(),
  organization_id uuid not null references organizations (id) on delete cascade,
  run_id uuid not null,
  seq integer not null,
  type text not null,
  name text not null,
  status text not null,
  input jsonb,
  output jsonb,
  model_key text,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_micros bigint not null default 0,
  currency char(3) not null default 'USD',
  confidence real,
  guard_band text,
  approval_id uuid,
  data_location text,
  error_code text,
  started_at timestamptz not null,
  finished_at timestamptz,
  duration_ms integer,
  created_at timestamptz not null,
  constraint agent_run_steps_pkey primary key (id, created_at),
  constraint agent_run_steps_run_id_seq_key unique (run_id, seq, created_at),
  constraint agent_run_steps_organization_id_run_id_fkey
    foreign key (organization_id, run_id) references agent_runs (organization_id, id) on delete cascade,
  constraint agent_run_steps_type_check
    check (type in ('retrieval', 'model', 'tool', 'decision', 'approval', 'guard', 'web_search')),
  constraint agent_run_steps_status_check
    check (status in ('succeeded', 'failed', 'skipped', 'waiting', 'blocked')),
  constraint agent_run_steps_guard_band_check
    check (guard_band in ('auto', 'double_check', 'human', 'blocked')),
  constraint agent_run_steps_data_location_check
    check (data_location in ('local', 'provider', 'platform')),
  constraint agent_run_steps_seq_check check (seq >= 1),
  constraint agent_run_steps_confidence_check check (confidence between 0 and 1),
  constraint agent_run_steps_counts_check
    check (input_tokens >= 0 and output_tokens >= 0 and cost_micros >= 0)
) partition by range (created_at);
--> statement-breakpoint
alter table agent_run_steps enable row level security;
--> statement-breakpoint
alter table agent_run_steps force row level security;
--> statement-breakpoint
create policy agent_run_steps_tenant_isolation on agent_run_steps as permissive for all
  using (organization_id = nullif(current_setting('app.org_id', true), '')::uuid
         or coalesce(current_setting('app.scope', true), '') = 'system')
  with check (organization_id = nullif(current_setting('app.org_id', true), '')::uuid
              or coalesce(current_setting('app.scope', true), '') = 'system');
--> statement-breakpoint
-- run detail
create index agent_run_steps_organization_id_run_id_idx
  on agent_run_steps (organization_id, run_id, seq);
--> statement-breakpoint
-- Guard impact preview, rollups, purge
create index agent_run_steps_organization_id_created_at_idx
  on agent_run_steps (organization_id, created_at);
--> statement-breakpoint
create index agent_run_steps_organization_id_approval_id_idx
  on agent_run_steps (organization_id, approval_id) where approval_id is not null;
--> statement-breakpoint
-- Append-only: the app role reads and inserts; partitions are reached only through the parent.
revoke update, delete, truncate on agent_run_steps from surefy_app;
--> statement-breakpoint
select ensure_partitions('agent_run_steps', 3);
