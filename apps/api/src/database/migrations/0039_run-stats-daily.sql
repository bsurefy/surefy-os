CREATE TABLE "run_stats_daily" (
	"organization_id" uuid NOT NULL,
	"day" date NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"currency" char(3) NOT NULL,
	"runs_total" bigint DEFAULT 0 NOT NULL,
	"runs_succeeded" bigint DEFAULT 0 NOT NULL,
	"runs_succeeded_uncorrected" bigint DEFAULT 0 NOT NULL,
	"runs_failed" bigint DEFAULT 0 NOT NULL,
	"runs_timed_out" bigint DEFAULT 0 NOT NULL,
	"runs_canceled" bigint DEFAULT 0 NOT NULL,
	"runs_needed_human" bigint DEFAULT 0 NOT NULL,
	"runs_human_corrected" bigint DEFAULT 0 NOT NULL,
	"actions_auto" bigint DEFAULT 0 NOT NULL,
	"actions_double_check" bigint DEFAULT 0 NOT NULL,
	"actions_human" bigint DEFAULT 0 NOT NULL,
	"actions_blocked" bigint DEFAULT 0 NOT NULL,
	"duration_ms_sum" bigint DEFAULT 0 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "run_stats_daily_pkey" PRIMARY KEY("organization_id","subject_type","subject_id","day","currency"),
	CONSTRAINT "run_stats_daily_subject_type_check" CHECK ("run_stats_daily"."subject_type" in ('agent', 'flow'))
);
--> statement-breakpoint
ALTER TABLE "run_stats_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "run_stats_daily" ADD CONSTRAINT "run_stats_daily_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_stats_daily_organization_id_day_idx" ON "run_stats_daily" USING btree ("organization_id","day");--> statement-breakpoint
CREATE POLICY "run_stats_daily_tenant_isolation" ON "run_stats_daily" AS PERMISSIVE FOR ALL TO public USING (("run_stats_daily"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("run_stats_daily"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));