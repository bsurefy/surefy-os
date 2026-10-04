-- SPDX-License-Identifier: AGPL-3.0-only
-- Database bootstrap, part 1 (superuser, once per server): the two SurefyOS roles.
-- Neither is a superuser or bypasses row-level security (docs: database conventions, Roles).
-- Variables: owner_password, app_password.
select format('create role surefy_owner login password %L nosuperuser nocreatedb nocreaterole nobypassrls', :'owner_password')
where not exists (select from pg_roles where rolname = 'surefy_owner') \gexec

select format('create role surefy_app login password %L nosuperuser nocreatedb nocreaterole nobypassrls', :'app_password')
where not exists (select from pg_roles where rolname = 'surefy_app') \gexec

-- Definer functions declare `SET app.scope = 'system'`. Since Postgres 15 a non-superuser may
-- attach a custom parameter to a function only with the SET privilege on it.
grant set on parameter app.scope to surefy_owner;
-- The audit functions (`audit_seal`, `purge_organization`) declare `SET app.audit_maintenance =
-- 'on'`, the only way past the append-only trigger of `audit_logs`.
grant set on parameter app.audit_maintenance to surefy_owner;
