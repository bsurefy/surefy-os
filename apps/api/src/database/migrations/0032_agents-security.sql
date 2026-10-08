-- Agents: custom SQL (runs as surefy_owner). FORCE RLS on all three tables, the deferred pointer
-- to the live version (a publish inserts the version and points at it in one transaction), and
-- the immutable versions (docs: plan/database/agents-and-runs.md, §1–3).
alter table agents force row level security;
--> statement-breakpoint
alter table agent_versions force row level security;
--> statement-breakpoint
alter table agent_access force row level security;
--> statement-breakpoint
alter table agents alter constraint agents_live_version_id_agent_versions_id_fk
  deferrable initially deferred;
--> statement-breakpoint
-- Versions are only inserted and read; they disappear through the cascade from agents (referential
-- actions run as the table owner).
revoke update, delete, truncate on agent_versions from surefy_app;
