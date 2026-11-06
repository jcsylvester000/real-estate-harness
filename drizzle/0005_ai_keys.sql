CREATE TABLE "ai_keys" (
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"key_enc" text NOT NULL,
	"key_hint" text NOT NULL,
	"base_url" text DEFAULT '' NOT NULL,
	"model" text NOT NULL,
	"budget_model" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_keys_user_id_provider_pk" PRIMARY KEY("user_id","provider")
);
--> statement-breakpoint
ALTER TABLE "ai_keys" ADD CONSTRAINT "ai_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;