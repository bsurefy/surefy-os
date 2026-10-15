-- Budgets: custom SQL (runs as surefy_owner). FORCE RLS on the budgets and their alerts (docs:
-- plan/database/usage-budgets-and-audit.md, §2–3).
alter table budgets force row level security;
--> statement-breakpoint
alter table budget_alerts force row level security;
