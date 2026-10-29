CREATE TABLE "net_client" (
	"id" serial PRIMARY KEY NOT NULL,
	"net_site_id" integer NOT NULL,
	"mac" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"wired" boolean DEFAULT false NOT NULL,
	"uplink_mac" text,
	"connected_at" timestamp with time zone,
	"online" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "net_connection" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"api_key_enc" text DEFAULT '' NOT NULL,
	"trust_cert" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_poll_at" timestamp with time zone,
	"last_ok_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "net_device" (
	"id" serial PRIMARY KEY NOT NULL,
	"net_site_id" integer NOT NULL,
	"external_id" text NOT NULL,
	"mac" text NOT NULL,
	"name" text NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"firmware" text DEFAULT '' NOT NULL,
	"online" boolean DEFAULT true NOT NULL,
	"uptime_sec" integer,
	"uplink_mac" text,
	"last_seen_at" timestamp with time zone,
	"down_since" timestamp with time zone,
	"alerted" boolean DEFAULT false NOT NULL,
	"asset_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "net_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"net_site_id" integer NOT NULL,
	"device_id" integer,
	"type" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "net_site" (
	"id" serial PRIMARY KEY NOT NULL,
	"connection_id" integer NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"site_id" integer,
	"wan_status" text DEFAULT 'unknown' NOT NULL,
	"isp" text,
	"latency_ms" integer,
	"client_count" integer,
	"clients_listed" boolean DEFAULT true NOT NULL,
	"wan_down_since" timestamp with time zone,
	"wan_alerted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "net_client" ADD CONSTRAINT "net_client_net_site_id_net_site_id_fk" FOREIGN KEY ("net_site_id") REFERENCES "public"."net_site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "net_device" ADD CONSTRAINT "net_device_net_site_id_net_site_id_fk" FOREIGN KEY ("net_site_id") REFERENCES "public"."net_site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "net_device" ADD CONSTRAINT "net_device_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "net_event" ADD CONSTRAINT "net_event_net_site_id_net_site_id_fk" FOREIGN KEY ("net_site_id") REFERENCES "public"."net_site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "net_event" ADD CONSTRAINT "net_event_device_id_net_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."net_device"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "net_site" ADD CONSTRAINT "net_site_connection_id_net_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."net_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "net_site" ADD CONSTRAINT "net_site_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "net_client_site_mac_idx" ON "net_client" USING btree ("net_site_id","mac");--> statement-breakpoint
CREATE INDEX "net_client_mac_idx" ON "net_client" USING btree ("mac");--> statement-breakpoint
CREATE UNIQUE INDEX "net_device_site_mac_idx" ON "net_device" USING btree ("net_site_id","mac");--> statement-breakpoint
CREATE INDEX "net_device_mac_idx" ON "net_device" USING btree ("mac");--> statement-breakpoint
CREATE INDEX "net_event_site_at_idx" ON "net_event" USING btree ("net_site_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "net_site_conn_ext_idx" ON "net_site" USING btree ("connection_id","external_id");