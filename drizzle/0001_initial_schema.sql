CREATE TYPE "public"."appointment_status" AS ENUM('booked', 'done', 'no_show', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."booking_source" AS ENUM('web', 'app');--> statement-breakpoint
CREATE TYPE "public"."service_kind" AS ENUM('human', 'animal');--> statement-breakpoint
CREATE TABLE "appointment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"pet_id" uuid,
	"service_id" uuid NOT NULL,
	"during" "tstzrange" NOT NULL,
	"status" "appointment_status" DEFAULT 'booked' NOT NULL,
	"source" "booking_source" NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"manage_token" text NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_manage_token_unique" UNIQUE("manage_token"),
	CONSTRAINT "appointment_during_bounded" CHECK (not isempty(during) and not lower_inf(during) and not upper_inf(during)),
	CONSTRAINT "appointment_cancelled_at_matches_status" CHECK (("appointment"."status" = 'cancelled') = ("appointment"."cancelled_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "appointment_product" (
	"appointment_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"price_cents" integer NOT NULL,
	CONSTRAINT "appointment_product_appointment_id_product_id_pk" PRIMARY KEY("appointment_id","product_id"),
	CONSTRAINT "appointment_product_qty_positive" CHECK ("appointment_product"."qty" > 0),
	CONSTRAINT "appointment_product_price_non_negative" CHECK ("appointment_product"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "client" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"notes" text DEFAULT '' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"species" text NOT NULL,
	"breed" text,
	"notes" text DEFAULT '' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pet_id_client_id_key" UNIQUE("id","client_id")
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_cents" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "product_price_non_negative" CHECK ("product"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "service" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"for_kind" "service_kind" NOT NULL,
	"duration_min" integer NOT NULL,
	"buffer_min" integer DEFAULT 10 NOT NULL,
	"price_cents" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "service_duration_positive" CHECK ("service"."duration_min" > 0),
	CONSTRAINT "service_buffer_non_negative" CHECK ("service"."buffer_min" >= 0),
	CONSTRAINT "service_price_non_negative" CHECK ("service"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"business_name" text NOT NULL,
	"min_notice_hours" integer DEFAULT 12 NOT NULL,
	"max_days_ahead" integer DEFAULT 42 NOT NULL,
	"slot_step_min" integer DEFAULT 30 NOT NULL,
	"cancel_cutoff_hours" integer DEFAULT 24 NOT NULL,
	CONSTRAINT "settings_single_row" CHECK ("settings"."id" = 1),
	CONSTRAINT "settings_min_notice_non_negative" CHECK ("settings"."min_notice_hours" >= 0),
	CONSTRAINT "settings_max_days_ahead_positive" CHECK ("settings"."max_days_ahead" > 0),
	CONSTRAINT "settings_slot_step_positive" CHECK ("settings"."slot_step_min" > 0),
	CONSTRAINT "settings_cancel_cutoff_non_negative" CHECK ("settings"."cancel_cutoff_hours" >= 0)
);
--> statement-breakpoint
CREATE TABLE "time_off" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"during" "tstzrange" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_off_during_bounded" CHECK (not isempty(during) and not lower_inf(during) and not upper_inf(during))
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "working_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"weekday" smallint NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	CONSTRAINT "working_hours_weekday_range" CHECK ("working_hours"."weekday" between 0 and 6),
	CONSTRAINT "working_hours_end_after_start" CHECK ("working_hours"."end_time" > "working_hours"."start_time")
);
--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_pet_belongs_to_client_fk" FOREIGN KEY ("pet_id","client_id") REFERENCES "public"."pet"("id","client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_product" ADD CONSTRAINT "appointment_product_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_product" ADD CONSTRAINT "appointment_product_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet" ADD CONSTRAINT "pet_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_during_start_idx" ON "appointment" USING btree (lower("during"));--> statement-breakpoint
CREATE INDEX "appointment_client_id_idx" ON "appointment" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "appointment_pet_id_idx" ON "appointment" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "client_name_trgm_idx" ON "client" USING gin (lower("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "client_phone_idx" ON "client" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "pet_client_id_idx" ON "pet" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "working_hours_weekday_idx" ON "working_hours" USING btree ("weekday");