CREATE TABLE "agent_channels" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending_approval' NOT NULL,
	"config" jsonb DEFAULT '{"version":1}'::jsonb NOT NULL,
	"public_token_hash" "bytea",
	"public_token_prefix" text,
	"external_account_id" text,
	"connection_id" uuid,
	"approval_id" uuid,
	"requested_by_user_id" uuid,
	"approved_by_user_id" uuid,
	"last_error_code" text,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_channels_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "agent_channels_public_token_hash_key" UNIQUE("public_token_hash"),
	CONSTRAINT "agent_channels_type_check" CHECK ("agent_channels"."type" in ('workspace_chat', 'api', 'widget', 'slack', 'whatsapp')),
	CONSTRAINT "agent_channels_status_check" CHECK ("agent_channels"."status" in ('pending_approval', 'active', 'paused', 'error', 'disconnected')),
	CONSTRAINT "agent_channels_widget_token_check" CHECK ("agent_channels"."type" <> 'widget' or "agent_channels"."public_token_hash" is not null or "agent_channels"."status" = 'disconnected'),
	CONSTRAINT "agent_channels_external_check" CHECK ("agent_channels"."type" not in ('slack', 'whatsapp') or "agent_channels"."status" = 'disconnected' or ("agent_channels"."external_account_id" is not null and "agent_channels"."connection_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "agent_channels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_channels" ADD CONSTRAINT "agent_channels_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_channels" ADD CONSTRAINT "agent_channels_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_channels" ADD CONSTRAINT "agent_channels_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_channels" ADD CONSTRAINT "agent_channels_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_channels" ADD CONSTRAINT "agent_channels_organization_id_agent_id_fkey" FOREIGN KEY ("organization_id","agent_id") REFERENCES "public"."agents"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_channels" ADD CONSTRAINT "agent_channels_organization_id_connection_id_fkey" FOREIGN KEY ("organization_id","connection_id") REFERENCES "public"."connections"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_channels_agent_type_key" ON "agent_channels" USING btree ("organization_id","agent_id","type") WHERE "agent_channels"."type" in ('workspace_chat', 'api', 'widget');--> statement-breakpoint
CREATE UNIQUE INDEX "agent_channels_external_account_key" ON "agent_channels" USING btree ("type","external_account_id") WHERE "agent_channels"."external_account_id" is not null and "agent_channels"."status" <> 'disconnected';--> statement-breakpoint
CREATE INDEX "agent_channels_organization_id_status_idx" ON "agent_channels" USING btree ("organization_id","status") WHERE "agent_channels"."status" in ('pending_approval', 'error');--> statement-breakpoint
CREATE INDEX "agent_channels_connection_id_idx" ON "agent_channels" USING btree ("organization_id","connection_id") WHERE "agent_channels"."connection_id" is not null;--> statement-breakpoint
CREATE INDEX "agent_channels_approval_id_idx" ON "agent_channels" USING btree ("approval_id") WHERE "agent_channels"."approval_id" is not null;--> statement-breakpoint
CREATE INDEX "agent_channels_requested_by_user_id_idx" ON "agent_channels" USING btree ("requested_by_user_id") WHERE "agent_channels"."requested_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "agent_channels_approved_by_user_id_idx" ON "agent_channels" USING btree ("approved_by_user_id") WHERE "agent_channels"."approved_by_user_id" is not null;--> statement-breakpoint
CREATE POLICY "agent_channels_tenant_isolation" ON "agent_channels" AS PERMISSIVE FOR ALL TO public USING (("agent_channels"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("agent_channels"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));