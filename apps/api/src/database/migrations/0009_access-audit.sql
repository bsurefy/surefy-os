CREATE TABLE "access_policies" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"team_id" uuid,
	"policy" jsonb DEFAULT '{"version":1}'::jsonb NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_policies_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "access_policies_organization_id_team_id_key" UNIQUE NULLS NOT DISTINCT("organization_id","team_id")
);
--> statement-breakpoint
ALTER TABLE "access_policies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_chain_heads" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"last_seq" bigint DEFAULT 0 NOT NULL,
	"last_hash" "bytea" NOT NULL,
	"last_sealed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_chain_heads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"params" jsonb NOT NULL,
	"contains_personal_data" boolean NOT NULL,
	"object_key" text,
	"file_name" text,
	"content_type" text,
	"size_bytes" bigint,
	"row_count" integer,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"error_code" text,
	"expires_at" timestamp with time zone,
	"downloaded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exports_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "exports_kind_check" CHECK ("exports"."kind" in ('usage_csv', 'runs_csv', 'audit_csv', 'audit_json', 'chat_pdf', 'chat_markdown', 'chat_json', 'members_csv')),
	CONSTRAINT "exports_status_check" CHECK ("exports"."status" in ('queued', 'preparing', 'ready', 'failed', 'expired'))
);
--> statement-breakpoint
ALTER TABLE "exports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "data_requests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"requested_via" text NOT NULL,
	"requested_by_user_id" uuid,
	"external_ref" text,
	"reason" text,
	"object_key" text,
	"size_bytes" bigint,
	"expires_at" timestamp with time zone,
	"scheduled_for" timestamp with time zone,
	"organization_purge_id" uuid,
	"error_code" text,
	"delivered_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"canceled_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_requests_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "data_requests_type_check" CHECK ("data_requests"."type" in ('export', 'deletion')),
	CONSTRAINT "data_requests_status_check" CHECK ("data_requests"."status" in ('requested', 'preparing', 'ready', 'delivered', 'expired', 'failed', 'scheduled', 'canceled')),
	CONSTRAINT "data_requests_requested_via_check" CHECK ("data_requests"."requested_via" in ('workspace', 'console', 'partner')),
	CONSTRAINT "data_requests_type_status_check" CHECK (("data_requests"."type" = 'export' and "data_requests"."status" in ('requested', 'preparing', 'ready', 'delivered', 'expired', 'failed', 'canceled'))
        or ("data_requests"."type" = 'deletion' and "data_requests"."status" in ('requested', 'scheduled', 'canceled')))
);
--> statement-breakpoint
ALTER TABLE "data_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organization_purges" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"data_request_id" uuid,
	"requested_by_user_id" uuid,
	"scheduled_for" timestamp with time zone NOT NULL,
	"attempt" smallint DEFAULT 0 NOT NULL,
	"rows_deleted" jsonb DEFAULT '{"version":1,"tables":{},"partitionedTables":{}}'::jsonb NOT NULL,
	"objects_deleted" bigint,
	"certificate_sha256" "bytea",
	"error_code" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_purges_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "organization_purges_reason_check" CHECK ("organization_purges"."reason" in ('owner_request', 'platform_request', 'data_request')),
	CONSTRAINT "organization_purges_status_check" CHECK ("organization_purges"."status" in ('scheduled', 'running', 'completed', 'failed', 'canceled'))
);
--> statement-breakpoint
ALTER TABLE "organization_purges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "access_policies" ADD CONSTRAINT "access_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_policies" ADD CONSTRAINT "access_policies_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_policies" ADD CONSTRAINT "access_policies_organization_id_team_id_fkey" FOREIGN KEY ("organization_id","team_id") REFERENCES "public"."teams"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_chain_heads" ADD CONSTRAINT "audit_chain_heads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_organization_id_requested_by_user_id_fkey" FOREIGN KEY ("organization_id","requested_by_user_id") REFERENCES "public"."organization_members"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_organization_purge_id_organization_purges_id_fk" FOREIGN KEY ("organization_purge_id") REFERENCES "public"."organization_purges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_canceled_by_user_id_users_id_fk" FOREIGN KEY ("canceled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_policies_updated_by_user_id_idx" ON "access_policies" USING btree ("updated_by_user_id") WHERE "access_policies"."updated_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "exports_requester_idx" ON "exports" USING btree ("organization_id","requested_by_user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "exports_open_idx" ON "exports" USING btree ("status","created_at") WHERE "exports"."status" in ('queued', 'preparing');--> statement-breakpoint
CREATE INDEX "exports_expires_at_idx" ON "exports" USING btree ("expires_at") WHERE "exports"."status" = 'ready';--> statement-breakpoint
CREATE INDEX "exports_cleanup_idx" ON "exports" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "data_requests_open_deletion_key" ON "data_requests" USING btree ("organization_id") WHERE "data_requests"."type" = 'deletion' and "data_requests"."status" in ('requested', 'scheduled');--> statement-breakpoint
CREATE INDEX "data_requests_organization_id_created_at_idx" ON "data_requests" USING btree ("organization_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "data_requests_expires_at_idx" ON "data_requests" USING btree ("expires_at") WHERE "data_requests"."status" = 'ready';--> statement-breakpoint
CREATE INDEX "data_requests_requested_by_user_id_idx" ON "data_requests" USING btree ("requested_by_user_id") WHERE "data_requests"."requested_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "data_requests_canceled_by_user_id_idx" ON "data_requests" USING btree ("canceled_by_user_id") WHERE "data_requests"."canceled_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "data_requests_organization_purge_id_idx" ON "data_requests" USING btree ("organization_purge_id") WHERE "data_requests"."organization_purge_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_purges_open_key" ON "organization_purges" USING btree ("organization_id") WHERE "organization_purges"."status" in ('scheduled', 'running');--> statement-breakpoint
CREATE INDEX "organization_purges_due_idx" ON "organization_purges" USING btree ("scheduled_for") WHERE "organization_purges"."status" = 'scheduled';--> statement-breakpoint
CREATE POLICY "access_policies_tenant_isolation" ON "access_policies" AS PERMISSIVE FOR ALL TO public USING (("access_policies"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("access_policies"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "audit_chain_heads_tenant_isolation" ON "audit_chain_heads" AS PERMISSIVE FOR ALL TO public USING (("audit_chain_heads"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("audit_chain_heads"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "exports_tenant_isolation" ON "exports" AS PERMISSIVE FOR ALL TO public USING (("exports"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("exports"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "data_requests_tenant_isolation" ON "data_requests" AS PERMISSIVE FOR ALL TO public USING (("data_requests"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("data_requests"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "organization_purges_system_only" ON "organization_purges" AS PERMISSIVE FOR ALL TO public USING (coalesce(current_setting('app.scope', true), '') = 'system') WITH CHECK (coalesce(current_setting('app.scope', true), '') = 'system');