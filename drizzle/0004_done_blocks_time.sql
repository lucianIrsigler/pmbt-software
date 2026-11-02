-- Custom migration: a visit marked "done" keeps its time slot blocked.
-- Only cancelled and "didn't come" (no_show) appointments free their time.
-- Must match BLOCKING_STATUSES in src/domain/slots.ts.
ALTER TABLE "appointment" DROP CONSTRAINT "appointment_no_overlap";
--> statement-breakpoint
ALTER TABLE "appointment"
  ADD CONSTRAINT "appointment_no_overlap"
  EXCLUDE USING gist ("during" WITH &&)
  WHERE ("status" IN ('booked', 'done'));
