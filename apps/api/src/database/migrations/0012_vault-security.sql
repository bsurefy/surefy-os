-- Vault and models: custom SQL (runs as surefy_owner). FORCE RLS, the partial unique index on
-- primary AI keys (Drizzle cannot declare `nulls not distinct` on a partial index), and the
-- settings row every existing organization needs (docs: plan/database/vault-and-models.md, §1–5).
alter table organization_keys force row level security;
--> statement-breakpoint
alter table vault_credentials force row level security;
--> statement-breakpoint
alter table vault_models force row level security;
--> statement-breakpoint
alter table model_access_rules force row level security;
--> statement-breakpoint
alter table vault_settings force row level security;
--> statement-breakpoint
-- One primary AI key per provider and scope (organization, a team, or one person).
create unique index vault_credentials_primary_ai_key
  on vault_credentials (organization_id, provider_key, scope, team_id, owner_user_id)
  nulls not distinct
  where kind = 'ai_provider' and is_primary;
--> statement-breakpoint
-- New organizations get their row in the creation transaction; these are the ones that already exist.
set local app.scope = 'system';
--> statement-breakpoint
insert into vault_settings (organization_id)
select id from organizations
on conflict do nothing;
