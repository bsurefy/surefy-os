CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_version_id" uuid,
	"trigger" text NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"started_by_user_id" uuid,
	"team_id" uuid,
	"api_key_id" uuid,
	"channel_id" uuid,
	"chat_id" uuid,
	"flow_run_id" uuid,
	"model_key" text,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"currency" char(3) DEFAULT 'USD' NOT NULL,
	"min_confidence" real,
	"needed_human" boolean DEFAULT false NOT NULL,
	"human_corrected" boolean DEFAULT false NOT NULL,
	"step_count" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"summary" jsonb,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_runs_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "agent_runs_trigger_check" CHECK ("agent_runs"."trigger" in ('chat', 'test', 'api', 'widget', 'slack', 'whatsapp', 'flow')),
	CONSTRAINT "agent_runs_status_check" CHECK ("agent_runs"."status" in ('queued', 'running', 'waiting_approval', 'succeeded', 'failed', 'canceled', 'timed_out')),
	CONSTRAINT "agent_runs_test_check" CHECK ("agent_runs"."is_test" = ("agent_runs"."trigger" = 'test')),
	CONSTRAINT "agent_runs_finished_check" CHECK ("agent_runs"."status" not in ('succeeded', 'failed', 'canceled', 'timed_out') or "agent_runs"."finished_at" is not null),
	CONSTRAINT "agent_runs_counts_check" CHECK ("agent_runs"."input_tokens" >= 0 and "agent_runs"."output_tokens" >= 0 and "agent_runs"."cost_micros" >= 0 and "agent_runs"."step_count" >= 0),
	CONSTRAINT "agent_runs_min_confidence_check" CHECK ("agent_runs"."min_confidence" between 0 and 1)
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_started_by_user_id_users_id_fk" FOREIGN KEY ("started_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_organization_id_agent_id_fkey" FOREIGN KEY ("organization_id","agent_id") REFERENCES "public"."agents"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_organization_id_agent_id_agent_version_id_fkey" FOREIGN KEY ("organization_id","agent_id","agent_version_id") REFERENCES "public"."agent_versions"("organization_id","agent_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_organization_id_created_at_id_idx" ON "agent_runs" USING btree ("organization_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_runs_organization_id_agent_id_created_at_idx" ON "agent_runs" USING btree ("organization_id","agent_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_runs_organization_id_started_by_user_id_idx" ON "agent_runs" USING btree ("organization_id","started_by_user_id","created_at" DESC NULLS LAST) WHERE "agent_runs"."started_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "agent_runs_organization_id_finished_at_idx" ON "agent_runs" USING btree ("organization_id","finished_at") WHERE "agent_runs"."finished_at" is not null and "agent_runs"."is_test" = false;--> statement-breakpoint
CREATE INDEX "agent_runs_open_idx" ON "agent_runs" USING btree ("status","updated_at") WHERE "agent_runs"."status" in ('queued', 'running', 'waiting_approval');--> statement-breakpoint
CREATE INDEX "agent_runs_agent_version_idx" ON "agent_runs" USING btree ("organization_id","agent_id","agent_version_id") WHERE "agent_runs"."agent_version_id" is not null;--> statement-breakpoint
CREATE INDEX "agent_runs_chat_id_idx" ON "agent_runs" USING btree ("chat_id") WHERE "agent_runs"."chat_id" is not null;--> statement-breakpoint
CREATE INDEX "agent_runs_flow_run_id_idx" ON "agent_runs" USING btree ("flow_run_id") WHERE "agent_runs"."flow_run_id" is not null;--> statement-breakpoint
CREATE INDEX "agent_runs_channel_id_idx" ON "agent_runs" USING btree ("channel_id") WHERE "agent_runs"."channel_id" is not null;--> statement-breakpoint
CREATE INDEX "agent_runs_api_key_id_idx" ON "agent_runs" USING btree ("api_key_id") WHERE "agent_runs"."api_key_id" is not null;--> statement-breakpoint
CREATE INDEX "agent_runs_started_by_user_id_idx" ON "agent_runs" USING btree ("started_by_user_id") WHERE "agent_runs"."started_by_user_id" is not null;--> statement-breakpoint
CREATE POLICY "agent_runs_tenant_isolation" ON "agent_runs" AS PERMISSIVE FOR ALL TO public USING (("agent_runs"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("agent_runs"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));