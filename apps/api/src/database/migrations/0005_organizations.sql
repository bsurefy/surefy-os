CREATE TABLE "invitation_teams" (
	"organization_id" uuid NOT NULL,
	"invitation_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_teams_pkey" PRIMARY KEY("invitation_id","team_id")
);
--> statement-breakpoint
ALTER TABLE "invitation_teams" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"delivery_status" text DEFAULT 'queued' NOT NULL,
	"invited_by_user_id" uuid,
	"expires_at" timestamp with time zone DEFAULT now() + interval '7 days' NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"last_sent_at" timestamp with time zone,
	"send_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "invitations_email_lower_check" CHECK ("invitations"."email" = lower("invitations"."email")),
	CONSTRAINT "invitations_role_check" CHECK ("invitations"."role" in ('user', 'builder', 'admin', 'owner')),
	CONSTRAINT "invitations_status_check" CHECK ("invitations"."status" in ('pending', 'accepted', 'revoked', 'expired')),
	CONSTRAINT "invitations_delivery_status_check" CHECK ("invitations"."delivery_status" in ('queued', 'sent', 'failed', 'bounced')),
	CONSTRAINT "invitations_token_hash_check" CHECK (octet_length("invitations"."token_hash") = 32),
	CONSTRAINT "invitations_accepted_check" CHECK ("invitations"."status" <> 'accepted' or "invitations"."accepted_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "member_preferences" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"default_model_key" text,
	"preferences" jsonb DEFAULT '{"version":1}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_preferences_pkey" PRIMARY KEY("organization_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "member_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"primary_team_id" uuid,
	"provisioning_source" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invited_by_user_id" uuid,
	"deactivated_at" timestamp with time zone,
	"deactivated_by_user_id" uuid,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_members_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "organization_members_organization_id_user_id_key" UNIQUE("organization_id","user_id"),
	CONSTRAINT "organization_members_role_check" CHECK ("organization_members"."role" in ('user', 'builder', 'admin', 'owner')),
	CONSTRAINT "organization_members_status_check" CHECK ("organization_members"."status" in ('active', 'deactivated')),
	CONSTRAINT "organization_members_provisioning_source_check" CHECK ("organization_members"."provisioning_source" in ('setup', 'invitation', 'scim', 'sso', 'partner', 'console')),
	CONSTRAINT "organization_members_deactivated_check" CHECK (("organization_members"."status" = 'deactivated') = ("organization_members"."deactivated_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "organization_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organization_slug_history" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"retired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"redirect_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_history_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "organization_slug_history_slug_format_check" CHECK ("organization_slug_history"."slug" ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$')
);
--> statement-breakpoint
ALTER TABLE "organization_slug_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_object_key" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"default_locale" text DEFAULT 'en' NOT NULL,
	"currency" char(3) DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"suspended_at" timestamp with time zone,
	"deletion_requested_at" timestamp with time zone,
	"deletion_scheduled_for" timestamp with time zone,
	"deletion_requested_by_user_id" uuid,
	"partner_id" uuid,
	"access_version" integer DEFAULT 1 NOT NULL,
	"settings" jsonb DEFAULT '{"version":1}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_format_check" CHECK ("organizations"."slug" ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'),
	CONSTRAINT "organizations_status_check" CHECK ("organizations"."status" in ('active', 'suspended', 'deletion_scheduled')),
	CONSTRAINT "organizations_deletion_check" CHECK ("organizations"."status" <> 'deletion_scheduled' or ("organizations"."deletion_requested_at" is not null and "organizations"."deletion_scheduled_for" is not null))
);
--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "team_members" (
	"organization_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"added_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_pkey" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "team_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"lead_user_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_organization_id_id_key" UNIQUE("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "teams" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invitation_teams" ADD CONSTRAINT "invitation_teams_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_teams" ADD CONSTRAINT "invitation_teams_organization_id_invitation_id_fkey" FOREIGN KEY ("organization_id","invitation_id") REFERENCES "public"."invitations"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_teams" ADD CONSTRAINT "invitation_teams_organization_id_team_id_fkey" FOREIGN KEY ("organization_id","team_id") REFERENCES "public"."teams"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_user_id_users_id_fk" FOREIGN KEY ("accepted_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_preferences" ADD CONSTRAINT "member_preferences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_preferences" ADD CONSTRAINT "member_preferences_organization_id_user_id_fkey" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."organization_members"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_deactivated_by_user_id_users_id_fk" FOREIGN KEY ("deactivated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_slug_history" ADD CONSTRAINT "organization_slug_history_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_deletion_requested_by_user_id_users_id_fk" FOREIGN KEY ("deletion_requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_organization_id_team_id_fkey" FOREIGN KEY ("organization_id","team_id") REFERENCES "public"."teams"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_organization_id_user_id_fkey" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."organization_members"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_lead_user_id_users_id_fk" FOREIGN KEY ("lead_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitation_teams_organization_id_invitation_id_idx" ON "invitation_teams" USING btree ("organization_id","invitation_id");--> statement-breakpoint
CREATE INDEX "invitation_teams_organization_id_team_id_idx" ON "invitation_teams" USING btree ("organization_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_organization_id_email_key" ON "invitations" USING btree ("organization_id","email") WHERE "invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "invitations" USING btree ("email") WHERE "invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "invitations_organization_id_created_at_id_idx" ON "invitations" USING btree ("organization_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "invitations_resolved_idx" ON "invitations" USING btree (coalesce("accepted_at", "revoked_at", "expires_at")) WHERE "invitations"."status" <> 'pending';--> statement-breakpoint
CREATE INDEX "invitations_invited_by_user_id_idx" ON "invitations" USING btree ("invited_by_user_id") WHERE "invitations"."invited_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "invitations_accepted_user_id_idx" ON "invitations" USING btree ("accepted_user_id") WHERE "invitations"."accepted_user_id" is not null;--> statement-breakpoint
CREATE INDEX "invitations_revoked_by_user_id_idx" ON "invitations" USING btree ("revoked_by_user_id") WHERE "invitations"."revoked_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "organization_members_user_id_idx" ON "organization_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "organization_members_organization_id_role_idx" ON "organization_members" USING btree ("organization_id","role") WHERE "organization_members"."status" = 'active';--> statement-breakpoint
CREATE INDEX "organization_members_organization_id_primary_team_id_idx" ON "organization_members" USING btree ("organization_id","primary_team_id") WHERE "organization_members"."primary_team_id" is not null;--> statement-breakpoint
CREATE INDEX "organization_members_organization_id_created_at_id_idx" ON "organization_members" USING btree ("organization_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "organization_members_invited_by_user_id_idx" ON "organization_members" USING btree ("invited_by_user_id") WHERE "organization_members"."invited_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "organization_members_deactivated_by_user_id_idx" ON "organization_members" USING btree ("deactivated_by_user_id") WHERE "organization_members"."deactivated_by_user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_slug_history_slug_key" ON "organization_slug_history" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "organization_slug_history_organization_id_idx" ON "organization_slug_history" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_slug_history_redirect_until_idx" ON "organization_slug_history" USING btree ("redirect_until");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "organizations_partner_id_idx" ON "organizations" USING btree ("partner_id") WHERE "organizations"."partner_id" is not null;--> statement-breakpoint
CREATE INDEX "organizations_status_idx" ON "organizations" USING btree ("status") WHERE "organizations"."status" <> 'active';--> statement-breakpoint
CREATE INDEX "organizations_deletion_scheduled_for_idx" ON "organizations" USING btree ("deletion_scheduled_for") WHERE "organizations"."status" = 'deletion_scheduled';--> statement-breakpoint
CREATE INDEX "organizations_created_by_user_id_idx" ON "organizations" USING btree ("created_by_user_id") WHERE "organizations"."created_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "organizations_deletion_requested_by_user_id_idx" ON "organizations" USING btree ("deletion_requested_by_user_id") WHERE "organizations"."deletion_requested_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "team_members_organization_id_user_id_idx" ON "team_members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "team_members_added_by_user_id_idx" ON "team_members" USING btree ("added_by_user_id") WHERE "team_members"."added_by_user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "teams_organization_id_name_key" ON "teams" USING btree ("organization_id",lower("name"));--> statement-breakpoint
CREATE INDEX "teams_lead_user_id_idx" ON "teams" USING btree ("lead_user_id") WHERE "teams"."lead_user_id" is not null;--> statement-breakpoint
CREATE INDEX "teams_created_by_user_id_idx" ON "teams" USING btree ("created_by_user_id") WHERE "teams"."created_by_user_id" is not null;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_user_id_fkey" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."organization_members"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "invitation_teams_tenant_isolation" ON "invitation_teams" AS PERMISSIVE FOR ALL TO public USING (("invitation_teams"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("invitation_teams"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "invitations_tenant_isolation" ON "invitations" AS PERMISSIVE FOR ALL TO public USING (("invitations"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("invitations"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "member_preferences_tenant_isolation" ON "member_preferences" AS PERMISSIVE FOR ALL TO public USING (("member_preferences"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("member_preferences"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "organization_members_tenant_isolation" ON "organization_members" AS PERMISSIVE FOR ALL TO public USING (("organization_members"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("organization_members"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "organization_members_self_read" ON "organization_members" AS PERMISSIVE FOR SELECT TO public USING ("organization_members"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "organization_slug_history_tenant_isolation" ON "organization_slug_history" AS PERMISSIVE FOR ALL TO public USING (("organization_slug_history"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("organization_slug_history"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "organizations_tenant_isolation" ON "organizations" AS PERMISSIVE FOR ALL TO public USING (("organizations"."id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("organizations"."id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "organizations_member_read" ON "organizations" AS PERMISSIVE FOR SELECT TO public USING (exists (
      select 1 from organization_members m
      where m.organization_id = "organizations"."id" and m.user_id = nullif(current_setting('app.user_id', true), '')::uuid and m.status = 'active'));--> statement-breakpoint
CREATE POLICY "team_members_tenant_isolation" ON "team_members" AS PERMISSIVE FOR ALL TO public USING (("team_members"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("team_members"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "teams_tenant_isolation" ON "teams" AS PERMISSIVE FOR ALL TO public USING (("teams"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("teams"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));