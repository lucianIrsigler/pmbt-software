CREATE TYPE "public"."user_role" AS ENUM('owner', 'admin');--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" "user_role" DEFAULT 'owner' NOT NULL;--> statement-breakpoint
-- Logins made before roles existed keep the access they had (everything). Set the owner's
-- own login to 'owner' with `pnpm user:create`.
UPDATE "user" SET "role" = 'admin';
