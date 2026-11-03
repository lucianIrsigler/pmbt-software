-- Hand-edited: add the column, fill existing rows with the service's current price
-- (the best we know), then make it required.
ALTER TABLE "appointment" ADD COLUMN "price_cents" integer;--> statement-breakpoint
UPDATE "appointment" SET "price_cents" = "service"."price_cents" FROM "service" WHERE "service"."id" = "appointment"."service_id";--> statement-breakpoint
ALTER TABLE "appointment" ALTER COLUMN "price_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_price_non_negative" CHECK ("appointment"."price_cents" >= 0);
