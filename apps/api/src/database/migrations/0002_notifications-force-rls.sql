-- FORCE RLS for notifications (custom migration, runs as surefy_owner): the owner role is bound
-- by the tenant policy too (docs: plan/database/conventions-and-security.md, "FORCE RLS").
alter table notifications force row level security;
