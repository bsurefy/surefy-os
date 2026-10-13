-- Agent channels: custom SQL (runs as surefy_owner). The definer function that resolves an
-- inbound Slack or WhatsApp event before the tenant is known (docs: plan/database/
-- agents-and-runs.md, §4; conventions-and-security.md, §6).
--
-- The account is Slack `{team_id}/{bot_user_id}` or the WhatsApp phone number id, lowercase. A
-- disconnected channel never resolves, and neither do channels of organizations that are not
-- active. The caller opens the tenant, checks the event's signature and answers only when both
-- statuses are `active`.
create or replace function agent_channel_resolve_external(p_type text, p_account text)
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
  where c.type = p_type
    and p_type in ('slack', 'whatsapp')
    and c.external_account_id = lower(p_account)
    and c.status <> 'disconnected'
    and a.deleted_at is null
    and o.status = 'active'
  limit 1
$$;
--> statement-breakpoint
revoke execute on function agent_channel_resolve_external(text, text) from public;
--> statement-breakpoint
grant execute on function agent_channel_resolve_external(text, text) to surefy_app;
