-- Approvals: custom SQL (runs as surefy_owner). FORCE RLS on both tables (docs:
-- plan/database/guard-and-approvals.md, §4–5).
alter table approvals force row level security;
--> statement-breakpoint
alter table approval_assignees force row level security;
