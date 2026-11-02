-- Custom migration: Drizzle can't model exclusion constraints.
-- Two `booked` appointments may never overlap. `during` already includes the buffer.
-- Violations raise SQLSTATE 23P01 (exclusion_violation), mapped to SlotTakenError in the domain.
ALTER TABLE "appointment"
  ADD CONSTRAINT "appointment_no_overlap"
  EXCLUDE USING gist ("during" WITH &&)
  WHERE ("status" = 'booked');
