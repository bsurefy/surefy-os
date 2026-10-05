CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid,
	"topic" text NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone,
	"last_error" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_events_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "outbox_events_topic_check" CHECK ("outbox_events"."topic" ~ '^[a-z_]+(\.[a-z_]+)+$'),
	CONSTRAINT "outbox_events_status_check" CHECK ("outbox_events"."status" in ('pending', 'dispatched', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "outbox_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbox_events_pending_idx" ON "outbox_events" USING btree ("available_at","id") WHERE "outbox_events"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_topic_dedupe_key_key" ON "outbox_events" USING btree ("topic","dedupe_key") WHERE "outbox_events"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "outbox_events_cleanup_idx" ON "outbox_events" USING btree ("status","updated_at") WHERE "outbox_events"."status" <> 'pending';--> statement-breakpoint
CREATE POLICY "outbox_events_owned_or_system" ON "outbox_events" AS PERMISSIVE FOR ALL TO public USING (("outbox_events"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("outbox_events"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));