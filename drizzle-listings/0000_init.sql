-- Trigram matching for typo-tolerant search (available on Neon and in PGlite).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "listings_index";
--> statement-breakpoint
CREATE TABLE "listings_index"."import_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_name" text NOT NULL,
	"source" text NOT NULL,
	"rows_total" integer DEFAULT 0 NOT NULL,
	"inserted" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"problems" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings_index"."listings" (
	"code" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"name" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"availability" text DEFAULT 'available' NOT NULL,
	"transaction_type" text NOT NULL,
	"property_type" text NOT NULL,
	"property_sub_type" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT '' NOT NULL,
	"kind_inferred" boolean DEFAULT false NOT NULL,
	"price_php" numeric(16, 2) NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"city" text,
	"province" text,
	"bedrooms" integer,
	"bathrooms" integer,
	"floor_area_sqm" numeric(12, 2),
	"lot_area_sqm" numeric(14, 2),
	"foreign_eligible" boolean,
	"title_type" text DEFAULT '' NOT NULL,
	"listed_by" text DEFAULT '' NOT NULL,
	"listed_by_type" text DEFAULT '' NOT NULL,
	"listed_by_email" text DEFAULT '' NOT NULL,
	"grid_verification" text DEFAULT '' NOT NULL,
	"exclusive" boolean DEFAULT false NOT NULL,
	"source_created_at" timestamp with time zone,
	"source_published_at" timestamp with time zone,
	"source_updated_at" timestamp with time zone,
	"import_batch_id" integer,
	"name_norm" text DEFAULT '' NOT NULL,
	"place_norm" text DEFAULT '' NOT NULL,
	"kind_norm" text DEFAULT '' NOT NULL,
	"notes_norm" text DEFAULT '' NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(name_norm, '')), 'A') || setweight(to_tsvector('simple', coalesce(place_norm, '')), 'B') || setweight(to_tsvector('simple', coalesce(kind_norm, '')), 'C') || setweight(to_tsvector('simple', coalesce(notes_norm, '')), 'D')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "listings_search_idx" ON "listings_index"."listings" USING gin ("search");--> statement-breakpoint
CREATE INDEX "listings_search_trgm_idx" ON "listings_index"."listings" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "listings_filter_idx" ON "listings_index"."listings" USING btree ("transaction_type","property_type","price_php");--> statement-breakpoint
CREATE INDEX "listings_kind_idx" ON "listings_index"."listings" USING btree ("kind","price_php");--> statement-breakpoint
CREATE INDEX "listings_city_idx" ON "listings_index"."listings" USING btree ("city");--> statement-breakpoint
CREATE INDEX "listings_province_idx" ON "listings_index"."listings" USING btree ("province");--> statement-breakpoint
CREATE INDEX "listings_availability_idx" ON "listings_index"."listings" USING btree ("availability");--> statement-breakpoint
CREATE INDEX "listings_source_idx" ON "listings_index"."listings" USING btree ("source");