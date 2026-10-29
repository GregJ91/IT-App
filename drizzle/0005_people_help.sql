CREATE TABLE "help_article" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"category_id" integer,
	"published" boolean DEFAULT false NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"created_by_id" text,
	"updated_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "help_article_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "help_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"helpful" boolean NOT NULL,
	"solved_job" boolean DEFAULT false NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "help_image" (
	"id" serial PRIMARY KEY NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"uploaded_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people_change" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"user_id" text,
	"job_title" text DEFAULT '' NOT NULL,
	"site_id" integer,
	"manager" text DEFAULT '' NOT NULL,
	"date" date NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"done_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "people_task" (
	"id" serial PRIMARY KEY NOT NULL,
	"change_id" integer NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'task' NOT NULL,
	"asset_id" integer,
	"sort" integer DEFAULT 0 NOT NULL,
	"done_at" timestamp with time zone,
	"done_by_id" text
);
--> statement-breakpoint
CREATE TABLE "people_template_task" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "help_article" ADD CONSTRAINT "help_article_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_article" ADD CONSTRAINT "help_article_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_article" ADD CONSTRAINT "help_article_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_feedback" ADD CONSTRAINT "help_feedback_article_id_help_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."help_article"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_feedback" ADD CONSTRAINT "help_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_image" ADD CONSTRAINT "help_image_uploaded_by_id_user_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_change" ADD CONSTRAINT "people_change_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_change" ADD CONSTRAINT "people_change_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_change" ADD CONSTRAINT "people_change_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_task" ADD CONSTRAINT "people_task_change_id_people_change_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."people_change"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_task" ADD CONSTRAINT "people_task_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_task" ADD CONSTRAINT "people_task_done_by_id_user_id_fk" FOREIGN KEY ("done_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "help_article_search_idx" ON "help_article" USING gin (to_tsvector('english', "title" || ' ' || "summary" || ' ' || "body"));--> statement-breakpoint
CREATE UNIQUE INDEX "help_feedback_article_user_idx" ON "help_feedback" USING btree ("article_id","user_id");--> statement-breakpoint
CREATE INDEX "people_change_status_date_idx" ON "people_change" USING btree ("status","date");--> statement-breakpoint
CREATE INDEX "people_task_change_idx" ON "people_task" USING btree ("change_id");--> statement-breakpoint
INSERT INTO "people_template_task" ("kind", "title", "sort") VALUES
  ('starter', 'Create their email account', 10),
  ('starter', 'Add them to Slack and the right channels', 20),
  ('starter', 'Assign software licences', 30),
  ('starter', 'Set up their laptop or desktop', 40),
  ('starter', 'Set up their phone and authenticator app', 50),
  ('starter', 'Add printer and scanner access', 60),
  ('starter', 'Show them how to raise an IT job', 70),
  ('leaver', 'Disable their email account at the end of their last day', 10),
  ('leaver', 'Hand over or forward their email and files', 20),
  ('leaver', 'Remove them from Slack', 30),
  ('leaver', 'Free up their software licences', 40),
  ('leaver', 'Change any shared passwords they knew', 50),
  ('leaver', 'Wipe returned kit before it''s reused', 60);
