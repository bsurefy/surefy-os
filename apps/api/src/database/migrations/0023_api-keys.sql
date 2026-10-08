CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" "bytea",
	"scopes" text[] NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"last_used_ip" "inet",
	"created_by_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "api_keys_status_check" CHECK ("api_keys"."status" in ('active', 'revoked')),
	CONSTRAINT "api_keys_scopes_check" CHECK (cardinality("api_keys"."scopes") > 0),
	CONSTRAINT "api_keys_key_hash_check" CHECK (octet_length("api_keys"."key_hash") = 32),
	CONSTRAINT "api_keys_state_check" CHECK (("api_keys"."status" = 'active') = ("api_keys"."key_hash" is not null)
        and ("api_keys"."status" = 'revoked') = ("api_keys"."revoked_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_organization_id_created_at_id_idx" ON "api_keys" USING btree ("organization_id","created_at" desc,"id" desc);--> statement-breakpoint
CREATE INDEX "api_keys_created_by_user_id_idx" ON "api_keys" USING btree ("created_by_user_id") WHERE "api_keys"."created_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "api_keys_revoked_by_user_id_idx" ON "api_keys" USING btree ("revoked_by_user_id") WHERE "api_keys"."revoked_by_user_id" is not null;--> statement-breakpoint
CREATE INDEX "api_keys_revoked_at_idx" ON "api_keys" USING btree ("revoked_at") WHERE "api_keys"."status" = 'revoked';--> statement-breakpoint
CREATE POLICY "api_keys_tenant_isolation" ON "api_keys" AS PERMISSIVE FOR ALL TO public USING (("api_keys"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system')) WITH CHECK (("api_keys"."organization_id" = nullif(current_setting('app.org_id', true), '')::uuid or coalesce(current_setting('app.scope', true), '') = 'system'));