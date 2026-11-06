ALTER TABLE "ai_keys" ADD COLUMN "id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_keys" ADD COLUMN "name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_keys" DROP CONSTRAINT "ai_keys_user_id_provider_pk";--> statement-breakpoint
ALTER TABLE "ai_keys" ADD CONSTRAINT "ai_keys_id_pk" PRIMARY KEY("id");--> statement-breakpoint
CREATE INDEX "ai_keys_user_idx" ON "ai_keys" USING btree ("user_id");
