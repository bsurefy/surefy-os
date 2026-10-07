-- Usage: custom SQL (runs as surefy_owner). FORCE RLS on the rollups, the partitioned append-only
-- usage_events parent with its checks and indexes, its first partitions, and the rollup state rows
-- (docs: plan/database/usage-budgets-and-audit.md, §1, §6–7, §10).
alter table usage_daily force row level security;
--> statement-breakpoint
alter table usage_monthly force row level security;
--> statement-breakpoint
alter table usage_rollup_state force row level security;
--> statement-breakpoint
create table usage_events (
  id uuid not null default uuidv7(),
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id uuid,
  team_id uuid,
  api_key_id uuid,
  source_module text not null,
  subject_type text,
  subject_id uuid,
  source_ref_id uuid,
  kind text not null,
  model_key text not null,
  vault_model_id uuid,
  credential_id uuid,
  credential_scope text not null,
  provider_key text not null,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cached_input_tokens bigint not null default 0,
  reasoning_tokens bigint not null default 0,
  units bigint not null default 0,
  cost_micros bigint not null default 0,
  currency char(3) not null default 'USD',
  billed_via text not null,
  latency_ms integer,
  outcome text not null,
  error_code text,
  routed boolean not null default false,
  fallback_from_model_key text,
  pii_masked boolean not null default false,
  data_location text not null,
  dedupe_key text not null,
  request_id text,
  created_at timestamptz not null,
  constraint usage_events_pkey primary key (id, created_at),
  constraint usage_events_organization_id_dedupe_key_key unique (organization_id, dedupe_key, created_at),
  constraint usage_events_source_module_check
    check (source_module in ('chat', 'agent', 'flow', 'knowledge', 'decision', 'routing', 'train', 'search')),
  constraint usage_events_subject_type_check check (subject_type in ('agent', 'flow')),
  constraint usage_events_kind_check
    check (kind in ('generation', 'embedding', 'decision', 'web_search', 'speech', 'training')),
  constraint usage_events_credential_scope_check
    check (credential_scope in ('organization', 'team', 'personal', 'local', 'platform')),
  constraint usage_events_billed_via_check
    check (billed_via in ('provider_direct', 'local', 'platform_credits')),
  constraint usage_events_outcome_check check (outcome in ('success', 'error', 'aborted', 'blocked')),
  constraint usage_events_data_location_check check (data_location in ('local', 'provider', 'platform')),
  constraint usage_events_billing_check
    check ((billed_via = 'local') = (credential_scope = 'local')
           and (billed_via = 'platform_credits') = (credential_scope = 'platform')),
  constraint usage_events_subject_check check ((subject_type is null) = (subject_id is null)),
  constraint usage_events_counts_check
    check (input_tokens >= 0 and output_tokens >= 0 and cached_input_tokens >= 0
           and reasoning_tokens >= 0 and units >= 0 and cost_micros >= 0)
) partition by range (created_at);
--> statement-breakpoint
alter table usage_events enable row level security;
--> statement-breakpoint
alter table usage_events force row level security;
--> statement-breakpoint
create policy usage_events_tenant_isolation on usage_events as permissive for all
  using (organization_id = nullif(current_setting('app.org_id', true), '')::uuid
         or coalesce(current_setting('app.scope', true), '') = 'system')
  with check (organization_id = nullif(current_setting('app.org_id', true), '')::uuid
              or coalesce(current_setting('app.scope', true), '') = 'system');
--> statement-breakpoint
create index usage_events_organization_id_created_at_idx on usage_events (organization_id, created_at);
--> statement-breakpoint
create index usage_events_organization_id_user_id_created_at_idx
  on usage_events (organization_id, user_id, created_at);
--> statement-breakpoint
-- Append-only: the app role reads and inserts; partitions are reached only through the parent.
revoke update, delete, truncate on usage_events from surefy_app;
--> statement-breakpoint
select ensure_partitions('usage_events', 3);
--> statement-breakpoint
-- Global bookkeeping rows; '-infinity' makes the first run aggregate every event.
set local app.scope = 'system';
--> statement-breakpoint
insert into usage_rollup_state (rollup, watermark)
values ('usage_daily', '-infinity'), ('usage_monthly', '-infinity')
on conflict do nothing;
