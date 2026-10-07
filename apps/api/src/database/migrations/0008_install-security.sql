-- Install settings and administrators: custom SQL (runs as surefy_owner). The settings row that
-- always exists, and the definer functions setup and Settings › Install call before or across
-- organizations (docs: plan/database/organizations-and-members.md, §9–10;
-- conventions-and-security.md, "Catalog of functions").
insert into install_settings (id) values (1) on conflict do nothing;
--> statement-breakpoint
-- First-run setup: complete once it was finished or any organization exists. POST /setup calls it
-- under pg_advisory_xact_lock(hashtext('surefy:setup')).
create or replace function setup_is_complete()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set app.scope = 'system'
as $$
  select exists (
      select 1 from public.install_settings s where s.setup_completed_at is not null
    )
    or exists (select 1 from public.organizations o)
$$;
--> statement-breakpoint
revoke execute on function setup_is_complete() from public;
--> statement-breakpoint
grant execute on function setup_is_complete() to surefy_app;
--> statement-breakpoint
-- Settings › Install: every organization on the install, keyset on id. The API checks
-- install_admins before calling it. The logo key lets the API sign the logo URL.
create or replace function install_list_organizations(p_after uuid, p_limit integer)
returns table (
  organization_id uuid,
  name text,
  slug text,
  status text,
  logo_object_key text,
  active_member_count integer,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set app.scope = 'system'
as $$
  select o.id, o.name, o.slug, o.status, o.logo_object_key,
    (
      select count(*)::integer from public.organization_members m
      where m.organization_id = o.id and m.status = 'active'
    ),
    o.created_at
  from public.organizations o
  where p_after is null or o.id > p_after
  order by o.id
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
$$;
--> statement-breakpoint
revoke execute on function install_list_organizations(uuid, integer) from public;
--> statement-breakpoint
grant execute on function install_list_organizations(uuid, integer) to surefy_app;
