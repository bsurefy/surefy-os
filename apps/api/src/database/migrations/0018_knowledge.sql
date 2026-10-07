CREATE TABLE "knowledge_base_access" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"team_id" uuid,
	"user_id" uuid,
	"level" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_base_access_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "knowledge_base_access_subject_key" UNIQUE NULLS NOT DISTINCT("organization_id","knowledge_base_id","subject_type","team_id","user_id"),
	CONSTRAINT "knowledge_base_access_subject_type_check" CHECK ("knowledge_base_access"."subject_type" in ('team', 'user')),
	CONSTRAINT "knowledge_base_access_level_check" CHECK ("knowledge_base_access"."level" in ('search', 'manage')),
	CONSTRAINT "knowledge_base_access_subject_check" CHECK (("knowledge_base_access"."subject_type" = 'team' and "knowledge_base_access"."team_id" is not null and "knowledge_base_access"."user_id" is null)
        or ("knowledge_base_access"."subject_type" = 'user' and "knowledge_base_access"."user_id" is not null and "knowledge_base_access"."team_id" is null))
);
--> statement-breakpoint
ALTER TABLE "knowledge_base_access" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "knowledge_bases" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_local_only" boolean DEFAULT false NOT NULL,
	"chunking_preset" text DEFAULT 'default' NOT NULL,
	"embedding_model_key" text,
	"pending_embedding_model_key" text,
	"source_count" integer DEFAULT 0 NOT NULL,
	"document_count" integer DEFAULT 0 NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_bases_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "knowledge_bases_chunking_preset_check" CHECK ("knowledge_bases"."chunking_preset" in ('default', 'long_documents', 'faqs')),
	CONSTRAINT "knowledge_bases_pending_check" CHECK ("knowledge_bases"."pending_embedding_model_key" is null or "knowledge_bases"."pending_embedding_model_key" <> "knowledge_bases"."embedding_model_key")
);
--> statement-breakpoint
ALTER TABLE "knowledge_bases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"content" text NOT NULL,
	"page_from" integer,
	"page_to" integer,
	"heading_path" text[],
	"token_count" integer NOT NULL,
	"embedding" vector NOT NULL,
	"embedding_model" text NOT NULL,
	"embedding_dimensions" smallint GENERATED ALWAYS AS (vector_dims(embedding)) STORED NOT NULL,
	"content_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_chunks_organization_id_document_id_embedding_model_ordinal_key" UNIQUE("organization_id","document_id","embedding_model","ordinal"),
	CONSTRAINT "knowledge_chunks_embedding_dimensions_check" CHECK ("knowledge_chunks"."embedding_dimensions" in (384, 768, 1024, 1536, 3072))
);
--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "knowledge_documents" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"external_ref" text NOT NULL,
	"title" text NOT NULL,
	"mime_type" text,
	"size_bytes" bigint,
	"page_count" integer,
	"content_hash" text,
	"object_key" text,
	"parsed_object_key" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_code" text,
	"embedding_model_key" text,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"citation_count" integer DEFAULT 0 NOT NULL,
	"indexed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_documents_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "knowledge_documents_organization_id_source_id_external_ref_key" UNIQUE("organization_id","source_id","external_ref"),
	CONSTRAINT "knowledge_documents_status_check" CHECK ("knowledge_documents"."status" in ('pending', 'parsing', 'embedding', 'ready', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "knowledge_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"connection_id" uuid,
	"config" jsonb,
	"file_name" text,
	"content_type" text,
	"size_bytes" bigint,
	"sha256" "bytea",
	"ocr_mode" text DEFAULT 'auto' NOT NULL,
	"status" text NOT NULL,
	"progress_percent" smallint DEFAULT 0 NOT NULL,
	"error_code" text,
	"last_synced_at" timestamp with time zone,
	"next_sync_at" timestamp with time zone,
	"added_by_user_id" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_sources_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "knowledge_sources_type_check" CHECK ("knowledge_sources"."type" in ('file', 'link', 'connector')),
	CONSTRAINT "knowledge_sources_ocr_mode_check" CHECK ("knowledge_sources"."ocr_mode" in ('auto', 'force', 'off')),
	CONSTRAINT "knowledge_sources_status_check" CHECK ("knowledge_sources"."status" in ('uploading', 'queued', 'processing', 'ready', 'partially_failed', 'failed', 'paused')),
	CONSTRAINT "knowledge_sources_progress_percent_check" CHECK ("knowledge_sources"."progress_percent" between 0 and 100),
	CONSTRAINT "knowledge_sources_type_fields_check" CHECK (("knowledge_sources"."type" = 'file' and "knowledge_sources"."file_name" is not null and "knowledge_sources"."size_bytes" is not null
          and "knowledge_sources"."sha256" is not null and "knowledge_sources"."connection_id" is null)
        or ("knowledge_sources"."type" = 'connector' and "knowledge_sources"."connection_id" is not null)
        or ("knowledge_sources"."type" = 'link' and "knowledge_sources"."connection_id" is null))
);
--> statement-breakpoint
ALTER TABLE "knowledge_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "knowledge_base_access" ADD CONSTRAINT "knowledge_base_access_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base_access" ADD CONSTRAINT "knowledge_base_access_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base_access" ADD CONSTRAINT "knowledge_base_access_organization_id_knowledge_base_id_fkey" FOREIGN KEY ("organization_id","knowledge_base_id") REFERENCES "public"."knowledge_bases"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base_access" ADD CONSTRAINT "knowledge_base_access_organization_id_team_id_fkey" FOREIGN KEY ("organization_id","team_id") REFERENCES "public"."teams"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base_access" ADD CONSTRAINT "knowledge_base_access_organization_id_user_id_fkey" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."organization_members"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_deleted_by_user_id_users_id_fk" FOREIGN KEY ("deleted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_organization_id_document_id_fkey" FOREIGN KEY ("organization_id","document_id") REFERENCES "public"."knowledge_documents"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_organization_id_knowledge_base_id_fkey" FOREIGN KEY ("organization_id","knowledge_base_id") REFERENCES "public"."knowledge_bases"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_organization_id_source_id_fkey" FOREIGN KEY ("organization_id","source_id") REFERENCES "public"."knowledge_sources"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_deleted_by_user_id_users_id_fk" FOREIGN KEY ("deleted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_organization_id_knowledge_base_id_fkey" FOREIGN KEY ("organization_id","knowledge_base_id") REFERENCES "public"."knowledge_bases"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_base_access_organization_id_team_id_idx" ON "knowledge_base_access" USING btree ("organization_id","team_id") WHERE "knowledge_base_access"."team_id" is not null;--> statement-breakpoint
CREATE INDEX "knowledge_base_access_organization_id_user_id_idx" ON "knowledge_base_access" USING btree ("organization_id","user_id") WHERE "knowledge_base_access"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_bases_organization_id_name_key" ON "knowledge_bases" USING btree ("organization_id",lower("name")) WHERE "knowledge_bases"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "knowledge_bases_organization_id_deleted_at_idx" ON "knowledge_bases" USING btree ("organization_id","deleted_at" DESC NULLS LAST) WHERE "knowledge_bases"."deleted_at" is not null;--> statement-breakpoint
CREATE INDEX "knowledge_bases_deleted_at_idx" ON "knowledge_bases" USING btree ("deleted_at") WHERE "knowledge_bases"."deleted_at" is not null;--> statement-breakpoint
CREATE INDEX "knowledge_bases_organization_id_pending_idx" ON "knowledge_bases" USING btree ("organization_id") WHERE "knowledge_bases"."pending_embedding_model_key" is not null;--> statement-breakpoint
CREATE INDEX "knowledge_bases_created_by_user_id_idx" ON "knowledge_bases" USING btree ("created_by_user_id") WHERE "knowledge_bases"."created_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "knowledge_chunks_organization_id_knowledge_base_id_embedding_model_idx" ON "knowledge_chunks" USING btree ("organization_id","knowledge_base_id","embedding_model");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_content_tsv_idx" ON "knowledge_chunks" USING gin ("content_tsv");--> statement-breakpoint
CREATE INDEX "knowledge_documents_organization_id_knowledge_base_id_status_idx" ON "knowledge_documents" USING btree ("organization_id","knowledge_base_id","status") WHERE "knowledge_documents"."status" <> 'ready';--> statement-breakpoint
CREATE INDEX "knowledge_documents_organization_id_knowledge_base_id_embedding_model_key_idx" ON "knowledge_documents" USING btree ("organization_id","knowledge_base_id","embedding_model_key");--> statement-breakpoint
CREATE INDEX "knowledge_sources_organization_id_knowledge_base_id_created_at_idx" ON "knowledge_sources" USING btree ("organization_id","knowledge_base_id","created_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "knowledge_sources_organization_id_sha256_idx" ON "knowledge_sources" USING btree ("organization_id","sha256") WHERE "knowledge_sources"."type" = 'file' and "knowledge_sources"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "knowledge_sources_organization_id_knowledge_base_id_deleted_at_idx" ON "knowledge_sources" USING btree ("organization_id","knowledge_base_id","deleted_at" DESC NULLS LAST) WHERE "knowledge_sources"."deleted_at" is not null;--> statement-breakpoint
CREATE INDEX "knowledge_sources_next_sync_at_idx" ON "knowledge_sources" USING btree ("next_sync_at") WHERE "knowledge_sources"."next_sync_at" is not null and "knowledge_sources"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "knowledge_sources_organization_id_status_idx" ON "knowledge_sources" USING btree ("organization_id","status") WHERE "knowledge_sources"."deleted_at" is null and "knowledge_sources"."status" <> 'ready';--> statement-breakpoint
CREATE INDEX "knowledge_sources_organization_id_connection_id_idx" ON "knowledge_sources" USING btree ("organization_id","connection_id") WHERE "knowledge_sources"."connection_id" is not null;--> statement-breakpoint
CREATE INDEX "knowledge_sources_deleted_at_idx" ON "knowledge_sources" USING btree ("deleted_at") WHERE "knowledge_sources"."deleted_at" is not null;--> statement-breakpoint
CREATE INDEX "knowledge_sources_added_by_user_id_idx" ON "knowledge_sources" USING btree ("added_by_user_id") WHERE "knowledge_sources"."added_by_user_id" is not null;--> statement-breakpoint
CREATE POLICY "knowledge_base_access_tenant_isolation" ON "knowledge_base_access" AS PERMISSIVE FOR ALL TO public USING (("knowledge_base_access"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("knowledge_base_access"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "knowledge_bases_tenant_isolation" ON "knowledge_bases" AS PERMISSIVE FOR ALL TO public USING (("knowledge_bases"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("knowledge_bases"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "knowledge_chunks_tenant_isolation" ON "knowledge_chunks" AS PERMISSIVE FOR ALL TO public USING (("knowledge_chunks"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("knowledge_chunks"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "knowledge_documents_tenant_isolation" ON "knowledge_documents" AS PERMISSIVE FOR ALL TO public USING (("knowledge_documents"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("knowledge_documents"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "knowledge_sources_tenant_isolation" ON "knowledge_sources" AS PERMISSIVE FOR ALL TO public USING (("knowledge_sources"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("knowledge_sources"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));