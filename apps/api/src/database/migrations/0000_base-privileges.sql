-- Base privileges (custom migration, runs as surefy_owner). Default privileges make every table
-- surefy_owner creates usable by the app role and every function closed to PUBLIC
-- (docs: plan/database/conventions-and-security.md, "Grants"). Append-only tables revoke
-- UPDATE/DELETE and definer functions grant EXECUTE in the migrations that create them.
alter default privileges for role surefy_owner in schema public
  grant select, insert, update, delete on tables to surefy_app;
--> statement-breakpoint
alter default privileges for role surefy_owner in schema public
  grant usage, select on sequences to surefy_app;
--> statement-breakpoint
-- Global on purpose: a per-schema default ACL starts empty, so revoking PUBLIC "in schema public"
-- changes nothing. Only the global entry removes the built-in EXECUTE grant to PUBLIC.
alter default privileges for role surefy_owner
  revoke execute on functions from public;
