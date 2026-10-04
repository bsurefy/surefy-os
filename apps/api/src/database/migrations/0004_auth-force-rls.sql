-- FORCE RLS for user_preferences (custom migration, runs as surefy_owner): the owner role is bound
-- by the self policy too (docs: plan/database/conventions-and-security.md, "FORCE RLS").
alter table user_preferences force row level security;
