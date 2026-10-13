CREATE TABLE "agent_access" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"team_id" uuid,
	"user_id" uuid,
	"level" text DEFAULT 'use' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_access_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "agent_access_subject_key" UNIQUE NULLS NOT DISTINCT("organization_id","agent_id","subject_type","team_id","user_id"),
	CONSTRAINT "agent_access_subject_type_check" CHECK ("agent_access"."subject_type" in ('organization', 'team', 'user')),
	CONSTRAINT "agent_access_level_check" CHECK ("agent_access"."level" in ('use', 'edit')),
	CONSTRAINT "agent_access_subject_check" CHECK (("agent_access"."subject_type" = 'organization' and "agent_access"."team_id" is null and "agent_access"."user_id" is null)
        or ("agent_access"."subject_type" = 'team' and "agent_access"."team_id" is not null and "agent_access"."user_id" is null)
        or ("agent_access"."subject_type" = 'user' and "agent_access"."user_id" is not null and "agent_access"."team_id" is null))
);
--> statement-breakpoint
ALTER TABLE "agent_access" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"notes" text,
	"published_by_user_id" uuid,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_versions_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "agent_versions_organization_id_agent_id_id_key" UNIQUE("organization_id","agent_id","id"),
	CONSTRAINT "agent_versions_agent_id_version_key" UNIQUE("agent_id","version"),
	CONSTRAINT "agent_versions_version_check" CHECK ("agent_versions"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "agent_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"owner_user_id" uuid,
	"draft_definition" jsonb NOT NULL,
	"draft_revision" integer DEFAULT 1 NOT NULL,
	"draft_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"draft_updated_by_user_id" uuid,
	"has_unpublished_changes" boolean DEFAULT false NOT NULL,
	"live_version_id" uuid,
	"template_key" text,
	"paused_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "agents_status_check" CHECK ("agents"."status" in ('draft', 'active', 'paused', 'archived')),
	CONSTRAINT "agents_template_key_check" CHECK ("agents"."template_key" in ('customer_support', 'hr_helper', 'sales_assistant', 'invoice_checker')),
	CONSTRAINT "agents_draft_revision_check" CHECK ("agents"."draft_revision" >= 1)
);
--> statement-breakpoint
ALTER TABLE "agents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_access" ADD CONSTRAINT "agent_access_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_access" ADD CONSTRAINT "agent_access_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_access" ADD CONSTRAINT "agent_access_organization_id_agent_id_fkey" FOREIGN KEY ("organization_id","agent_id") REFERENCES "public"."agents"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_access" ADD CONSTRAINT "agent_access_organization_id_team_id_fkey" FOREIGN KEY ("organization_id","team_id") REFERENCES "public"."teams"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_access" ADD CONSTRAINT "agent_access_organization_id_user_id_fkey" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."organization_members"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_organization_id_agent_id_fkey" FOREIGN KEY ("organization_id","agent_id") REFERENCES "public"."agents"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_draft_updated_by_user_id_users_id_fk" FOREIGN KEY ("draft_updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_live_version_id_agent_versions_id_fk" FOREIGN KEY ("live_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_access_organization_id_team_id_idx" ON "agent_access" USING btree ("organization_id","team_id") WHERE "agent_access"."team_id" is not null;--> statement-breakpoint
CREATE INDEX "agent_access_organization_id_user_id_idx" ON "agent_access" USING btree ("organization_id","user_id") WHERE "agent_access"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "agent_access_created_by_user_id_idx" ON "agent_access" USING btree ("created_by_user_id") WHERE "agent_access"."created_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "agent_versions_published_by_user_id_idx" ON "agent_versions" USING btree ("published_by_user_id") WHERE "agent_versions"."published_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "agents_organization_id_status_idx" ON "agents" USING btree ("organization_id","status") WHERE "agents"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "agents_organization_id_owner_user_id_idx" ON "agents" USING btree ("organization_id","owner_user_id") WHERE "agents"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "agents_organization_id_deleted_at_idx" ON "agents" USING btree ("organization_id","deleted_at") WHERE "agents"."deleted_at" is not null;--> statement-breakpoint
CREATE INDEX "agents_live_version_id_idx" ON "agents" USING btree ("live_version_id") WHERE "agents"."live_version_id" is not null;--> statement-breakpoint
CREATE INDEX "agents_created_by_user_id_idx" ON "agents" USING btree ("created_by_user_id") WHERE "agents"."created_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "agents_draft_updated_by_user_id_idx" ON "agents" USING btree ("draft_updated_by_user_id") WHERE "agents"."draft_updated_by_user_id" is not null;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pii_filter_rules" ADD CONSTRAINT "pii_filter_rules_organization_id_agent_id_fkey" FOREIGN KEY ("organization_id","agent_id") REFERENCES "public"."agents"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "agent_access_tenant_isolation" ON "agent_access" AS PERMISSIVE FOR ALL TO public USING (("agent_access"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("agent_access"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "agent_versions_tenant_isolation" ON "agent_versions" AS PERMISSIVE FOR ALL TO public USING (("agent_versions"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("agent_versions"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "agents_tenant_isolation" ON "agents" AS PERMISSIVE FOR ALL TO public USING (("agents"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("agents"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));