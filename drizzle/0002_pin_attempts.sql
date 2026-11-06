CREATE TABLE "access_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"address_hash" text NOT NULL,
	"ok" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "access_attempts_addr_idx" ON "access_attempts" USING btree ("address_hash","created_at");