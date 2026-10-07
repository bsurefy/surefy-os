CREATE TABLE "model_access_rules" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"vault_model_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"team_id" uuid,
	"user_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_access_rules_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "model_access_rules_subject_key" UNIQUE NULLS NOT DISTINCT("organization_id","vault_model_id","subject_type","team_id","user_id"),
	CONSTRAINT "model_access_rules_subject_type_check" CHECK ("model_access_rules"."subject_type" in ('organization', 'team', 'user')),
	CONSTRAINT "model_access_rules_subject_check" CHECK (("model_access_rules"."subject_type" = 'organization' and "model_access_rules"."team_id" is null and "model_access_rules"."user_id" is null)
        or ("model_access_rules"."subject_type" = 'team' and "model_access_rules"."team_id" is not null and "model_access_rules"."user_id" is null)
        or ("model_access_rules"."subject_type" = 'user' and "model_access_rules"."team_id" is null and "model_access_rules"."user_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "model_access_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organization_keys" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key_version" integer NOT NULL,
	"wrapped_key" "bytea" NOT NULL,
	"wrap_iv" "bytea" NOT NULL,
	"wrap_auth_tag" "bytea" NOT NULL,
	"master_key_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"rotated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_keys_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "organization_keys_organization_id_key_version_key" UNIQUE("organization_id","key_version"),
	CONSTRAINT "organization_keys_status_check" CHECK ("organization_keys"."status" in ('active', 'retired')),
	CONSTRAINT "organization_keys_key_version_check" CHECK ("organization_keys"."key_version" > 0),
	CONSTRAINT "organization_keys_wrap_iv_check" CHECK (octet_length("organization_keys"."wrap_iv") = 12),
	CONSTRAINT "organization_keys_wrap_auth_tag_check" CHECK (octet_length("organization_keys"."wrap_auth_tag") = 16)
);
--> statement-breakpoint
ALTER TABLE "organization_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "vault_credentials" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"provider_key" text NOT NULL,
	"scope" text NOT NULL,
	"team_id" uuid,
	"owner_user_id" uuid,
	"is_primary" boolean DEFAULT true NOT NULL,
	"base_url" text,
	"secret_ciphertext" "bytea",
	"secret_iv" "bytea",
	"secret_auth_tag" "bytea",
	"data_key_version" integer,
	"secret_last4" text,
	"secret_fingerprint" text,
	"status" text DEFAULT 'active' NOT NULL,
	"status_reason_code" text,
	"status_checked_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"rotated_from_id" uuid,
	"created_by_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vault_credentials_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "vault_credentials_kind_check" CHECK ("vault_credentials"."kind" in ('ai_provider', 'local_server', 'search_provider', 'decision_service')),
	CONSTRAINT "vault_credentials_scope_enum_check" CHECK ("vault_credentials"."scope" in ('organization', 'team', 'personal')),
	CONSTRAINT "vault_credentials_status_check" CHECK ("vault_credentials"."status" in ('active', 'error', 'rate_limited', 'expired', 'revoked')),
	CONSTRAINT "vault_credentials_scope_check" CHECK (("vault_credentials"."scope" = 'organization' and "vault_credentials"."team_id" is null and "vault_credentials"."owner_user_id" is null)
        or ("vault_credentials"."scope" = 'team' and "vault_credentials"."team_id" is not null and "vault_credentials"."owner_user_id" is null)
        or ("vault_credentials"."scope" = 'personal' and "vault_credentials"."team_id" is null and "vault_credentials"."owner_user_id" is not null)),
	CONSTRAINT "vault_credentials_personal_kind_check" CHECK ("vault_credentials"."scope" <> 'personal' or "vault_credentials"."kind" = 'ai_provider'),
	CONSTRAINT "vault_credentials_search_scope_check" CHECK ("vault_credentials"."kind" <> 'search_provider' or "vault_credentials"."scope" = 'organization'),
	CONSTRAINT "vault_credentials_secret_check" CHECK ("vault_credentials"."kind" <> 'ai_provider' or "vault_credentials"."status" = 'revoked' or "vault_credentials"."secret_ciphertext" is not null),
	CONSTRAINT "vault_credentials_revoked_check" CHECK ("vault_credentials"."status" <> 'revoked'
        or ("vault_credentials"."secret_ciphertext" is null and "vault_credentials"."revoked_at" is not null and not "vault_credentials"."is_primary")),
	CONSTRAINT "vault_credentials_secret_complete_check" CHECK (num_nulls("vault_credentials"."secret_ciphertext", "vault_credentials"."secret_iv", "vault_credentials"."secret_auth_tag", "vault_credentials"."data_key_version") in (0, 4)),
	CONSTRAINT "vault_credentials_secret_iv_check" CHECK ("vault_credentials"."secret_iv" is null or octet_length("vault_credentials"."secret_iv") = 12),
	CONSTRAINT "vault_credentials_secret_auth_tag_check" CHECK ("vault_credentials"."secret_auth_tag" is null or octet_length("vault_credentials"."secret_auth_tag") = 16)
);
--> statement-breakpoint
ALTER TABLE "vault_credentials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "vault_models" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"credential_id" uuid,
	"model_key" text NOT NULL,
	"provider_key" text NOT NULL,
	"provider_model_id" text NOT NULL,
	"display_name" text NOT NULL,
	"type" text NOT NULL,
	"source" text NOT NULL,
	"trained_model_id" uuid,
	"supports_vision" boolean DEFAULT false NOT NULL,
	"supports_tools" boolean DEFAULT false NOT NULL,
	"context_window" integer,
	"embedding_dimensions" integer,
	"input_price_per_mtok_micros" bigint,
	"output_price_per_mtok_micros" bigint,
	"cached_input_price_per_mtok_micros" bigint,
	"currency" char(3) DEFAULT 'USD' NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vault_models_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "vault_models_organization_id_model_key_key" UNIQUE("organization_id","model_key"),
	CONSTRAINT "vault_models_type_check" CHECK ("vault_models"."type" in ('chat', 'embedding', 'decision')),
	CONSTRAINT "vault_models_source_enum_check" CHECK ("vault_models"."source" in ('provider', 'local', 'trained')),
	CONSTRAINT "vault_models_status_check" CHECK ("vault_models"."status" in ('available', 'unavailable', 'removed_upstream')),
	CONSTRAINT "vault_models_source_check" CHECK (("vault_models"."source" = 'local') = ("vault_models"."credential_id" is not null and "vault_models"."model_key" like 'local/%')
        and ("vault_models"."source" = 'trained') = ("vault_models"."trained_model_id" is not null and "vault_models"."model_key" like 'trained/%')
        and ("vault_models"."source" <> 'provider' or ("vault_models"."model_key" not like 'local/%'
          and "vault_models"."model_key" not like 'trained/%' and "vault_models"."model_key" not like 'platform/%'
          and "vault_models"."model_key" <> 'auto'))),
	CONSTRAINT "vault_models_embedding_check" CHECK ("vault_models"."type" <> 'embedding' or "vault_models"."embedding_dimensions" in (384, 768, 1024, 1536, 3072))
);
--> statement-breakpoint
ALTER TABLE "vault_models" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "vault_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"embedding_vault_model_id" uuid,
	"fallback" jsonb DEFAULT '{"version":1,"order":[],"onProviderError":true,"timeoutSeconds":null,"privateChatsLocalOnly":true}'::jsonb NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vault_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "model_access_rules" ADD CONSTRAINT "model_access_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_access_rules" ADD CONSTRAINT "model_access_rules_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_access_rules" ADD CONSTRAINT "model_access_rules_organization_id_vault_model_id_fkey" FOREIGN KEY ("organization_id","vault_model_id") REFERENCES "public"."vault_models"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_access_rules" ADD CONSTRAINT "model_access_rules_organization_id_team_id_fkey" FOREIGN KEY ("organization_id","team_id") REFERENCES "public"."teams"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_access_rules" ADD CONSTRAINT "model_access_rules_organization_id_user_id_fkey" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."organization_members"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_keys" ADD CONSTRAINT "organization_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_credentials" ADD CONSTRAINT "vault_credentials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_credentials" ADD CONSTRAINT "vault_credentials_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_credentials" ADD CONSTRAINT "vault_credentials_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_credentials" ADD CONSTRAINT "vault_credentials_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_credentials" ADD CONSTRAINT "vault_credentials_organization_id_team_id_fkey" FOREIGN KEY ("organization_id","team_id") REFERENCES "public"."teams"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_credentials" ADD CONSTRAINT "vault_credentials_rotated_from_id_fkey" FOREIGN KEY ("rotated_from_id") REFERENCES "public"."vault_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_models" ADD CONSTRAINT "vault_models_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_models" ADD CONSTRAINT "vault_models_organization_id_credential_id_fkey" FOREIGN KEY ("organization_id","credential_id") REFERENCES "public"."vault_credentials"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_settings" ADD CONSTRAINT "vault_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_settings" ADD CONSTRAINT "vault_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_settings" ADD CONSTRAINT "vault_settings_organization_id_embedding_vault_model_id_fkey" FOREIGN KEY ("organization_id","embedding_vault_model_id") REFERENCES "public"."vault_models"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "model_access_rules_organization_id_team_id_idx" ON "model_access_rules" USING btree ("organization_id","team_id") WHERE "model_access_rules"."team_id" is not null;--> statement-breakpoint
CREATE INDEX "model_access_rules_organization_id_user_id_idx" ON "model_access_rules" USING btree ("organization_id","user_id") WHERE "model_access_rules"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "model_access_rules_created_by_user_id_idx" ON "model_access_rules" USING btree ("created_by_user_id") WHERE "model_access_rules"."created_by_user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_keys_organization_id_active_key" ON "organization_keys" USING btree ("organization_id") WHERE "organization_keys"."status" = 'active';--> statement-breakpoint
CREATE INDEX "organization_keys_master_key_id_idx" ON "organization_keys" USING btree ("master_key_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vault_credentials_primary_search_key" ON "vault_credentials" USING btree ("organization_id") WHERE "vault_credentials"."kind" = 'search_provider' and "vault_credentials"."is_primary";--> statement-breakpoint
CREATE INDEX "vault_credentials_organization_id_kind_scope_idx" ON "vault_credentials" USING btree ("organization_id","kind","scope") WHERE "vault_credentials"."status" <> 'revoked';--> statement-breakpoint
CREATE INDEX "vault_credentials_organization_id_team_id_idx" ON "vault_credentials" USING btree ("organization_id","team_id") WHERE "vault_credentials"."team_id" is not null;--> statement-breakpoint
CREATE INDEX "vault_credentials_owner_user_id_idx" ON "vault_credentials" USING btree ("owner_user_id") WHERE "vault_credentials"."owner_user_id" is not null;--> statement-breakpoint
CREATE INDEX "vault_credentials_organization_id_secret_fingerprint_idx" ON "vault_credentials" USING btree ("organization_id","secret_fingerprint") WHERE "vault_credentials"."status" <> 'revoked';--> statement-breakpoint
CREATE INDEX "vault_credentials_expires_at_idx" ON "vault_credentials" USING btree ("expires_at") WHERE "vault_credentials"."status" = 'active' and "vault_credentials"."expires_at" is not null;--> statement-breakpoint
CREATE INDEX "vault_credentials_rotated_from_id_idx" ON "vault_credentials" USING btree ("rotated_from_id") WHERE "vault_credentials"."rotated_from_id" is not null;--> statement-breakpoint
CREATE INDEX "vault_credentials_revoked_at_idx" ON "vault_credentials" USING btree ("revoked_at") WHERE "vault_credentials"."status" = 'revoked';--> statement-breakpoint
CREATE INDEX "vault_credentials_created_by_user_id_idx" ON "vault_credentials" USING btree ("created_by_user_id") WHERE "vault_credentials"."created_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "vault_credentials_revoked_by_user_id_idx" ON "vault_credentials" USING btree ("revoked_by_user_id") WHERE "vault_credentials"."revoked_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "vault_models_organization_id_credential_id_idx" ON "vault_models" USING btree ("organization_id","credential_id") WHERE "vault_models"."credential_id" is not null;--> statement-breakpoint
CREATE INDEX "vault_models_organization_id_trained_model_id_idx" ON "vault_models" USING btree ("organization_id","trained_model_id") WHERE "vault_models"."trained_model_id" is not null;--> statement-breakpoint
CREATE INDEX "vault_models_organization_id_type_idx" ON "vault_models" USING btree ("organization_id","type") WHERE "vault_models"."is_enabled" and "vault_models"."status" = 'available';--> statement-breakpoint
CREATE INDEX "vault_settings_organization_id_embedding_vault_model_id_idx" ON "vault_settings" USING btree ("organization_id","embedding_vault_model_id");--> statement-breakpoint
CREATE INDEX "vault_settings_updated_by_user_id_idx" ON "vault_settings" USING btree ("updated_by_user_id") WHERE "vault_settings"."updated_by_user_id" is not null;--> statement-breakpoint
CREATE POLICY "model_access_rules_tenant_isolation" ON "model_access_rules" AS PERMISSIVE FOR ALL TO public USING (("model_access_rules"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("model_access_rules"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "organization_keys_tenant_isolation" ON "organization_keys" AS PERMISSIVE FOR ALL TO public USING (("organization_keys"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("organization_keys"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "vault_credentials_tenant_isolation" ON "vault_credentials" AS PERMISSIVE FOR ALL TO public USING (("vault_credentials"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("vault_credentials"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "vault_models_tenant_isolation" ON "vault_models" AS PERMISSIVE FOR ALL TO public USING (("vault_models"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("vault_models"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));--> statement-breakpoint
CREATE POLICY "vault_settings_tenant_isolation" ON "vault_settings" AS PERMISSIVE FOR ALL TO public USING (("vault_settings"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("vault_settings"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));