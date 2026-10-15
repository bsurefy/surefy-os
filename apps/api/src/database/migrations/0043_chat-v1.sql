CREATE TABLE "chat_shares" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"chat_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"user_id" uuid,
	"team_id" uuid,
	"shared_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_shares_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "chat_shares_subject_key" UNIQUE NULLS NOT DISTINCT("organization_id","chat_id","subject_type","user_id","team_id"),
	CONSTRAINT "chat_shares_subject_type_check" CHECK ("chat_shares"."subject_type" in ('user', 'team')),
	CONSTRAINT "chat_shares_subject_check" CHECK (("chat_shares"."subject_type" = 'user' and "chat_shares"."user_id" is not null and "chat_shares"."team_id" is null) or ("chat_shares"."subject_type" = 'team' and "chat_shares"."team_id" is not null and "chat_shares"."user_id" is null))
);
--> statement-breakpoint
ALTER TABLE "chat_shares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "prompt_shares" (
	"organization_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_shares_pkey" PRIMARY KEY("prompt_id","team_id")
);
--> statement-breakpoint
ALTER TABLE "prompt_shares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_user_id" uuid,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"variables" text[] DEFAULT '{}' NOT NULL,
	"visibility" text DEFAULT 'personal' NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompts_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "prompts_visibility_check" CHECK ("prompts"."visibility" in ('personal', 'shared')),
	CONSTRAINT "prompts_personal_owner_check" CHECK ("prompts"."visibility" <> 'personal' or "prompts"."owner_user_id" is not null),
	CONSTRAINT "prompts_deleted_check" CHECK ("prompts"."deleted_by_user_id" is null or "prompts"."deleted_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "prompts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chat_shares" ADD CONSTRAINT "chat_shares_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_shares" ADD CONSTRAINT "chat_shares_shared_by_user_id_users_id_fk" FOREIGN KEY ("shared_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_shares" ADD CONSTRAINT "chat_shares_organization_id_chat_id_fkey" FOREIGN KEY ("organization_id","chat_id") REFERENCES "public"."chats"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_shares" ADD CONSTRAINT "chat_shares_organization_id_user_id_fkey" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."organization_members"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_shares" ADD CONSTRAINT "chat_shares_organization_id_team_id_fkey" FOREIGN KEY ("organization_id","team_id") REFERENCES "public"."teams"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_shares" ADD CONSTRAINT "prompt_shares_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_shares" ADD CONSTRAINT "prompt_shares_organization_id_prompt_id_fkey" FOREIGN KEY ("organization_id","prompt_id") REFERENCES "public"."prompts"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_shares" ADD CONSTRAINT "prompt_shares_organization_id_team_id_fkey" FOREIGN KEY ("organization_id","team_id") REFERENCES "public"."teams"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_deleted_by_user_id_users_id_fk" FOREIGN KEY ("deleted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_shares_organization_id_user_id_idx" ON "chat_shares" USING btree ("organization_id","user_id") WHERE "chat_shares"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "chat_shares_organization_id_team_id_idx" ON "chat_shares" USING btree ("organization_id","team_id") WHERE "chat_shares"."team_id" is not null;--> statement-breakpoint
CREATE INDEX "chat_shares_shared_by_user_id_idx" ON "chat_shares" USING btree ("shared_by_user_id") WHERE "chat_shares"."shared_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "prompt_shares_organization_id_team_id_idx" ON "prompt_shares" USING btree ("organization_id","team_id");--> statement-breakpoint
CREATE INDEX "prompts_organization_id_owner_user_id_idx" ON "prompts" USING btree ("organization_id","owner_user_id","updated_at" DESC NULLS LAST) WHERE "prompts"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "prompts_organization_id_shared_idx" ON "prompts" USING btree ("organization_id","updated_at" DESC NULLS LAST) WHERE "prompts"."visibility" = 'shared' and "prompts"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "prompts_organization_id_deleted_at_idx" ON "prompts" USING btree ("organization_id","deleted_at" DESC NULLS LAST) WHERE "prompts"."deleted_at" is not null;--> statement-breakpoint
CREATE INDEX "prompts_deleted_at_idx" ON "prompts" USING btree ("deleted_at") WHERE "prompts"."deleted_at" is not null;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "chat_shares_tenant_isolation" ON "chat_shares" AS PERMISSIVE FOR ALL TO public USING (("chat_shares"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("chat_shares"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "prompt_shares_tenant_isolation" ON "prompt_shares" AS PERMISSIVE FOR ALL TO public USING (("prompt_shares"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("prompt_shares"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "prompts_tenant_isolation" ON "prompts" AS PERMISSIVE FOR ALL TO public USING (("prompts"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("prompts"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));