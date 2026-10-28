CREATE TABLE "app_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sla_policy" ADD COLUMN "counts" text DEFAULT 'any' NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "sla_paused_at" timestamp with time zone;