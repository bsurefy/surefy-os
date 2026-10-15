-- Run stats: custom SQL (runs as surefy_owner). FORCE RLS on the rollup (docs:
-- plan/database/usage-budgets-and-audit.md, §8). Its `usage_rollup_state` row is created by the
-- first run that rebuilds it.
alter table run_stats_daily force row level security;
