-- Outbox and soft-delete purge: custom SQL (runs as surefy_owner). FORCE RLS on outbox_events and
-- the purge_soft_deleted definer function (docs: plan/database/platform-and-jobs.md, §1;
-- conventions-and-security.md, §6 and §10).
alter table outbox_events force row level security;
--> statement-breakpoint
-- Deletes up to p_limit rows of a soft-delete table deleted before p_before (children cascade) and,
-- in the same statement, writes one `<entity>.purged` outbox event per row whose handler removes
-- the stored objects. Knowledge events list the documents collected before the delete. Without an
-- organization, the cutoff must be at least 30 days back; agents and flows are tombstones, also
-- purged once no run references them.
create or replace function purge_soft_deleted(
  p_table regclass, p_before timestamptz,
  p_organization_id uuid default null, p_limit integer default 500)
returns table (organization_id uuid, id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set app.scope = 'system'
as $$
declare
  v_table text;
  v_extra text := '';
  v_payload text := $p$jsonb_build_object('version', 1, 'id', d.id)$p$;
begin
  select c.relname into v_table from pg_class c
  where c.oid = p_table and c.relnamespace = 'public'::regnamespace;
  if v_table is null or v_table <> all (array['chats', 'prompts', 'knowledge_bases',
                                               'knowledge_sources', 'agents', 'flows']) then
    raise exception 'purge_soft_deleted: % is not a soft-delete table', p_table;
  end if;
  if p_before > now() or (p_organization_id is null and p_before > now() - interval '30 days') then
    raise exception 'purge_soft_deleted: cutoff % is inside the restore window', p_before;
  end if;

  if v_table in ('agents', 'flows') then
    v_extra := format(' or not exists (select 1 from public.%I r where r.organization_id = t.organization_id and r.%I = t.id)',
                      left(v_table, -1) || '_runs', left(v_table, -1) || '_id');
  elsif v_table in ('knowledge_bases', 'knowledge_sources') then
    v_payload := format($p$jsonb_build_object('version', 1, 'id', d.id, 'documentIds', coalesce(
      (select jsonb_agg(k.id order by k.id) from public.knowledge_documents k
       where k.organization_id = d.organization_id and k.%I = d.id), '[]'::jsonb))$p$,
      case v_table when 'knowledge_bases' then 'knowledge_base_id' else 'source_id' end);
  end if;

  return query execute format($sql$
    with doomed as (
      select t.organization_id, t.id from public.%1$I t
      where t.deleted_at is not null
        and ($2::uuid is null or t.organization_id = $2)
        and (t.deleted_at < $1 %2$s)
      order by t.deleted_at
      limit $3
      for update skip locked
    ), events as (
      insert into public.outbox_events (organization_id, topic, payload, dedupe_key)
      select d.organization_id, %3$L, %4$s, %3$L || ':' || d.id from doomed d
      on conflict (topic, dedupe_key) where dedupe_key is not null do nothing
    )
    delete from public.%1$I t using doomed d
    where t.organization_id = d.organization_id and t.id = d.id
    returning t.organization_id, t.id
  $sql$, v_table, v_extra, rtrim(v_table, 's') || '.purged', v_payload)
  using p_before, p_organization_id, p_limit;
end
$$;
--> statement-breakpoint
revoke execute on function purge_soft_deleted(regclass, timestamptz, uuid, integer) from public;
--> statement-breakpoint
grant execute on function purge_soft_deleted(regclass, timestamptz, uuid, integer) to surefy_app;
