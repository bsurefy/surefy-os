-- API keys: custom SQL (runs as surefy_owner). FORCE RLS and the definer function that resolves a
-- key before the tenant is known (docs: plan/database/access-and-entitlements.md, §2;
-- conventions-and-security.md, §4 and §6).
alter table api_keys force row level security;
--> statement-breakpoint
-- The session plugin hashes the presented key and calls this; no row means 401, whatever the
-- reason. Revoked keys have no hash, and keys of suspended or deleted organizations never resolve.
create or replace function auth_resolve_api_key(p_key_hash bytea)
returns table (api_key_id uuid, organization_id uuid, scopes text[], expires_at timestamptz)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set app.scope = 'system'
as $$
  select k.id, k.organization_id, k.scopes, k.expires_at
  from public.api_keys k
  join public.organizations o on o.id = k.organization_id
  where k.key_hash = p_key_hash
    and k.status = 'active'
    and (k.expires_at is null or k.expires_at > now())
    and o.status = 'active'
  limit 1
$$;
--> statement-breakpoint
revoke execute on function auth_resolve_api_key(bytea) from public;
--> statement-breakpoint
grant execute on function auth_resolve_api_key(bytea) to surefy_app;
