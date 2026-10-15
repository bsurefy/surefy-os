CREATE TABLE "budget_alerts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"budget_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"threshold_bp" integer NOT NULL,
	"spent_micros" bigint NOT NULL,
	"currency" char(3) DEFAULT 'USD' NOT NULL,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_alerts_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "budget_alerts_budget_id_period_start_threshold_bp_key" UNIQUE("budget_id","period_start","threshold_bp")
);
--> statement-breakpoint
ALTER TABLE "budget_alerts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"team_id" uuid,
	"user_id" uuid,
	"period" text DEFAULT 'month' NOT NULL,
	"amount_micros" bigint NOT NULL,
	"currency" char(3) DEFAULT 'USD' NOT NULL,
	"on_reached" text DEFAULT 'notify_only' NOT NULL,
	"alert_thresholds_bp" integer[] DEFAULT '{5000,8000,10000}' NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "budgets_scope_key" UNIQUE NULLS NOT DISTINCT("organization_id","scope","team_id","user_id"),
	CONSTRAINT "budgets_scope_values_check" CHECK ("budgets"."scope" in ('organization', 'team', 'user')),
	CONSTRAINT "budgets_period_check" CHECK ("budgets"."period" in ('month')),
	CONSTRAINT "budgets_on_reached_check" CHECK ("budgets"."on_reached" in ('notify_only', 'switch_to_local', 'pause_cloud_models')),
	CONSTRAINT "budgets_scope_check" CHECK (("budgets"."scope" = 'organization' and "budgets"."team_id" is null and "budgets"."user_id" is null)
        or ("budgets"."scope" = 'team' and "budgets"."team_id" is not null and "budgets"."user_id" is null)
        or ("budgets"."scope" = 'user' and "budgets"."user_id" is not null and "budgets"."team_id" is null)),
	CONSTRAINT "budgets_amount_micros_check" CHECK ("budgets"."amount_micros" >= 0),
	CONSTRAINT "budgets_alert_thresholds_bp_check" CHECK (1 <= all("budgets"."alert_thresholds_bp") and 10000 >= all("budgets"."alert_thresholds_bp"))
);
--> statement-breakpoint
ALTER TABLE "budgets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_organization_id_budget_id_fkey" FOREIGN KEY ("organization_id","budget_id") REFERENCES "public"."budgets"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_organization_id_team_id_fkey" FOREIGN KEY ("organization_id","team_id") REFERENCES "public"."teams"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_organization_id_user_id_fkey" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."organization_members"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_alerts_organization_id_triggered_at_idx" ON "budget_alerts" USING btree ("organization_id","triggered_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "budgets_organization_id_team_id_idx" ON "budgets" USING btree ("organization_id","team_id") WHERE "budgets"."team_id" is not null;--> statement-breakpoint
CREATE INDEX "budgets_organization_id_user_id_idx" ON "budgets" USING btree ("organization_id","user_id") WHERE "budgets"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "budgets_created_by_user_id_idx" ON "budgets" USING btree ("created_by_user_id") WHERE "budgets"."created_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "budgets_updated_by_user_id_idx" ON "budgets" USING btree ("updated_by_user_id") WHERE "budgets"."updated_by_user_id" is not null;--> statement-breakpoint
CREATE POLICY "budget_alerts_tenant_isolation" ON "budget_alerts" AS PERMISSIVE FOR ALL TO public USING (("budget_alerts"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("budget_alerts"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "budgets_tenant_isolation" ON "budgets" AS PERMISSIVE FOR ALL TO public USING (("budgets"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("budgets"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));