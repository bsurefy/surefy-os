-- Access, audit and data control: custom SQL (runs as surefy_owner). FORCE RLS, the partitioned
-- append-only audit log with its triggers, and the maintenance definer functions (docs:
-- plan/database/conventions-and-security.md, §6–9; usage-budgets-and-audit.md, §4–5;
-- platform-and-jobs.md, §7).
alter table access_policies force row level security;
--> statement-breakpoint
alter table audit_chain_heads force row level security;
--> statement-breakpoint
alter table data_requests force row level security;
--> statement-breakpoint
alter table exports force row level security;
--> statement-breakpoint
alter table organization_purges force row level security;
--> statement-breakpoint
-- Written only by audit_seal; Guard's integrity status reads it.
revoke insert, update, delete, truncate on audit_chain_heads from surefy_app;
--> statement-breakpoint
create table audit_logs (
  id uuid not null default uuidv7(),
  organization_id uuid not null references organizations (id) on delete cascade,
  actor_type text not null,
  actor_user_id uuid,
  actor_api_key_id uuid,
  actor_ref_id uuid,
  via text not null,
  access_grant_id uuid,
  partner_id uuid,
  action text not null,
  target_type text not null,
  target_id uuid,
  outcome text not null,
  metadata jsonb not null default '{}'::jsonb,
  reason text,
  model_key text,
  confidence real,
  request_id text,
  ip inet,
  user_agent text,
  entry_hash bytea not null,
  chain_seq bigint,
  chain_hash bytea,
  sealed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint audit_logs_pkey primary key (id, created_at),
  constraint audit_logs_actor_type_check
    check (actor_type in ('user', 'api_key', 'agent', 'flow', 'system', 'support', 'partner')),
  constraint audit_logs_via_check check (via in ('user', 'api-key', 'support', 'partner', 'system')),
  constraint audit_logs_outcome_check check (outcome in ('success', 'denied', 'failed')),
  constraint audit_logs_grant_check
    check ((via in ('support', 'partner')) = (access_grant_id is not null)),
  constraint audit_logs_seal_check check (num_nulls(chain_seq, chain_hash, sealed_at) in (0, 3)),
  constraint audit_logs_confidence_check check (confidence is null or confidence between 0 and 1)
) partition by range (created_at);
--> statement-breakpoint
alter table audit_logs enable row level security;
--> statement-breakpoint
alter table audit_logs force row level security;
--> statement-breakpoint
create policy audit_logs_tenant_isolation on audit_logs as permissive for all
  using (organization_id = nullif(current_setting('app.org_id', true), '')::uuid
         or coalesce(current_setting('app.scope', true), '') = 'system')
  with check (organization_id = nullif(current_setting('app.org_id', true), '')::uuid
              or coalesce(current_setting('app.scope', true), '') = 'system');
--> statement-breakpoint
create index audit_logs_organization_id_created_at_idx
  on audit_logs (organization_id, created_at desc, id desc);
--> statement-breakpoint
create index audit_logs_organization_id_actor_user_id_idx
  on audit_logs (organization_id, actor_user_id, created_at desc);
--> statement-breakpoint
create index audit_logs_organization_id_target_idx
  on audit_logs (organization_id, target_type, target_id, created_at desc);
--> statement-breakpoint
create index audit_logs_organization_id_action_idx
  on audit_logs (organization_id, action, created_at desc);
--> statement-breakpoint
create index audit_logs_unsealed_idx
  on audit_logs (organization_id, created_at, id) where chain_seq is null;
--> statement-breakpoint
create index audit_logs_organization_id_chain_seq_idx
  on audit_logs (organization_id, chain_seq) where chain_seq is not null;
--> statement-breakpoint
-- Layer 1: the app role reads and inserts only.
revoke update, delete, truncate on audit_logs from surefy_app;
--> statement-breakpoint
-- Layer 2: no UPDATE or DELETE for anyone unless a maintenance function set
-- app.audit_maintenance; an UPDATE may only fill the seal columns, and only from null.
create or replace function audit_logs_immutable() returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if coalesce(current_setting('app.audit_maintenance', true), '') <> 'on' then
    raise exception 'audit_logs is append-only' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if old.chain_seq is not null or old.chain_hash is not null or old.sealed_at is not null then
    raise exception 'audit_logs: row % is already sealed', old.id using errcode = 'insufficient_privilege';
  end if;
  if (to_jsonb(new) - array['chain_seq', 'chain_hash', 'sealed_at'])
     is distinct from (to_jsonb(old) - array['chain_seq', 'chain_hash', 'sealed_at']) then
    raise exception 'audit_logs: only seal columns may change' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;
--> statement-breakpoint
revoke execute on function audit_logs_immutable() from public;
--> statement-breakpoint
create trigger audit_logs_immutable
  before update or delete on audit_logs
  for each row execute function audit_logs_immutable();
--> statement-breakpoint
create or replace function audit_logs_no_truncate() returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  raise exception 'audit_logs cannot be truncated' using errcode = 'insufficient_privilege';
end
$$;
--> statement-breakpoint
revoke execute on function audit_logs_no_truncate() from public;
--> statement-breakpoint
create trigger audit_logs_no_truncate
  before truncate on audit_logs
  for each statement execute function audit_logs_no_truncate();
--> statement-breakpoint
-- Monthly partitions `<parent>_pYYYY_MM` for this month and p_months_ahead more, plus the
-- DEFAULT partition; returns how many were created and how many rows sit in the default one.
create or replace function ensure_partitions(p_parent regclass, p_months_ahead integer default 3)
returns table (created integer, default_rows bigint)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set app.scope = 'system'
set TimeZone = 'UTC'
as $$
declare
  v_parent text;
  v_month timestamptz := date_trunc('month', now());
  v_from timestamptz;
  v_name text;
  v_created integer := 0;
  v_default_rows bigint;
begin
  select c.relname into v_parent
  from pg_class c
  join pg_partitioned_table pt on pt.partrelid = c.oid
  join pg_attribute a on a.attrelid = c.oid and a.attnum = pt.partattrs[0]
  where c.oid = p_parent and c.relnamespace = 'public'::regnamespace
    and pt.partstrat = 'r' and pt.partnatts = 1 and a.attname = 'created_at';
  if v_parent is null then
    raise exception 'ensure_partitions: % is not a monthly partitioned table', p_parent;
  end if;
  if p_months_ahead not between 1 and 12 then
    raise exception 'ensure_partitions: months ahead must be between 1 and 12';
  end if;

  for i in 0..p_months_ahead loop
    v_from := v_month + make_interval(months => i);
    v_name := format('%s_p%s', v_parent, to_char(v_from, 'YYYY_MM'));
    if to_regclass(format('public.%I', v_name)) is null then
      -- fails if the DEFAULT partition holds rows of this month: the job's alert fires first
      execute format('create table public.%I partition of public.%I for values from (%L) to (%L)',
                     v_name, v_parent, v_from, v_from + interval '1 month');
      execute format('revoke all on table public.%I from public, surefy_app', v_name);
      v_created := v_created + 1;
    end if;
  end loop;

  if to_regclass(format('public.%I', v_parent || '_default')) is null then
    execute format('create table public.%I partition of public.%I default', v_parent || '_default', v_parent);
    execute format('revoke all on table public.%I from public, surefy_app', v_parent || '_default');
  end if;
  execute format('select count(*) from public.%I', v_parent || '_default') into v_default_rows;

  return query select v_created, v_default_rows;
end
$$;
--> statement-breakpoint
revoke execute on function ensure_partitions(regclass, integer) from public;
--> statement-breakpoint
grant execute on function ensure_partitions(regclass, integer) to surefy_app;
--> statement-breakpoint
-- Detaches and drops the monthly partitions that end at or before date_trunc('month', now() -
-- p_keep). The only sanctioned way to bypass the row triggers; refuses a keep below the floor.
create or replace function drop_expired_partitions(p_parent regclass, p_keep interval)
returns setof text
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set app.scope = 'system'
set TimeZone = 'UTC'
as $$
declare
  v_parent text;
  v_floor interval;
  v_cutoff timestamptz;
  v_part text;
  v_upper timestamptz;
begin
  select c.relname into v_parent
  from pg_class c
  join pg_partitioned_table pt on pt.partrelid = c.oid
  join pg_attribute a on a.attrelid = c.oid and a.attnum = pt.partattrs[0]
  where c.oid = p_parent and c.relnamespace = 'public'::regnamespace
    and pt.partstrat = 'r' and pt.partnatts = 1 and a.attname = 'created_at';
  if v_parent is null then
    raise exception 'drop_expired_partitions: % is not a monthly partitioned table', p_parent;
  end if;
  v_floor := case v_parent
    when 'audit_logs' then interval '1 year'
    when 'usage_events' then interval '13 months'
    else interval '90 days'
  end;
  if p_keep is null or p_keep < v_floor then
    raise exception 'drop_expired_partitions: keep % is below the floor % of %', p_keep, v_floor, v_parent;
  end if;
  v_cutoff := date_trunc('month', now() - p_keep);

  for v_part in
    select c.relname
    from pg_inherits i
    join pg_class c on c.oid = i.inhrelid
    where i.inhparent = p_parent
      and c.relname ~ ('^' || v_parent || '_p[0-9]{4}_[0-9]{2}$')
    order by c.relname
  loop
    v_upper := to_timestamp(right(v_part, 7), 'YYYY_MM') + interval '1 month';
    if v_upper <= v_cutoff then
      execute format('alter table public.%I detach partition public.%I', v_parent, v_part);
      execute format('drop table public.%I', v_part);
      return next v_part;
    end if;
  end loop;
end
$$;
--> statement-breakpoint
revoke execute on function drop_expired_partitions(regclass, interval) from public;
--> statement-breakpoint
grant execute on function drop_expired_partitions(regclass, interval) to surefy_app;
--> statement-breakpoint
-- Seals new audit rows per organization: chain_seq 1, 2, 3… and chain_hash = sha256(previous
-- chain_hash || int8send(chain_seq) || entry_hash), from 32 zero bytes. The chain order is the
-- seal order; another sealer holding an organization's head makes this one skip it.
create or replace function audit_seal(p_limit integer default 5000)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set app.scope = 'system'
set app.audit_maintenance = 'on'
as $$
declare
  v_org uuid;
  v_seq bigint;
  v_hash bytea;
  v_total integer := 0;
  r record;
begin
  if p_limit not between 1 and 100000 then
    raise exception 'audit_seal: limit must be between 1 and 100000';
  end if;
  for v_org in
    select distinct a.organization_id from public.audit_logs a where a.chain_seq is null
  loop
    insert into public.audit_chain_heads (organization_id, last_seq, last_hash)
    values (v_org, 0, decode(repeat('00', 32), 'hex'))
    on conflict (organization_id) do nothing;

    select h.last_seq, h.last_hash into v_seq, v_hash
    from public.audit_chain_heads h
    where h.organization_id = v_org
    for update skip locked;
    continue when not found;

    for r in
      select a.id, a.created_at, a.entry_hash
      from public.audit_logs a
      where a.organization_id = v_org and a.chain_seq is null
      order by a.created_at, a.id
      limit p_limit
    loop
      v_seq := v_seq + 1;
      v_hash := sha256(v_hash || int8send(v_seq) || r.entry_hash);
      update public.audit_logs
      set chain_seq = v_seq, chain_hash = v_hash, sealed_at = now()
      where id = r.id and created_at = r.created_at;
      v_total := v_total + 1;
    end loop;

    update public.audit_chain_heads
    set last_seq = v_seq, last_hash = v_hash, last_sealed_at = now(), updated_at = now()
    where organization_id = v_org;
  end loop;
  return v_total;
end
$$;
--> statement-breakpoint
revoke execute on function audit_seal(integer) from public;
--> statement-breakpoint
grant execute on function audit_seal(integer) to surefy_app;
--> statement-breakpoint
-- Deletes an organization past its 30-day hold: the partitioned tables partition by partition,
-- then the organization row (every table with a cascading foreign key follows). Runs only for a
-- `running` purge record of a `deletion_scheduled` organization whose hold has passed; a legal
-- hold (an extension table referencing the organization with RESTRICT) aborts it at step 3.
create or replace function purge_organization(p_organization_id uuid, p_purge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set app.scope = 'system'
set app.audit_maintenance = 'on'
as $$
declare
  v_tables jsonb := '{}'::jsonb;
  v_partitioned jsonb := '{}'::jsonb;
  v_counts jsonb;
  v_n bigint;
  r record;
  p record;
begin
  perform 1 from public.organization_purges op
  where op.id = p_purge_id and op.organization_id = p_organization_id and op.status = 'running'
  for update;
  if not found then
    raise exception 'purge % is not running for %', p_purge_id, p_organization_id;
  end if;

  perform 1 from public.organizations o
  where o.id = p_organization_id and o.status = 'deletion_scheduled'
    and o.deletion_scheduled_for <= now()
  for update;
  if not found then
    raise exception 'organization % is not due for purge', p_organization_id;
  end if;

  -- 1. partitioned tables that reference organizations, partition by partition
  for r in
    select c.oid::regclass as parent, c.relname
    from pg_constraint fk join pg_class c on c.oid = fk.conrelid
    where fk.contype = 'f' and fk.confrelid = 'public.organizations'::regclass and c.relkind = 'p'
  loop
    for p in
      select i.inhrelid::regclass as part, pc.relname
      from pg_inherits i join pg_class pc on pc.oid = i.inhrelid
      where i.inhparent = r.parent
    loop
      execute format('delete from %s where organization_id = $1', p.part) using p_organization_id;
      get diagnostics v_n = row_count;
      if v_n > 0 then
        v_partitioned := v_partitioned || jsonb_build_object(p.relname, v_n);
      end if;
    end loop;
  end loop;

  -- 2. rows of every other table that cascades from organizations, counted before the delete
  for r in
    select c.relname, a.attname
    from pg_constraint fk
    join pg_class c on c.oid = fk.conrelid
    join pg_attribute a on a.attrelid = c.oid and a.attnum = fk.conkey[1]
    where fk.contype = 'f' and fk.confrelid = 'public.organizations'::regclass
      and fk.confdeltype = 'c' and c.relkind = 'r' and not c.relispartition
  loop
    execute format('select count(*) from public.%I where %I = $1', r.relname, r.attname)
      into v_n using p_organization_id;
    if v_n > 0 then
      v_tables := v_tables || jsonb_build_object(r.relname, v_n);
    end if;
  end loop;

  -- 3. the organization row; every other tenant row cascades (a legal hold aborts here)
  delete from public.organizations where id = p_organization_id;
  v_tables := v_tables || jsonb_build_object('organizations', 1);

  v_counts := jsonb_build_object('version', 1, 'tables', v_tables, 'partitionedTables', v_partitioned);
  update public.organization_purges set rows_deleted = v_counts, updated_at = now()
  where id = p_purge_id;
  return v_counts;
end
$$;
--> statement-breakpoint
revoke execute on function purge_organization(uuid, uuid) from public;
--> statement-breakpoint
grant execute on function purge_organization(uuid, uuid) to surefy_app;
--> statement-breakpoint
select ensure_partitions('audit_logs', 3);
