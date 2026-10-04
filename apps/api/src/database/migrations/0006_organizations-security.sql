-- Organizations, members and teams: custom SQL (runs as surefy_owner). FORCE RLS, the foreign
-- keys Drizzle cannot declare, and the definer functions for lookups made before the tenant is
-- known (docs: plan/database/conventions-and-security.md, §4–6; organizations-and-members.md).
alter table organizations force row level security;
--> statement-breakpoint
alter table organization_slug_history force row level security;
--> statement-breakpoint
alter table organization_members force row level security;
--> statement-breakpoint
alter table teams force row level security;
--> statement-breakpoint
alter table team_members force row level security;
--> statement-breakpoint
alter table invitations force row level security;
--> statement-breakpoint
alter table invitation_teams force row level security;
--> statement-breakpoint
alter table member_preferences force row level security;
--> statement-breakpoint
-- A member is charged to a team of their own organization only; deleting the team clears just
-- the primary team (Postgres 15+ column list).
alter table organization_members
  add constraint organization_members_organization_id_primary_team_id_fkey
  foreign key (organization_id, primary_team_id) references teams (organization_id, id)
  on delete set null (primary_team_id);
--> statement-breakpoint
-- Declared here, not in auth.tables.ts, so the two table files do not import each other.
alter table user_preferences
  add constraint user_preferences_last_organization_id_fkey
  foreign key (last_organization_id) references organizations (id) on delete set null;
--> statement-breakpoint
-- Setup, sign-up and Settings › General: false when an organization uses the slug or a retired
-- slug still redirects. Reserved slugs are checked in the application.
create or replace function organization_slug_available(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set app.scope = 'system'
as $$
  select not exists (select 1 from public.organizations o where o.slug = p_slug)
    and not exists (
      select 1 from public.organization_slug_history h
      where h.slug = p_slug and h.redirect_until > now()
    )
$$;
--> statement-breakpoint
revoke execute on function organization_slug_available(text) from public;
--> statement-breakpoint
grant execute on function organization_slug_available(text) to surefy_app;
--> statement-breakpoint
-- Workspace routing by slug: the current slug, or a retired one that still redirects. The caller
-- checks membership and answers 404 to non-members.
create or replace function organization_resolve_slug(p_slug text)
returns table (organization_id uuid, current_slug text, is_redirect boolean)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set app.scope = 'system'
as $$
  select o.id, o.slug, false from public.organizations o where o.slug = p_slug
  union all
  select o.id, o.slug, true
  from public.organization_slug_history h
  join public.organizations o on o.id = h.organization_id
  where h.slug = p_slug and h.redirect_until > now()
  limit 1
$$;
--> statement-breakpoint
revoke execute on function organization_resolve_slug(text) from public;
--> statement-breakpoint
grant execute on function organization_resolve_slug(text) to surefy_app;
--> statement-breakpoint
-- The organization limit (ADR 0016): every organization row, whatever its status.
create or replace function install_organization_count()
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set app.scope = 'system'
as $$
  select count(*)::integer from public.organizations
$$;
--> statement-breakpoint
revoke execute on function install_organization_count() from public;
--> statement-breakpoint
grant execute on function install_organization_count() to surefy_app;
--> statement-breakpoint
-- The invitation link: any status, so the screen can explain expired or revoked links; only
-- invitations of active organizations.
create or replace function invitation_resolve_token(p_token_hash bytea)
returns table (
  invitation_id uuid,
  organization_id uuid,
  organization_name text,
  organization_slug text,
  organization_logo_object_key text,
  email text,
  role text,
  status text,
  expires_at timestamptz,
  invited_by_name text
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set app.scope = 'system'
as $$
  select i.id, o.id, o.name, o.slug, o.logo_object_key, i.email, i.role, i.status, i.expires_at,
    u.name
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  left join public.users u on u.id = i.invited_by_user_id
  where i.token_hash = p_token_hash and o.status = 'active'
  limit 1
$$;
--> statement-breakpoint
revoke execute on function invitation_resolve_token(bytea) from public;
--> statement-breakpoint
grant execute on function invitation_resolve_token(bytea) to surefy_app;
--> statement-breakpoint
-- Pending invitations of a verified address ("No organization" screen): only when a users row
-- with that verified email exists, only pending, unexpired invitations of active organizations.
create or replace function invitation_list_for_email(p_email text)
returns table (
  invitation_id uuid,
  organization_id uuid,
  organization_name text,
  organization_slug text,
  role text,
  expires_at timestamptz,
  invited_by_name text
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set app.scope = 'system'
as $$
  select i.id, o.id, o.name, o.slug, i.role, i.expires_at, u.name
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  left join public.users u on u.id = i.invited_by_user_id
  where i.email = p_email
    and i.status = 'pending'
    and i.expires_at > now()
    and o.status = 'active'
    and exists (select 1 from public.users v where v.email = p_email and v.email_verified)
  order by i.created_at, i.id
$$;
--> statement-breakpoint
revoke execute on function invitation_list_for_email(text) from public;
--> statement-breakpoint
grant execute on function invitation_list_for_email(text) to surefy_app;
--> statement-breakpoint
-- The sign-up policy: an address with a pending, unexpired invitation of an active organization
-- may create an account even when public sign-up is closed. Returns nothing else.
create or replace function invitation_pending_for_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set app.scope = 'system'
as $$
  select exists (
    select 1
    from public.invitations i
    join public.organizations o on o.id = i.organization_id
    where i.email = p_email
      and i.status = 'pending'
      and i.expires_at > now()
      and o.status = 'active'
  )
$$;
--> statement-breakpoint
revoke execute on function invitation_pending_for_email(text) from public;
--> statement-breakpoint
grant execute on function invitation_pending_for_email(text) to surefy_app;
