CREATE TABLE "chat_attachments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"chat_id" uuid NOT NULL,
	"message_id" uuid,
	"uploaded_by_user_id" uuid,
	"object_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" "bytea",
	"kind" text NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"error_code" text,
	"extracted_text" text,
	"page_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_attachments_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "chat_attachments_kind_check" CHECK ("chat_attachments"."kind" in ('image', 'document')),
	CONSTRAINT "chat_attachments_status_check" CHECK ("chat_attachments"."status" in ('uploading', 'processing', 'ready', 'failed')),
	CONSTRAINT "chat_attachments_sha256_check" CHECK ("chat_attachments"."sha256" is null or octet_length("chat_attachments"."sha256") = 32)
);
--> statement-breakpoint
ALTER TABLE "chat_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "chat_folders" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_folders_organization_id_id_key" UNIQUE("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "chat_folders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "chat_knowledge_bases" (
	"organization_id" uuid NOT NULL,
	"chat_id" uuid NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_knowledge_bases_pkey" PRIMARY KEY("chat_id","knowledge_base_id")
);
--> statement-breakpoint
ALTER TABLE "chat_knowledge_bases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "chat_message_citations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"knowledge_base_id" uuid,
	"knowledge_document_id" uuid,
	"chunk_id" uuid,
	"page" integer,
	"rank" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_message_citations_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "chat_message_citations_organization_id_message_id_rank_key" UNIQUE("organization_id","message_id","rank")
);
--> statement-breakpoint
ALTER TABLE "chat_message_citations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "chat_message_feedback" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" text NOT NULL,
	"correction_text" text,
	"is_train_eligible" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_message_feedback_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "chat_message_feedback_organization_id_message_id_user_id_key" UNIQUE("organization_id","message_id","user_id"),
	CONSTRAINT "chat_message_feedback_rating_check" CHECK ("chat_message_feedback"."rating" in ('helpful', 'not_helpful'))
);
--> statement-breakpoint
ALTER TABLE "chat_message_feedback" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"chat_id" uuid NOT NULL,
	"role" text NOT NULL,
	"status" text NOT NULL,
	"content_text" text DEFAULT '' NOT NULL,
	"parts" jsonb NOT NULL,
	"author_user_id" uuid,
	"model_key" text,
	"vault_model_id" uuid,
	"agent_run_id" uuid,
	"variant_group_id" uuid,
	"variant_label" text,
	"input_tokens" bigint,
	"output_tokens" bigint,
	"cached_input_tokens" bigint,
	"reasoning_tokens" bigint,
	"cost_micros" bigint,
	"currency" char(3) DEFAULT 'USD' NOT NULL,
	"latency_ms" integer,
	"time_to_first_token_ms" integer,
	"data_location" text,
	"pii_masked" boolean DEFAULT false NOT NULL,
	"routed" boolean DEFAULT false NOT NULL,
	"error_code" text,
	"search_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', content_text)) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_messages_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "chat_messages_role_check" CHECK ("chat_messages"."role" in ('user', 'assistant')),
	CONSTRAINT "chat_messages_status_check" CHECK ("chat_messages"."status" in ('streaming', 'complete', 'stopped', 'interrupted', 'failed', 'superseded')),
	CONSTRAINT "chat_messages_data_location_check" CHECK ("chat_messages"."data_location" in ('local', 'provider', 'platform')),
	CONSTRAINT "chat_messages_variant_label_check" CHECK ("chat_messages"."variant_label" in ('a', 'b')),
	CONSTRAINT "chat_messages_variant_check" CHECK (("chat_messages"."variant_group_id" is null) = ("chat_messages"."variant_label" is null))
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "chats" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"title_generated" boolean DEFAULT false NOT NULL,
	"folder_id" uuid,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"pinned_at" timestamp with time zone,
	"is_private" boolean DEFAULT false NOT NULL,
	"agent_id" uuid,
	"knowledge_scope" text DEFAULT 'all' NOT NULL,
	"current_model_key" text,
	"last_message_at" timestamp with time zone,
	"message_count" integer DEFAULT 0 NOT NULL,
	"title_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', title)) STORED,
	"deleted_at" timestamp with time zone,
	"deleted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chats_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "chats_pinned_check" CHECK ("chats"."is_pinned" = ("chats"."pinned_at" is not null)),
	CONSTRAINT "chats_deleted_check" CHECK ("chats"."deleted_by_user_id" is null or "chats"."deleted_at" is not null),
	CONSTRAINT "chats_knowledge_scope_check" CHECK ("chats"."knowledge_scope" in ('all', 'selected', 'none'))
);
--> statement-breakpoint
ALTER TABLE "chats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_organization_id_chat_id_fkey" FOREIGN KEY ("organization_id","chat_id") REFERENCES "public"."chats"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_folders" ADD CONSTRAINT "chat_folders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_folders" ADD CONSTRAINT "chat_folders_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_knowledge_bases" ADD CONSTRAINT "chat_knowledge_bases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_knowledge_bases" ADD CONSTRAINT "chat_knowledge_bases_organization_id_chat_id_fkey" FOREIGN KEY ("organization_id","chat_id") REFERENCES "public"."chats"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_citations" ADD CONSTRAINT "chat_message_citations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_citations" ADD CONSTRAINT "chat_message_citations_organization_id_message_id_fkey" FOREIGN KEY ("organization_id","message_id") REFERENCES "public"."chat_messages"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_feedback" ADD CONSTRAINT "chat_message_feedback_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_feedback" ADD CONSTRAINT "chat_message_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_feedback" ADD CONSTRAINT "chat_message_feedback_organization_id_message_id_fkey" FOREIGN KEY ("organization_id","message_id") REFERENCES "public"."chat_messages"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_vault_model_id_vault_models_id_fk" FOREIGN KEY ("vault_model_id") REFERENCES "public"."vault_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_organization_id_chat_id_fkey" FOREIGN KEY ("organization_id","chat_id") REFERENCES "public"."chats"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_folder_id_chat_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."chat_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_deleted_by_user_id_users_id_fk" FOREIGN KEY ("deleted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_attachments_organization_id_chat_id_idx" ON "chat_attachments" USING btree ("organization_id","chat_id");--> statement-breakpoint
CREATE INDEX "chat_attachments_message_id_idx" ON "chat_attachments" USING btree ("message_id") WHERE "chat_attachments"."message_id" is not null;--> statement-breakpoint
CREATE INDEX "chat_attachments_uploaded_by_user_id_idx" ON "chat_attachments" USING btree ("uploaded_by_user_id") WHERE "chat_attachments"."uploaded_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "chat_attachments_unlinked_idx" ON "chat_attachments" USING btree ("created_at") WHERE "chat_attachments"."message_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_folders_organization_id_owner_user_id_name_key" ON "chat_folders" USING btree ("organization_id","owner_user_id",lower("name"));--> statement-breakpoint
CREATE INDEX "chat_folders_owner_user_id_idx" ON "chat_folders" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "chat_knowledge_bases_organization_id_knowledge_base_id_idx" ON "chat_knowledge_bases" USING btree ("organization_id","knowledge_base_id");--> statement-breakpoint
CREATE INDEX "chat_message_citations_organization_id_knowledge_document_id_idx" ON "chat_message_citations" USING btree ("organization_id","knowledge_document_id");--> statement-breakpoint
CREATE INDEX "chat_message_citations_knowledge_base_id_idx" ON "chat_message_citations" USING btree ("knowledge_base_id") WHERE "chat_message_citations"."knowledge_base_id" is not null;--> statement-breakpoint
CREATE INDEX "chat_message_feedback_organization_id_created_at_idx" ON "chat_message_feedback" USING btree ("organization_id","created_at") WHERE "chat_message_feedback"."is_train_eligible";--> statement-breakpoint
CREATE INDEX "chat_message_feedback_user_id_idx" ON "chat_message_feedback" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_messages_organization_id_chat_id_created_at_idx" ON "chat_messages" USING btree ("organization_id","chat_id","created_at","id");--> statement-breakpoint
CREATE INDEX "chat_messages_organization_id_created_at_idx" ON "chat_messages" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_search_tsv_idx" ON "chat_messages" USING gin ("search_tsv");--> statement-breakpoint
CREATE INDEX "chat_messages_vault_model_id_idx" ON "chat_messages" USING btree ("vault_model_id") WHERE "chat_messages"."vault_model_id" is not null;--> statement-breakpoint
CREATE INDEX "chat_messages_agent_run_id_idx" ON "chat_messages" USING btree ("agent_run_id") WHERE "chat_messages"."agent_run_id" is not null;--> statement-breakpoint
CREATE INDEX "chat_messages_author_user_id_idx" ON "chat_messages" USING btree ("author_user_id") WHERE "chat_messages"."author_user_id" is not null;--> statement-breakpoint
CREATE INDEX "chat_messages_streaming_idx" ON "chat_messages" USING btree ("updated_at") WHERE "chat_messages"."status" = 'streaming';--> statement-breakpoint
CREATE INDEX "chats_organization_id_owner_user_id_last_message_at_idx" ON "chats" USING btree ("organization_id","owner_user_id","last_message_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "chats"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "chats_organization_id_owner_user_id_deleted_at_idx" ON "chats" USING btree ("organization_id","owner_user_id","deleted_at" DESC NULLS LAST) WHERE "chats"."deleted_at" is not null;--> statement-breakpoint
CREATE INDEX "chats_organization_id_owner_user_id_pinned_at_idx" ON "chats" USING btree ("organization_id","owner_user_id","pinned_at" DESC NULLS LAST) WHERE "chats"."is_pinned" and "chats"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "chats_organization_id_folder_id_idx" ON "chats" USING btree ("organization_id","folder_id") WHERE "chats"."folder_id" is not null;--> statement-breakpoint
CREATE INDEX "chats_agent_id_idx" ON "chats" USING btree ("agent_id") WHERE "chats"."agent_id" is not null;--> statement-breakpoint
CREATE INDEX "chats_deleted_by_user_id_idx" ON "chats" USING btree ("deleted_by_user_id") WHERE "chats"."deleted_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "chats_title_tsv_idx" ON "chats" USING gin ("title_tsv");--> statement-breakpoint
CREATE INDEX "chats_deleted_at_idx" ON "chats" USING btree ("deleted_at") WHERE "chats"."deleted_at" is not null;--> statement-breakpoint
CREATE POLICY "chat_attachments_tenant_isolation" ON "chat_attachments" AS PERMISSIVE FOR ALL TO public USING (("chat_attachments"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("chat_attachments"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "chat_folders_tenant_isolation" ON "chat_folders" AS PERMISSIVE FOR ALL TO public USING (("chat_folders"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("chat_folders"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "chat_knowledge_bases_tenant_isolation" ON "chat_knowledge_bases" AS PERMISSIVE FOR ALL TO public USING (("chat_knowledge_bases"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("chat_knowledge_bases"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "chat_message_citations_tenant_isolation" ON "chat_message_citations" AS PERMISSIVE FOR ALL TO public USING (("chat_message_citations"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("chat_message_citations"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "chat_message_feedback_tenant_isolation" ON "chat_message_feedback" AS PERMISSIVE FOR ALL TO public USING (("chat_message_feedback"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("chat_message_feedback"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "chat_messages_tenant_isolation" ON "chat_messages" AS PERMISSIVE FOR ALL TO public USING (("chat_messages"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("chat_messages"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "chats_tenant_isolation" ON "chats" AS PERMISSIVE FOR ALL TO public USING (("chats"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("chats"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));