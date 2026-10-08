CREATE TABLE "guard_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"auto_threshold_bp" integer DEFAULT 9000 NOT NULL,
	"review_threshold_bp" integer DEFAULT 6000 NOT NULL,
	"quick_approve_max_amount_micros" bigint DEFAULT 0 NOT NULL,
	"quick_approve_max_risk" text DEFAULT 'low' NOT NULL,
	"step_up_amount_micros" bigint,
	"currency" char(3) DEFAULT 'USD' NOT NULL,
	"target_decision_minutes" integer DEFAULT 60 NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guard_settings_thresholds_check" CHECK ("guard_settings"."review_threshold_bp" >= 0 and "guard_settings"."review_threshold_bp" < "guard_settings"."auto_threshold_bp" and "guard_settings"."auto_threshold_bp" <= 10000),
	CONSTRAINT "guard_settings_amounts_check" CHECK ("guard_settings"."quick_approve_max_amount_micros" >= 0 and ("guard_settings"."step_up_amount_micros" is null or "guard_settings"."step_up_amount_micros" >= 0)),
	CONSTRAINT "guard_settings_target_decision_minutes_check" CHECK ("guard_settings"."target_decision_minutes" > 0),
	CONSTRAINT "guard_settings_quick_approve_max_risk_check" CHECK ("guard_settings"."quick_approve_max_risk" in ('low', 'medium'))
);
--> statement-breakpoint
ALTER TABLE "guard_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "guard_stats_daily" (
	"organization_id" uuid NOT NULL,
	"day" date NOT NULL,
	"actions_auto" bigint DEFAULT 0 NOT NULL,
	"actions_double_check" bigint DEFAULT 0 NOT NULL,
	"actions_human" bigint DEFAULT 0 NOT NULL,
	"actions_blocked_rule" bigint DEFAULT 0 NOT NULL,
	"actions_blocked_limit" bigint DEFAULT 0 NOT NULL,
	"pii_masked_requests" bigint DEFAULT 0 NOT NULL,
	"local_requests" bigint DEFAULT 0 NOT NULL,
	"approvals_requested" bigint DEFAULT 0 NOT NULL,
	"approvals_approved" bigint DEFAULT 0 NOT NULL,
	"approvals_rejected" bigint DEFAULT 0 NOT NULL,
	"approvals_expired" bigint DEFAULT 0 NOT NULL,
	"approval_decision_seconds_sum" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "guard_stats_daily_pkey" PRIMARY KEY("organization_id","day")
);
--> statement-breakpoint
ALTER TABLE "guard_stats_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "guardrails" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"scope" text DEFAULT 'organization' NOT NULL,
	"team_id" uuid,
	"definition" jsonb NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"locked_by_user_id" uuid,
	"locked_reason" text,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardrails_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "guardrails_type_check" CHECK ("guardrails"."type" in ('approval_rule', 'threshold_override', 'blocked_action', 'action_limit', 'content_filter')),
	CONSTRAINT "guardrails_scope_values_check" CHECK ("guardrails"."scope" in ('organization', 'team')),
	CONSTRAINT "guardrails_scope_check" CHECK (("guardrails"."scope" = 'organization' and "guardrails"."team_id" is null) or ("guardrails"."scope" = 'team' and "guardrails"."team_id" is not null)),
	CONSTRAINT "guardrails_lock_check" CHECK (not "guardrails"."is_locked" or "guardrails"."locked_reason" is not null)
);
--> statement-breakpoint
ALTER TABLE "guardrails" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pii_filter_rules" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"pii_type" text NOT NULL,
	"custom_label" text,
	"custom_pattern" text,
	"action" text NOT NULL,
	"scope" text DEFAULT 'organization' NOT NULL,
	"team_id" uuid,
	"agent_id" uuid,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pii_filter_rules_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "pii_filter_rules_pii_type_check" CHECK ("pii_filter_rules"."pii_type" in ('person_name', 'email', 'phone', 'payment_card', 'bank_account', 'government_id', 'address', 'custom')),
	CONSTRAINT "pii_filter_rules_action_check" CHECK ("pii_filter_rules"."action" in ('detect', 'mask', 'block')),
	CONSTRAINT "pii_filter_rules_scope_values_check" CHECK ("pii_filter_rules"."scope" in ('organization', 'team', 'agent')),
	CONSTRAINT "pii_filter_rules_custom_check" CHECK (("pii_filter_rules"."pii_type" = 'custom') = ("pii_filter_rules"."custom_label" is not null and "pii_filter_rules"."custom_pattern" is not null)),
	CONSTRAINT "pii_filter_rules_scope_check" CHECK (("pii_filter_rules"."scope" = 'organization' and "pii_filter_rules"."team_id" is null and "pii_filter_rules"."agent_id" is null)
        or ("pii_filter_rules"."scope" = 'team' and "pii_filter_rules"."team_id" is not null and "pii_filter_rules"."agent_id" is null)
        or ("pii_filter_rules"."scope" = 'agent' and "pii_filter_rules"."agent_id" is not null and "pii_filter_rules"."team_id" is null))
);
--> statement-breakpoint
ALTER TABLE "pii_filter_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guard_settings" ADD CONSTRAINT "guard_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guard_settings" ADD CONSTRAINT "guard_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guard_stats_daily" ADD CONSTRAINT "guard_stats_daily_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardrails" ADD CONSTRAINT "guardrails_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardrails" ADD CONSTRAINT "guardrails_locked_by_user_id_users_id_fk" FOREIGN KEY ("locked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardrails" ADD CONSTRAINT "guardrails_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardrails" ADD CONSTRAINT "guardrails_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardrails" ADD CONSTRAINT "guardrails_organization_id_team_id_fkey" FOREIGN KEY ("organization_id","team_id") REFERENCES "public"."teams"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pii_filter_rules" ADD CONSTRAINT "pii_filter_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pii_filter_rules" ADD CONSTRAINT "pii_filter_rules_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pii_filter_rules" ADD CONSTRAINT "pii_filter_rules_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pii_filter_rules" ADD CONSTRAINT "pii_filter_rules_organization_id_team_id_fkey" FOREIGN KEY ("organization_id","team_id") REFERENCES "public"."teams"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guard_settings_updated_by_user_id_idx" ON "guard_settings" USING btree ("updated_by_user_id") WHERE "guard_settings"."updated_by_user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "guardrails_organization_id_name_key" ON "guardrails" USING btree ("organization_id",lower("name"));--> statement-breakpoint
CREATE INDEX "guardrails_organization_id_type_idx" ON "guardrails" USING btree ("organization_id","type") WHERE "guardrails"."is_enabled";--> statement-breakpoint
CREATE INDEX "guardrails_organization_id_team_id_idx" ON "guardrails" USING btree ("organization_id","team_id") WHERE "guardrails"."team_id" is not null;--> statement-breakpoint
CREATE INDEX "guardrails_locked_by_user_id_idx" ON "guardrails" USING btree ("locked_by_user_id") WHERE "guardrails"."locked_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "guardrails_created_by_user_id_idx" ON "guardrails" USING btree ("created_by_user_id") WHERE "guardrails"."created_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "guardrails_updated_by_user_id_idx" ON "guardrails" USING btree ("updated_by_user_id") WHERE "guardrails"."updated_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "pii_filter_rules_organization_id_team_id_idx" ON "pii_filter_rules" USING btree ("organization_id","team_id") WHERE "pii_filter_rules"."team_id" is not null;--> statement-breakpoint
CREATE INDEX "pii_filter_rules_organization_id_agent_id_idx" ON "pii_filter_rules" USING btree ("organization_id","agent_id") WHERE "pii_filter_rules"."agent_id" is not null;--> statement-breakpoint
CREATE INDEX "pii_filter_rules_created_by_user_id_idx" ON "pii_filter_rules" USING btree ("created_by_user_id") WHERE "pii_filter_rules"."created_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "pii_filter_rules_updated_by_user_id_idx" ON "pii_filter_rules" USING btree ("updated_by_user_id") WHERE "pii_filter_rules"."updated_by_user_id" is not null;--> statement-breakpoint
CREATE POLICY "guard_settings_tenant_isolation" ON "guard_settings" AS PERMISSIVE FOR ALL TO public USING (("guard_settings"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("guard_settings"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "guard_stats_daily_tenant_isolation" ON "guard_stats_daily" AS PERMISSIVE FOR ALL TO public USING (("guard_stats_daily"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("guard_stats_daily"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "guardrails_tenant_isolation" ON "guardrails" AS PERMISSIVE FOR ALL TO public USING (("guardrails"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("guardrails"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "pii_filter_rules_tenant_isolation" ON "pii_filter_rules" AS PERMISSIVE FOR ALL TO public USING (("pii_filter_rules"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("pii_filter_rules"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));