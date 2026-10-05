CREATE TABLE "usage_daily" (
	"organization_id" uuid NOT NULL,
	"day" date NOT NULL,
	"user_id" uuid,
	"team_id" uuid,
	"source_module" text NOT NULL,
	"subject_type" text,
	"subject_id" uuid,
	"model_key" text NOT NULL,
	"credential_id" uuid,
	"billed_via" text NOT NULL,
	"currency" char(3) NOT NULL,
	"requests" bigint DEFAULT 0 NOT NULL,
	"errors" bigint DEFAULT 0 NOT NULL,
	"blocked" bigint DEFAULT 0 NOT NULL,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"cached_input_tokens" bigint DEFAULT 0 NOT NULL,
	"reasoning_tokens" bigint DEFAULT 0 NOT NULL,
	"units" bigint DEFAULT 0 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_daily_grain_key" UNIQUE NULLS NOT DISTINCT("organization_id","day","user_id","team_id","source_module","subject_type","subject_id","model_key","credential_id","billed_via","currency"),
	CONSTRAINT "usage_daily_source_module_check" CHECK ("usage_daily"."source_module" in ('chat', 'agent', 'flow', 'knowledge', 'decision', 'routing', 'train', 'search')),
	CONSTRAINT "usage_daily_subject_type_check" CHECK ("usage_daily"."subject_type" in ('agent', 'flow')),
	CONSTRAINT "usage_daily_billed_via_check" CHECK ("usage_daily"."billed_via" in ('provider_direct', 'local', 'platform_credits'))
);
--> statement-breakpoint
ALTER TABLE "usage_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "usage_monthly" (
	"organization_id" uuid NOT NULL,
	"month" date NOT NULL,
	"scope" text NOT NULL,
	"scope_id" uuid NOT NULL,
	"currency" char(3) NOT NULL,
	"requests" bigint DEFAULT 0 NOT NULL,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_monthly_pkey" PRIMARY KEY("organization_id","month","scope","scope_id","currency"),
	CONSTRAINT "usage_monthly_month_check" CHECK (extract(day from "usage_monthly"."month") = 1),
	CONSTRAINT "usage_monthly_scope_check" CHECK ("usage_monthly"."scope" in ('organization', 'team', 'user'))
);
--> statement-breakpoint
ALTER TABLE "usage_monthly" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "usage_rollup_state" (
	"rollup" text PRIMARY KEY NOT NULL,
	"watermark" timestamp with time zone NOT NULL,
	"last_hourly_started_at" timestamp with time zone,
	"last_hourly_finished_at" timestamp with time zone,
	"last_nightly_finished_at" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_rollup_state_rollup_check" CHECK ("usage_rollup_state"."rollup" in ('usage_daily', 'usage_monthly', 'run_stats_daily', 'guard_stats_daily'))
);
--> statement-breakpoint
ALTER TABLE "usage_rollup_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "usage_daily" ADD CONSTRAINT "usage_daily_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_monthly" ADD CONSTRAINT "usage_monthly_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_daily_organization_id_credential_id_day_idx" ON "usage_daily" USING btree ("organization_id","credential_id","day") WHERE "usage_daily"."credential_id" is not null;--> statement-breakpoint
CREATE INDEX "usage_daily_organization_id_subject_idx" ON "usage_daily" USING btree ("organization_id","subject_type","subject_id","day") WHERE "usage_daily"."subject_id" is not null;--> statement-breakpoint
CREATE INDEX "usage_daily_organization_id_team_id_day_idx" ON "usage_daily" USING btree ("organization_id","team_id","day");--> statement-breakpoint
CREATE POLICY "usage_daily_tenant_isolation" ON "usage_daily" AS PERMISSIVE FOR ALL TO public USING (("usage_daily"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("usage_daily"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "usage_monthly_tenant_isolation" ON "usage_monthly" AS PERMISSIVE FOR ALL TO public USING (("usage_monthly"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("usage_monthly"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "usage_rollup_state_system_only" ON "usage_rollup_state" AS PERMISSIVE FOR ALL TO public USING (coalesce(current_setting('app.scope', true), '') = 'system') WITH CHECK (coalesce(current_setting('app.scope', true), '') = 'system');