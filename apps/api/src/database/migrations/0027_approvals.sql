CREATE TABLE "approval_assignees" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"approval_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"user_id" uuid,
	"team_id" uuid,
	"role" text,
	"source" text DEFAULT 'rule' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_assignees_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "approval_assignees_subject_key" UNIQUE NULLS NOT DISTINCT("organization_id","approval_id","subject_type","user_id","team_id","role"),
	CONSTRAINT "approval_assignees_subject_type_check" CHECK ("approval_assignees"."subject_type" in ('user', 'team', 'role')),
	CONSTRAINT "approval_assignees_role_check" CHECK ("approval_assignees"."role" in ('user', 'builder', 'admin', 'owner')),
	CONSTRAINT "approval_assignees_source_check" CHECK ("approval_assignees"."source" in ('rule', 'escalation')),
	CONSTRAINT "approval_assignees_subject_check" CHECK (("approval_assignees"."subject_type" = 'user' and "approval_assignees"."user_id" is not null and "approval_assignees"."team_id" is null and "approval_assignees"."role" is null)
        or ("approval_assignees"."subject_type" = 'team' and "approval_assignees"."team_id" is not null and "approval_assignees"."user_id" is null and "approval_assignees"."role" is null)
        or ("approval_assignees"."subject_type" = 'role' and "approval_assignees"."role" is not null and "approval_assignees"."user_id" is null and "approval_assignees"."team_id" is null))
);
--> statement-breakpoint
ALTER TABLE "approval_assignees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"title" text NOT NULL,
	"payload" jsonb NOT NULL,
	"edited_payload" jsonb,
	"amount_micros" bigint,
	"currency" char(3) DEFAULT 'USD' NOT NULL,
	"confidence" real,
	"risk" text DEFAULT 'low' NOT NULL,
	"rule_ref" text,
	"dedupe_key" text,
	"agent_id" uuid,
	"agent_run_id" uuid,
	"flow_id" uuid,
	"flow_run_id" uuid,
	"requested_by_user_id" uuid,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	"decision_note" text,
	"requires_step_up" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"timeout_action" text,
	"escalated_at" timestamp with time zone,
	"resolved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approvals_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "approvals_kind_check" CHECK ("approvals"."kind" in ('ai_action', 'flow_step', 'bridge_install', 'bridge_update', 'channel_publish')),
	CONSTRAINT "approvals_status_check" CHECK ("approvals"."status" in ('pending', 'approved', 'rejected', 'expired', 'canceled')),
	CONSTRAINT "approvals_risk_check" CHECK ("approvals"."risk" in ('low', 'medium', 'high')),
	CONSTRAINT "approvals_decision_reason_check" CHECK ("approvals"."decision_reason" in ('wrong_amount', 'not_eligible', 'needs_more_information', 'wrong_team', 'other')),
	CONSTRAINT "approvals_timeout_action_check" CHECK ("approvals"."timeout_action" in ('reject', 'escalate', 'continue')),
	CONSTRAINT "approvals_resolved_by_check" CHECK ("approvals"."resolved_by" in ('user', 'timeout', 'system')),
	CONSTRAINT "approvals_decision_check" CHECK (not ("approvals"."status" = 'rejected' and "approvals"."resolved_by" = 'user') or "approvals"."decision_reason" is not null),
	CONSTRAINT "approvals_terminal_check" CHECK (("approvals"."status" = 'pending' and "approvals"."resolved_by" is null and "approvals"."decided_at" is null)
        or ("approvals"."status" <> 'pending' and "approvals"."resolved_by" is not null and "approvals"."decided_at" is not null)),
	CONSTRAINT "approvals_timeout_check" CHECK ("approvals"."expires_at" is null or "approvals"."timeout_action" is not null),
	CONSTRAINT "approvals_confidence_check" CHECK ("approvals"."confidence" between 0 and 1),
	CONSTRAINT "approvals_amount_check" CHECK ("approvals"."amount_micros" >= 0)
);
--> statement-breakpoint
ALTER TABLE "approvals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "approval_assignees" ADD CONSTRAINT "approval_assignees_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_assignees" ADD CONSTRAINT "approval_assignees_organization_id_approval_id_fkey" FOREIGN KEY ("organization_id","approval_id") REFERENCES "public"."approvals"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_assignees" ADD CONSTRAINT "approval_assignees_organization_id_user_id_fkey" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."organization_members"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_assignees" ADD CONSTRAINT "approval_assignees_organization_id_team_id_fkey" FOREIGN KEY ("organization_id","team_id") REFERENCES "public"."teams"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_assignees_organization_id_user_id_idx" ON "approval_assignees" USING btree ("organization_id","user_id") WHERE "approval_assignees"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "approval_assignees_organization_id_team_id_idx" ON "approval_assignees" USING btree ("organization_id","team_id") WHERE "approval_assignees"."team_id" is not null;--> statement-breakpoint
CREATE INDEX "approval_assignees_organization_id_role_idx" ON "approval_assignees" USING btree ("organization_id","role") WHERE "approval_assignees"."role" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_organization_id_dedupe_key_key" ON "approvals" USING btree ("organization_id","dedupe_key") WHERE "approvals"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "approvals_pending_idx" ON "approvals" USING btree ("organization_id","created_at","id") WHERE "approvals"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "approvals_expiry_idx" ON "approvals" USING btree ("expires_at") WHERE "approvals"."status" = 'pending' and "approvals"."expires_at" is not null;--> statement-breakpoint
CREATE INDEX "approvals_organization_id_decided_at_idx" ON "approvals" USING btree ("organization_id","decided_at" DESC NULLS LAST) WHERE "approvals"."decided_at" is not null;--> statement-breakpoint
CREATE INDEX "approvals_agent_id_idx" ON "approvals" USING btree ("agent_id") WHERE "approvals"."agent_id" is not null;--> statement-breakpoint
CREATE INDEX "approvals_agent_run_id_idx" ON "approvals" USING btree ("agent_run_id") WHERE "approvals"."agent_run_id" is not null;--> statement-breakpoint
CREATE INDEX "approvals_flow_id_idx" ON "approvals" USING btree ("flow_id") WHERE "approvals"."flow_id" is not null;--> statement-breakpoint
CREATE INDEX "approvals_flow_run_id_idx" ON "approvals" USING btree ("flow_run_id") WHERE "approvals"."flow_run_id" is not null;--> statement-breakpoint
CREATE INDEX "approvals_requested_by_user_id_idx" ON "approvals" USING btree ("requested_by_user_id") WHERE "approvals"."requested_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "approvals_decided_by_user_id_idx" ON "approvals" USING btree ("decided_by_user_id") WHERE "approvals"."decided_by_user_id" is not null;--> statement-breakpoint
CREATE POLICY "approval_assignees_tenant_isolation" ON "approval_assignees" AS PERMISSIVE FOR ALL TO public USING (("approval_assignees"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("approval_assignees"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "approvals_tenant_isolation" ON "approvals" AS PERMISSIVE FOR ALL TO public USING (("approvals"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("approvals"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));