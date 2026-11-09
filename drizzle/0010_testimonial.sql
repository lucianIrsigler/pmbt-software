CREATE TABLE "testimonial" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote" text NOT NULL,
	"author" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
-- The business is now Daisy Healing. Rename only the old seed default, never a name the
-- owner chose herself.
UPDATE "settings" SET "business_name" = 'Daisy Healing' WHERE "business_name" = 'PBMT & Natural Products';
