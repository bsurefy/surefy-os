CREATE TABLE "install_admins" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"granted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "install_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"installation_id" uuid DEFAULT uuidv7() NOT NULL,
	"signup_policy" text DEFAULT 'invite_only' NOT NULL,
	"org_creation_policy" text DEFAULT 'install_admins' NOT NULL,
	"settings" jsonb DEFAULT '{"version":1}'::jsonb NOT NULL,
	"data_key_wrapped" "bytea",
	"data_key_iv" "bytea",
	"data_key_auth_tag" "bytea",
	"data_key_master_key_id" text,
	"smtp_password_ciphertext" "bytea",
	"smtp_password_iv" "bytea",
	"smtp_password_auth_tag" "bytea",
	"smtp_password_data_key_version" integer,
	"setup_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "install_settings_id_check" CHECK ("install_settings"."id" = 1),
	CONSTRAINT "install_settings_signup_policy_check" CHECK ("install_settings"."signup_policy" in ('invite_only', 'open')),
	CONSTRAINT "install_settings_org_creation_policy_check" CHECK ("install_settings"."org_creation_policy" in ('install_admins', 'any_user')),
	CONSTRAINT "install_settings_data_key_complete_check" CHECK (num_nulls("install_settings"."data_key_wrapped", "install_settings"."data_key_iv", "install_settings"."data_key_auth_tag", "install_settings"."data_key_master_key_id") in (0, 4)),
	CONSTRAINT "install_settings_data_key_iv_check" CHECK ("install_settings"."data_key_iv" is null or octet_length("install_settings"."data_key_iv") = 12),
	CONSTRAINT "install_settings_data_key_auth_tag_check" CHECK ("install_settings"."data_key_auth_tag" is null or octet_length("install_settings"."data_key_auth_tag") = 16),
	CONSTRAINT "install_settings_smtp_password_complete_check" CHECK (num_nulls("install_settings"."smtp_password_ciphertext", "install_settings"."smtp_password_iv", "install_settings"."smtp_password_auth_tag", "install_settings"."smtp_password_data_key_version") in (0, 4)),
	CONSTRAINT "install_settings_smtp_password_iv_check" CHECK ("install_settings"."smtp_password_iv" is null or octet_length("install_settings"."smtp_password_iv") = 12),
	CONSTRAINT "install_settings_smtp_password_auth_tag_check" CHECK ("install_settings"."smtp_password_auth_tag" is null or octet_length("install_settings"."smtp_password_auth_tag") = 16)
);
--> statement-breakpoint
ALTER TABLE "install_admins" ADD CONSTRAINT "install_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "install_admins" ADD CONSTRAINT "install_admins_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "install_admins_granted_by_user_id_idx" ON "install_admins" USING btree ("granted_by_user_id") WHERE "install_admins"."granted_by_user_id" is not null;