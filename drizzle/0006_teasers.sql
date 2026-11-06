CREATE TABLE "teaser_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"mime" text NOT NULL,
	"data" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"source" text DEFAULT 'upload' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"credit" text DEFAULT '' NOT NULL,
	"source_url" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teasers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"template_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"thumb" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teaser_assets" ADD CONSTRAINT "teaser_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teasers" ADD CONSTRAINT "teasers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "teaser_assets_user_idx" ON "teaser_assets" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "teasers_user_idx" ON "teasers" USING btree ("user_id","updated_at");