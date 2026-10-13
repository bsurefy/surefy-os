-- Connections: custom SQL (runs as surefy_owner). FORCE RLS and the unique index on the connected
-- account (Drizzle cannot declare `nulls not distinct` on a partial index; docs:
-- plan/database/bridge-and-connections.md, §1).
alter table connections force row level security;
--> statement-breakpoint
-- The same account is reconnected, not added twice in one scope. Revoked rows and connections
-- without a known account (an open API, a pasted key) do not take part.
create unique index connections_external_account_key
  on connections (organization_id, provider_key, external_account_id, scope, team_id, owner_user_id)
  nulls not distinct
  where status <> 'revoked' and external_account_id is not null;
