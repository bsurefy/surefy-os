-- SPDX-License-Identifier: AGPL-3.0-only
-- Database bootstrap, part 2 (superuser, once per database): create the database, the vector
-- extension and the base grants. Migrations create everything else as surefy_owner.
-- Variable: db (the database name, for example surefy or surefy_s1_03_ui_layout).
set client_min_messages = warning;
select format('create database %I owner surefy_owner', :'db')
where not exists (select from pg_database where datname = :'db') \gexec

\connect :"db"
set client_min_messages = warning;
create extension if not exists vector;
select format('revoke all on database %I from public', :'db') \gexec
select format('revoke temporary on database %I from public', :'db') \gexec
select format('grant connect on database %I to surefy_app', :'db') \gexec
alter schema public owner to surefy_owner;
revoke create on schema public from public;
grant usage on schema public to surefy_app;
