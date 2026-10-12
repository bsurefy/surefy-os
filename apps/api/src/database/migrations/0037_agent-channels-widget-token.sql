-- Agent channels: custom SQL (runs as surefy_owner). The definer function that resolves a website
-- widget's token before the tenant is known (docs: plan/database/agents-and-runs.md, §4;
-- conventions-and-security.md, §6 and §12).
--
-- The widget endpoint hashes the presented token and calls this; no row means 401, whatever the
-- reason. A disconnected channel has no hash, and channels of organizations that are not active
-- never resolve. The caller opens the tenant and answers only when both statuses are `active`.
create or replace function agent_channel_resolve_token(p_token_hash bytea)
returns table (
  organization_id uuid,
  agent_id uuid,
  channel_id uuid,
  channel_status text,
  agent_status text
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set app.scope = 'system'
as $$
  select c.organization_id, c.agent_id, c.id, c.status, a.status
  from public.agent_channels c
  join public.agents a on a.organization_id = c.organization_id and a.id = c.agent_id
  join public.organizations o on o.id = c.organization_id
  where c.public_token_hash = p_token_hash
    and c.type = 'widget'
    and a.deleted_at is null
    and o.status = 'active'
  limit 1
$$;
--> statement-breakpoint
revoke execute on function agent_channel_resolve_token(bytea) from public;
--> statement-breakpoint
grant execute on function agent_channel_resolve_token(bytea) to surefy_app;
