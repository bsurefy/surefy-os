CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"target_type" text,
	"target_id" uuid,
	"actor_user_id" uuid,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "notifications_type_check" CHECK ("notifications"."type" in ('invitation.reissue_requested', 'model_access.requested', 'knowledge_source.ready', 'knowledge_source.failed', 'export.ready', 'export.failed', 'organization.deletion_scheduled', 'budget.threshold_reached', 'approval.requested', 'approval.decided', 'chat.shared', 'connection.expired', 'flow.paused', 'piece.blocked', 'evaluation_run.finished', 'training_job.finished', 'access_grant.requested')),
	CONSTRAINT "notifications_target_type_check" CHECK ("notifications"."target_type" in ('approval', 'invitation', 'vault_model', 'knowledge_source', 'export', 'data_request', 'organization', 'budget', 'chat', 'connection', 'flow', 'piece', 'evaluation_run', 'training_job', 'access_grant'))
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "notifications_user_feed_idx" ON "notifications" USING btree ("organization_id","user_id","created_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("organization_id","user_id") WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_key" ON "notifications" USING btree ("organization_id","user_id","dedupe_key") WHERE "notifications"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_actor_user_id_idx" ON "notifications" USING btree ("actor_user_id");--> statement-breakpoint
CREATE POLICY "notifications_tenant_isolation" ON "notifications" AS PERMISSIVE FOR ALL TO public USING (("notifications"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("notifications"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));