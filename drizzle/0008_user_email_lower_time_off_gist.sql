-- Login emails are unique regardless of case (they are lower-cased on the way in, but the
-- database now enforces it). Create the new index before dropping the old constraint.
CREATE UNIQUE INDEX "user_email_lower_idx" ON "user" USING btree (lower("email"));--> statement-breakpoint
ALTER TABLE "user" DROP CONSTRAINT "user_email_unique";--> statement-breakpoint
-- Time off is looked up by overlap (calendar, availability).
CREATE INDEX "time_off_during_idx" ON "time_off" USING gist ("during");
