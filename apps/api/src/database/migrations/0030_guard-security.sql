-- Guard: custom SQL (runs as surefy_owner). FORCE RLS on all four tables, and the unique indexes
-- on the personal-data rules (Drizzle cannot declare `nulls not distinct` on a partial index; docs:
-- plan/database/guard-and-approvals.md, §3).
alter table guard_settings force row level security;
--> statement-breakpoint
alter table guardrails force row level security;
--> statement-breakpoint
alter table pii_filter_rules force row level security;
--> statement-breakpoint
alter table guard_stats_daily force row level security;
--> statement-breakpoint
-- one organization row per built-in type, one exception per type in each team and agent
create unique index pii_filter_rules_builtin_key
  on pii_filter_rules (organization_id, scope, team_id, agent_id, pii_type)
  nulls not distinct
  where pii_type <> 'custom';
--> statement-breakpoint
-- the same for custom types, by label ignoring case
create unique index pii_filter_rules_custom_key
  on pii_filter_rules (organization_id, scope, team_id, agent_id, lower(custom_label))
  nulls not distinct
  where pii_type = 'custom';
