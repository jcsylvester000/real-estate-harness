-- CQRS: search columns move from the write model (listings) to the listing_search read model.
CREATE TABLE "listings_index"."buyer_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"criteria" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings_index"."events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings_index"."listing_search" (
	"code" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"availability" text NOT NULL,
	"transaction_type" text NOT NULL,
	"property_type" text NOT NULL,
	"kind" text NOT NULL,
	"price_php" numeric(16, 2) NOT NULL,
	"city" text,
	"province" text,
	"region" text,
	"location_tier" text DEFAULT 'unknown' NOT NULL,
	"bedrooms" integer,
	"area_sqm" real,
	"price_per_sqm" real,
	"features" text[] DEFAULT '{}'::text[] NOT NULL,
	"quality" real DEFAULT 0 NOT NULL,
	"card" jsonb NOT NULL,
	"analysis" jsonb NOT NULL,
	"sort_date" timestamp with time zone NOT NULL,
	"name_norm" text DEFAULT '' NOT NULL,
	"place_norm" text DEFAULT '' NOT NULL,
	"kind_norm" text DEFAULT '' NOT NULL,
	"notes_norm" text DEFAULT '' NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(name_norm, '')), 'A') || setweight(to_tsvector('simple', coalesce(place_norm, '')), 'B') || setweight(to_tsvector('simple', coalesce(kind_norm, '')), 'C') || setweight(to_tsvector('simple', coalesce(notes_norm, '')), 'D')) STORED,
	"projected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings_index"."listing_stats" (
	"key" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings_index"."match_results" (
	"profile_id" uuid NOT NULL,
	"code" text NOT NULL,
	"score" real NOT NULL,
	"breakdown" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_results_profile_id_code_pk" PRIMARY KEY("profile_id","code")
);
--> statement-breakpoint
CREATE TABLE "listings_index"."projection_state" (
	"name" text PRIMARY KEY NOT NULL,
	"last_event_id" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"schema_version" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "listings_index"."listings_search_idx";--> statement-breakpoint
DROP INDEX "listings_index"."listings_search_trgm_idx";--> statement-breakpoint
DROP INDEX "listings_index"."listings_filter_idx";--> statement-breakpoint
DROP INDEX "listings_index"."listings_kind_idx";--> statement-breakpoint
DROP INDEX "listings_index"."listings_city_idx";--> statement-breakpoint
DROP INDEX "listings_index"."listings_province_idx";--> statement-breakpoint
DROP INDEX "listings_index"."listings_availability_idx";--> statement-breakpoint
DROP INDEX "listings_index"."listings_source_idx";--> statement-breakpoint
CREATE INDEX "events_type_idx" ON "listings_index"."events" USING btree ("type","id");--> statement-breakpoint
CREATE INDEX "ls_search_idx" ON "listings_index"."listing_search" USING gin ("search");--> statement-breakpoint
CREATE INDEX "ls_search_trgm_idx" ON "listings_index"."listing_search" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "ls_features_idx" ON "listings_index"."listing_search" USING gin ("features");--> statement-breakpoint
CREATE INDEX "ls_filter_idx" ON "listings_index"."listing_search" USING btree ("availability","transaction_type","property_type","price_php");--> statement-breakpoint
CREATE INDEX "ls_kind_idx" ON "listings_index"."listing_search" USING btree ("kind","price_php");--> statement-breakpoint
CREATE INDEX "ls_city_idx" ON "listings_index"."listing_search" USING btree ("city");--> statement-breakpoint
CREATE INDEX "ls_province_idx" ON "listings_index"."listing_search" USING btree ("province");--> statement-breakpoint
CREATE INDEX "ls_region_idx" ON "listings_index"."listing_search" USING btree ("region");--> statement-breakpoint
CREATE INDEX "ls_sort_idx" ON "listings_index"."listing_search" USING btree ("sort_date");--> statement-breakpoint
CREATE INDEX "mr_code_idx" ON "listings_index"."match_results" USING btree ("code","score");--> statement-breakpoint
CREATE INDEX "mr_profile_idx" ON "listings_index"."match_results" USING btree ("profile_id","score");--> statement-breakpoint
ALTER TABLE "listings_index"."listings" DROP COLUMN "search";--> statement-breakpoint
ALTER TABLE "listings_index"."listings" DROP COLUMN "name_norm";--> statement-breakpoint
ALTER TABLE "listings_index"."listings" DROP COLUMN "place_norm";--> statement-breakpoint
ALTER TABLE "listings_index"."listings" DROP COLUMN "kind_norm";--> statement-breakpoint
ALTER TABLE "listings_index"."listings" DROP COLUMN "notes_norm";--> statement-breakpoint
ALTER TABLE "listings_index"."listings" DROP COLUMN "search_text";
