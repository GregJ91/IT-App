CREATE TABLE "asset" (
	"id" serial PRIMARY KEY NOT NULL,
	"tag" text NOT NULL,
	"name" text NOT NULL,
	"type_id" integer,
	"make" text DEFAULT '' NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"serial" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'spare' NOT NULL,
	"site_id" integer,
	"location" text DEFAULT '' NOT NULL,
	"assigned_user_id" text,
	"assigned_to" text DEFAULT '' NOT NULL,
	"ip_address" text DEFAULT '' NOT NULL,
	"mac_address" text DEFAULT '' NOT NULL,
	"purchase_date" date,
	"purchase_cost_pence" integer,
	"supplier" text DEFAULT '' NOT NULL,
	"warranty_until" date,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_tag_unique" UNIQUE("tag")
);
--> statement-breakpoint
CREATE TABLE "asset_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_id" integer NOT NULL,
	"actor_id" text,
	"type" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_photo" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_id" integer NOT NULL,
	"uploaded_by_id" text,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_photo_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "asset_type" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_printer" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	CONSTRAINT "asset_type_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "licence" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"supplier" text DEFAULT '' NOT NULL,
	"seats" integer,
	"renews_on" date,
	"cost_pence" integer,
	"notes" text DEFAULT '' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_item" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"site_id" integer,
	"location" text DEFAULT '' NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"min_quantity" integer DEFAULT 0 NOT NULL,
	"supplier" text DEFAULT '' NOT NULL,
	"fits" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_item_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "stock_movement" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"delta" integer NOT NULL,
	"quantity_after" integer NOT NULL,
	"reason" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"ticket_id" integer,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "asset_id" integer;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_type_id_asset_type_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."asset_type"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_assigned_user_id_user_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_event" ADD CONSTRAINT "asset_event_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_event" ADD CONSTRAINT "asset_event_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_photo" ADD CONSTRAINT "asset_photo_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_photo" ADD CONSTRAINT "asset_photo_uploaded_by_id_user_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_item" ADD CONSTRAINT "stock_item_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_item_id_stock_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."stock_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_type_idx" ON "asset" USING btree ("type_id");--> statement-breakpoint
CREATE INDEX "asset_site_idx" ON "asset" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "asset_assigned_idx" ON "asset" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX "asset_event_asset_idx" ON "asset_event" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "asset_photo_asset_idx" ON "asset_photo" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "stock_movement_item_idx" ON "stock_movement" USING btree ("item_id");--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE set null ON UPDATE no action;