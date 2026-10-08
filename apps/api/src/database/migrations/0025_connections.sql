CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider_key" text NOT NULL,
	"bridge_id" uuid,
	"auth_type" text NOT NULL,
	"name" text NOT NULL,
	"scope" text NOT NULL,
	"team_id" uuid,
	"owner_user_id" uuid,
	"base_url" text,
	"secret_ciphertext" "bytea",
	"secret_iv" "bytea",
	"secret_auth_tag" "bytea",
	"data_key_version" integer,
	"secret_last4" text,
	"secret_fingerprint" text,
	"oauth_scopes" text[],
	"external_account_id" text,
	"external_account_label" text,
	"status" text DEFAULT 'active' NOT NULL,
	"status_reason_code" text,
	"token_expires_at" timestamp with time zone,
	"last_refreshed_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"connected_by_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connections_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "connections_auth_type_check" CHECK ("connections"."auth_type" in ('oauth2', 'api_key', 'basic', 'bearer', 'none')),
	CONSTRAINT "connections_scope_enum_check" CHECK ("connections"."scope" in ('personal', 'team', 'organization')),
	CONSTRAINT "connections_status_check" CHECK ("connections"."status" in ('active', 'expired', 'revoked', 'error')),
	CONSTRAINT "connections_scope_check" CHECK (("connections"."scope" = 'organization' and "connections"."team_id" is null and "connections"."owner_user_id" is null)
        or ("connections"."scope" = 'team' and "connections"."team_id" is not null and "connections"."owner_user_id" is null)
        or ("connections"."scope" = 'personal' and "connections"."team_id" is null and "connections"."owner_user_id" is not null)),
	CONSTRAINT "connections_secret_check" CHECK ("connections"."status" = 'revoked' or "connections"."auth_type" = 'none' or "connections"."secret_ciphertext" is not null),
	CONSTRAINT "connections_revoked_check" CHECK (("connections"."status" = 'revoked') = ("connections"."revoked_at" is not null)
        and ("connections"."status" <> 'revoked' or "connections"."secret_ciphertext" is null)),
	CONSTRAINT "connections_secret_complete_check" CHECK (num_nulls("connections"."secret_ciphertext", "connections"."secret_iv", "connections"."secret_auth_tag", "connections"."data_key_version") in (0, 4)),
	CONSTRAINT "connections_secret_iv_check" CHECK ("connections"."secret_iv" is null or octet_length("connections"."secret_iv") = 12),
	CONSTRAINT "connections_secret_auth_tag_check" CHECK ("connections"."secret_auth_tag" is null or octet_length("connections"."secret_auth_tag") = 16)
);
--> statement-breakpoint
ALTER TABLE "connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_organization_id_team_id_fkey" FOREIGN KEY ("organization_id","team_id") REFERENCES "public"."teams"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connections_organization_id_provider_key_idx" ON "connections" USING btree ("organization_id","provider_key") WHERE "connections"."status" <> 'revoked';--> statement-breakpoint
CREATE INDEX "connections_organization_id_team_id_idx" ON "connections" USING btree ("organization_id","team_id") WHERE "connections"."team_id" is not null;--> statement-breakpoint
CREATE INDEX "connections_owner_user_id_idx" ON "connections" USING btree ("owner_user_id") WHERE "connections"."owner_user_id" is not null;--> statement-breakpoint
CREATE INDEX "connections_bridge_id_idx" ON "connections" USING btree ("bridge_id") WHERE "connections"."bridge_id" is not null;--> statement-breakpoint
CREATE INDEX "connections_token_expires_at_idx" ON "connections" USING btree ("token_expires_at") WHERE "connections"."status" = 'active' and "connections"."auth_type" = 'oauth2';--> statement-breakpoint
CREATE INDEX "connections_revoked_at_idx" ON "connections" USING btree ("revoked_at") WHERE "connections"."status" = 'revoked';--> statement-breakpoint
CREATE INDEX "connections_connected_by_user_id_idx" ON "connections" USING btree ("connected_by_user_id") WHERE "connections"."connected_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "connections_revoked_by_user_id_idx" ON "connections" USING btree ("revoked_by_user_id") WHERE "connections"."revoked_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "connections_organization_id_secret_fingerprint_idx" ON "connections" USING btree ("organization_id","secret_fingerprint") WHERE "connections"."status" <> 'revoked';--> statement-breakpoint
CREATE POLICY "connections_tenant_isolation" ON "connections" AS PERMISSIVE FOR ALL TO public USING (("connections"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("connections"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));